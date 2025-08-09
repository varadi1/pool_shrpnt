"""End-to-end tests for complete guest invitation flow."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import PartnerCompany
from api.models.guest import GuestGroupAssignment, GuestInvitation, GuestStatus, GuestUser
from api.models.notification import NotificationTemplate
from api.models.rbac import Group
from api.services.guests.guest_service import GuestService


@pytest.mark.asyncio
async def test_complete_guest_invitation_flow(db_session: AsyncSession):
    """Test the complete end-to-end guest invitation flow."""

    # Step 1: Setup - Create partner company and notification templates
    partner = PartnerCompany(
        company_code="E2E_PARTNER",
        name="End-to-End Test Partner",
        short_name="E2E",
    )
    db_session.add(partner)

    # Create notification templates
    email_template = NotificationTemplate(
        template_key="guest.invitation.en",
        channel="email",
        subject_template="Welcome to poolDRV - {{partner_company}}",
        body_template="Dear {{guest_name}}, You're invited by {{inviter_name}}. Accept: {{accept_link}}",
        locale="en",
    )
    teams_template = NotificationTemplate(
        template_key="guest.invitation.teams.en",
        channel="teams",
        subject_template="New Guest",
        body_template='{"summary": "Guest {{guest_email}} invited"}',
        locale="en",
    )
    db_session.add_all([email_template, teams_template])
    await db_session.commit()

    # Step 2: Invite Guest
    service = GuestService(db_session)

    mock_graph_invitation = {
        "id": "e2e-invitation-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?e2e=test",
        "invitedUserEmailAddress": "e2e.guest@example.com",
        "status": "PendingAcceptance",
    }

    with patch.object(
        service, "_create_b2b_invitation_with_retry", return_value=mock_graph_invitation
    ):
        with patch.object(
            service, "_send_invitation_notification", new_callable=AsyncMock
        ) as mock_notify:
            # Perform invitation
            guest = await service.invite_guest(
                email="e2e.guest@example.com",
                partner_company_id=partner.id,
                display_name="E2E Test Guest",
                role="partner_admin",
                invited_by="admin@company.com",
                send_notification=True,
                locale="en",
                correlation_id="e2e-correlation-123",
            )

    # Verify Step 2: Guest created with correct status
    assert guest is not None
    assert guest.email == "e2e.guest@example.com"
    assert guest.status == GuestStatus.INVITED
    assert guest.partner_company_id == partner.id

    # Verify invitation record created
    result = await db_session.execute(
        select(GuestInvitation).where(GuestInvitation.guest_user_id == guest.id)
    )
    invitation = result.scalar_one()
    assert invitation.invitation_id == "e2e-invitation-123"
    assert invitation.status == "pending"

    # Verify notification was sent
    mock_notify.assert_called_once()

    # Step 3: Check invitation status (still pending)
    status = await service.check_invitation_status(guest.id)
    assert status["status"] == "pending"
    assert status["guest_status"] == GuestStatus.INVITED

    # Step 4: Simulate invitation acceptance
    mock_graph_check = {
        "status": "Completed",
        "invitedUser": {
            "id": "azure-e2e-user-123",
            "displayName": "E2E Test Guest",
            "mail": "e2e.guest@example.com",
        },
    }

    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_graph_check
    mock_client.get.return_value = mock_response

    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        # Check status again - should detect acceptance
        status = await service.check_invitation_status(guest.id)

    # Verify Step 4: Guest accepted
    assert status["status"] == "accepted"
    assert status["guest_status"] == GuestStatus.ACCEPTED

    await db_session.refresh(guest)
    assert guest.status == GuestStatus.ACCEPTED
    assert guest.azure_ad_id == "azure-e2e-user-123"
    assert guest.accepted_at is not None

    # Update invitation status to accepted as well
    await db_session.refresh(invitation)
    invitation.status = "accepted"
    db_session.add(invitation)
    await db_session.commit()

    # Step 5: Verify automatic group assignment
    result = await db_session.execute(
        select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest.id)
    )
    assignments = result.scalars().all()
    assert len(assignments) > 0  # Should have groups assigned

    # Get group details
    group_ids = [a.group_id for a in assignments]
    result = await db_session.execute(select(Group).where(Group.id.in_(group_ids)))
    groups = result.scalars().all()
    group_names = {g.display_name for g in groups}

    # Should have partner_admin groups
    assert "partner_admins" in group_names
    assert f"partner_{partner.id}_admins" in group_names

    # Step 6: Update guest groups
    new_group = Group(azure_ad_group_id="e2e-new-group", display_name="e2e_special_access")
    db_session.add(new_group)
    await db_session.commit()

    await service.update_guest_groups(
        guest_id=guest.id, group_ids=[new_group.id], updated_by="admin@company.com"
    )

    # Verify group update
    result = await db_session.execute(
        select(GuestGroupAssignment).where(
            GuestGroupAssignment.guest_user_id == guest.id,
            GuestGroupAssignment.removed_at.is_(None),
        )
    )
    active_assignments = result.scalars().all()
    active_group_ids = [a.group_id for a in active_assignments]
    assert new_group.id in active_group_ids

    # Step 7: Search for guest
    search_results = await service.search_guests(email="e2e.guest", status=GuestStatus.ACCEPTED)
    assert len(search_results) == 1
    assert search_results[0].id == guest.id

    # Step 8: Test that resending invitation for accepted guest fails appropriately
    with pytest.raises(ValueError, match="Cannot resend invitation with status"):
        await service.resend_invitation(guest.id, locale="en")


@pytest.mark.asyncio
async def test_guest_invitation_expiry_flow(db_session: AsyncSession):
    """Test the flow when a guest invitation expires."""

    # Create partner
    partner = PartnerCompany(
        company_code="EXPIRY_PARTNER",
        name="Expiry Test Partner",
        short_name="EXP",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create guest with old invitation
    guest = GuestUser(
        email="expiry.test@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
        display_name="Expiry Test Guest",
        invited_at=datetime.now(UTC) - timedelta(days=31),
    )
    db_session.add(guest)
    await db_session.commit()

    # Create expired invitation
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="expired-inv-123",
        sent_at=datetime.now(UTC) - timedelta(days=31),
        expires_at=datetime.now(UTC) - timedelta(days=1),
        status="pending",
        redeem_url="https://login.microsoftonline.com/redeem?expired",
    )
    db_session.add(invitation)
    await db_session.commit()

    service = GuestService(db_session)

    # Check status - should detect expiry
    status = await service.check_invitation_status(guest.id)
    assert status["status"] == "expired"
    assert status["guest_status"] == GuestStatus.EXPIRED

    # Verify guest marked as expired
    await db_session.refresh(guest)
    assert guest.status == GuestStatus.EXPIRED

    # Re-invite the expired guest
    mock_new_invitation = {
        "id": "new-inv-456",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?new",
        "status": "PendingAcceptance",
    }

    with patch.object(
        service, "_create_b2b_invitation_with_retry", return_value=mock_new_invitation
    ):
        with patch.object(service, "_send_invitation_notification", new_callable=AsyncMock):
            reinvited_guest = await service.invite_guest(
                email="expiry.test@example.com",
                partner_company_id=partner.id,
                display_name="Expiry Test Guest Updated",
            )

    # Should be the same guest, now re-invited
    assert reinvited_guest.id == guest.id
    assert reinvited_guest.status == GuestStatus.INVITED

    # Check for new invitation record
    result = await db_session.execute(
        select(GuestInvitation).where(
            GuestInvitation.guest_user_id == guest.id,
            GuestInvitation.invitation_id == "new-inv-456",
        )
    )
    new_invitation = result.scalar_one_or_none()
    assert new_invitation is not None


@pytest.mark.asyncio
async def test_bulk_guest_invitation_flow(db_session: AsyncSession):
    """Test inviting multiple guests in bulk."""

    # Create two partner companies
    partner1 = PartnerCompany(
        company_code="BULK_P1",
        name="Bulk Partner 1",
        short_name="BP1",
    )
    partner2 = PartnerCompany(
        company_code="BULK_P2",
        name="Bulk Partner 2",
        short_name="BP2",
    )
    db_session.add_all([partner1, partner2])
    await db_session.commit()

    service = GuestService(db_session)

    # Define bulk invitations
    invitations = [
        {
            "email": "bulk1@example.com",
            "partner_id": partner1.id,
            "name": "Bulk Guest 1",
            "role": "partner_viewer",
        },
        {
            "email": "bulk2@example.com",
            "partner_id": partner1.id,
            "name": "Bulk Guest 2",
            "role": "partner_admin",
        },
        {
            "email": "bulk3@example.com",
            "partner_id": partner2.id,
            "name": "Bulk Guest 3",
            "role": "partner_viewer",
        },
    ]

    invited_guests = []

    # Process bulk invitations
    for inv in invitations:
        mock_response = {
            "id": f"bulk-inv-{inv['email']}",
            "inviteRedeemUrl": f"https://login.microsoftonline.com/redeem?{inv['email']}",
        }

        with patch.object(service, "_create_b2b_invitation_with_retry", return_value=mock_response):
            with patch.object(service, "_send_invitation_notification", new_callable=AsyncMock):
                guest = await service.invite_guest(
                    email=inv["email"],
                    partner_company_id=inv["partner_id"],
                    display_name=inv["name"],
                    role=inv["role"],
                    invited_by="bulk@admin.com",
                )
                invited_guests.append(guest)

    # Verify all guests invited
    assert len(invited_guests) == 3

    # Verify partner 1 has 2 guests
    p1_guests = await service.search_guests(partner_company_id=partner1.id)
    assert len(p1_guests) == 2

    # Verify partner 2 has 1 guest
    p2_guests = await service.search_guests(partner_company_id=partner2.id)
    assert len(p2_guests) == 1

    # Simulate all accepting
    for guest in invited_guests:
        # Update to accepted
        guest.status = GuestStatus.ACCEPTED
        guest.azure_ad_id = f"azure-{guest.email}"
        guest.accepted_at = datetime.now(UTC)
        db_session.add(guest)

    await db_session.commit()

    # Verify all accepted
    all_accepted = await service.search_guests(status=GuestStatus.ACCEPTED)
    assert len(all_accepted) >= 3


@pytest.mark.asyncio
async def test_guest_permission_escalation_flow(db_session: AsyncSession):
    """Test changing guest permissions from viewer to admin."""

    # Create partner and guest
    partner = PartnerCompany(
        company_code="ESCALATE_PARTNER",
        name="Escalation Test Partner",
        short_name="ESC",
    )
    db_session.add(partner)
    await db_session.commit()

    service = GuestService(db_session)

    # Initially invite as viewer
    mock_invitation = {
        "id": "escalate-inv-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?escalate",
    }

    with patch.object(service, "_create_b2b_invitation_with_retry", return_value=mock_invitation):
        with patch.object(service, "_send_invitation_notification", new_callable=AsyncMock):
            guest = await service.invite_guest(
                email="escalate@example.com",
                partner_company_id=partner.id,
                display_name="Escalation Test",
                role="partner_viewer",
                invited_by="admin@company.com",
            )

    # Simulate acceptance
    guest.status = GuestStatus.ACCEPTED
    guest.azure_ad_id = "azure-escalate-123"
    guest.accepted_at = datetime.now(UTC)
    db_session.add(guest)
    await db_session.commit()

    # Assign initial viewer groups
    await service._assign_groups_by_role(
        guest_user_id=guest.id,
        partner_company_id=partner.id,
        role="partner_viewer",
        assigned_by="admin@company.com",
    )

    # Check initial groups
    result = await db_session.execute(
        select(GuestGroupAssignment).where(
            GuestGroupAssignment.guest_user_id == guest.id,
            GuestGroupAssignment.removed_at.is_(None),
        )
    )
    initial_assignments = result.scalars().all()
    initial_count = len(initial_assignments)

    # Escalate to admin
    await service._assign_groups_by_role(
        guest_user_id=guest.id,
        partner_company_id=partner.id,
        role="partner_admin",
        assigned_by="admin@company.com",
    )

    # Check new groups
    result = await db_session.execute(
        select(GuestGroupAssignment).where(
            GuestGroupAssignment.guest_user_id == guest.id,
            GuestGroupAssignment.removed_at.is_(None),
        )
    )
    new_assignments = result.scalars().all()

    # Should have more groups as admin
    assert len(new_assignments) >= initial_count

    # Verify admin groups present
    group_ids = [a.group_id for a in new_assignments]
    result = await db_session.execute(select(Group).where(Group.id.in_(group_ids)))
    groups = result.scalars().all()
    group_names = {g.display_name for g in groups}

    assert "partner_admins" in group_names or f"partner_{partner.id}_admins" in group_names
