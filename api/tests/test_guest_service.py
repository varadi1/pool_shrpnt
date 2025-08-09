"""Tests for guest user management service."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import PartnerCompany
from api.models.guest import GuestGroupAssignment, GuestInvitation, GuestStatus, GuestUser
from api.models.rbac import Group
from api.services.guests.guest_service import GuestService


@pytest.mark.asyncio
async def test_invite_guest_success(db_session: AsyncSession):
    """Test successful guest invitation."""
    # Create partner company
    partner = PartnerCompany(
        company_code="TEST_PARTNER",
        name="Test Partner Company",
        short_name="TPC",
    )
    db_session.add(partner)
    await db_session.commit()

    service = GuestService(db_session)

    # Mock Graph API response
    mock_invitation_response = {
        "id": "invitation-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?id=123",
        "invitedUserEmailAddress": "guest@example.com",
        "status": "PendingAcceptance",
    }

    with patch.object(
        service, "_create_b2b_invitation_with_retry", return_value=mock_invitation_response
    ) as mock_create:
        with patch.object(
            service, "_send_invitation_notification", new_callable=AsyncMock
        ) as mock_notify:
            guest = await service.invite_guest(
                email="guest@example.com",
                partner_company_id=partner.id,
                display_name="Test Guest",
                role="partner_viewer",
                invited_by="admin@company.com",
            )

    # Verify guest was created
    assert guest.email == "guest@example.com"
    assert guest.display_name == "Test Guest"
    assert guest.partner_company_id == partner.id
    assert guest.status == GuestStatus.INVITED
    assert guest.invited_at is not None

    # Verify invitation record was created
    result = await db_session.execute(
        select(GuestInvitation).where(GuestInvitation.guest_user_id == guest.id)
    )
    invitation = result.scalar_one()
    assert invitation.invitation_id == "invitation-123"
    assert invitation.redeem_url == mock_invitation_response["inviteRedeemUrl"]
    assert invitation.status == "pending"

    # Verify methods were called
    mock_create.assert_called_once()
    mock_notify.assert_called_once()


@pytest.mark.asyncio
async def test_invite_guest_invalid_email(db_session: AsyncSession):
    """Test guest invitation with invalid email."""
    partner = PartnerCompany(
        company_code="TEST_PARTNER2",
        name="Test Partner 2",
        short_name="TP2",
    )
    db_session.add(partner)
    await db_session.commit()

    service = GuestService(db_session)

    with pytest.raises(ValueError, match="Invalid email address"):
        await service.invite_guest(
            email="not-an-email",
            partner_company_id=partner.id,
        )


@pytest.mark.asyncio
async def test_invite_guest_invalid_partner(db_session: AsyncSession):
    """Test guest invitation with invalid partner company."""
    service = GuestService(db_session)

    with pytest.raises(ValueError, match="Partner company not found"):
        await service.invite_guest(
            email="guest@example.com",
            partner_company_id=99999,
        )


@pytest.mark.asyncio
async def test_invite_existing_guest(db_session: AsyncSession):
    """Test inviting a guest that already exists."""
    # Create partner and existing guest
    partner = PartnerCompany(
        company_code="TEST_PARTNER3",
        name="Test Partner 3",
        short_name="TP3",
    )
    db_session.add(partner)
    await db_session.commit()  # Commit partner first to get ID

    existing_guest = GuestUser(
        email="existing@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.EXPIRED,
        display_name="Old Name",
    )
    db_session.add(existing_guest)
    await db_session.commit()

    service = GuestService(db_session)

    mock_invitation_response = {
        "id": "new-invitation-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?id=new123",
    }

    with patch.object(
        service, "_create_b2b_invitation_with_retry", return_value=mock_invitation_response
    ):
        with patch.object(service, "_send_invitation_notification", new_callable=AsyncMock):
            guest = await service.invite_guest(
                email="existing@example.com",
                partner_company_id=partner.id,
                display_name="New Name",  # This won't update existing
            )

    # Verify it's the same guest, now re-invited
    assert guest.id == existing_guest.id
    assert guest.status == GuestStatus.INVITED
    assert guest.display_name == "Old Name"  # Keeps original name


@pytest.mark.asyncio
async def test_b2b_invitation_with_retry_rate_limit(db_session: AsyncSession):
    """Test B2B invitation with rate limit retry."""
    service = GuestService(db_session)

    # Mock responses: first 429, then success
    mock_client = AsyncMock()
    mock_response_429 = MagicMock()
    mock_response_429.status_code = 429
    mock_response_429.headers = {"Retry-After": "1"}

    mock_response_success = MagicMock()
    mock_response_success.status_code = 201
    mock_response_success.json.return_value = {"id": "inv-123", "inviteRedeemUrl": "url"}

    mock_client.post.side_effect = [mock_response_429, mock_response_success]

    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        # Mock sleep to speed up test
        with patch("api.services.guests.guest_service.asyncio.sleep", new_callable=AsyncMock):
            result = await service._create_b2b_invitation_with_retry(
                email="test@example.com",
                display_name="Test User",
            )

    assert result["id"] == "inv-123"
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_automatic_group_assignment(db_session: AsyncSession):
    """Test automatic group assignment based on role."""
    # Create partner
    partner = PartnerCompany(
        company_code="TEST_PARTNER4",
        name="Test Partner 4",
        short_name="TP4",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create a guest
    guest = GuestUser(
        email="guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    db_session.add(guest)
    await db_session.commit()

    service = GuestService(db_session)

    # Assign groups based on partner_admin role
    await service._assign_groups_by_role(
        guest_user_id=guest.id,
        partner_company_id=partner.id,
        role="partner_admin",
        assigned_by="admin@company.com",
    )
    
    # Commit the transaction to ensure all assignments are persisted
    await db_session.commit()

    # Check groups were created and assigned
    result = await db_session.execute(
        select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest.id)
    )
    assignments = result.scalars().all()

    assert len(assignments) >= 2

    # Check group names
    group_ids = [a.group_id for a in assignments]
    result = await db_session.execute(select(Group).where(Group.id.in_(group_ids)))
    groups = result.scalars().all()
    group_names = {g.display_name for g in groups}

    # Should have at least these two groups - partner.id is typically 1 in tests
    assert "partner_admins" in group_names
    # Check that a partner-specific admin group was created
    partner_admin_groups = [name for name in group_names if "partner_" in name and "_admins" in name]
    assert len(partner_admin_groups) >= 1, f"Expected at least one partner admin group, got {group_names}"


@pytest.mark.asyncio
async def test_check_invitation_status_accepted(db_session: AsyncSession):
    """Test checking invitation status when accepted."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="TEST_PARTNER5",
        name="Test Partner 5",
        short_name="TP5",
    )
    db_session.add(partner)
    await db_session.commit()  # Commit partner first to get ID

    guest = GuestUser(
        email="guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    db_session.add(guest)
    await db_session.commit()

    # Create pending invitation
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="inv-check-123",
        sent_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=30),
        status="pending",
    )
    db_session.add(invitation)
    await db_session.commit()

    service = GuestService(db_session)

    # Mock Graph API response showing completed
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "status": "Completed",
        "invitedUser": {"id": "azure-user-123"},
    }
    mock_client.get.return_value = mock_response

    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        status = await service.check_invitation_status(guest.id)

    assert status["status"] == "accepted"
    assert status["guest_status"] == GuestStatus.ACCEPTED

    # Verify guest was updated
    await db_session.refresh(guest)
    assert guest.status == GuestStatus.ACCEPTED
    assert guest.azure_ad_id == "azure-user-123"
    assert guest.accepted_at is not None


@pytest.mark.asyncio
async def test_check_invitation_status_expired(db_session: AsyncSession):
    """Test checking invitation status when expired."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="TEST_PARTNER6",
        name="Test Partner 6",
        short_name="TP6",
    )
    db_session.add(partner)
    await db_session.commit()  # Commit partner first to get ID

    guest = GuestUser(
        email="guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    db_session.add(guest)
    await db_session.commit()

    # Create expired invitation
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="inv-expired-123",
        sent_at=datetime.now(UTC) - timedelta(days=31),
        expires_at=datetime.now(UTC) - timedelta(days=1),
        status="pending",
    )
    db_session.add(invitation)
    await db_session.commit()

    service = GuestService(db_session)

    status = await service.check_invitation_status(guest.id)

    assert status["status"] == "expired"
    assert status["guest_status"] == GuestStatus.EXPIRED

    # Verify guest was updated
    await db_session.refresh(guest)
    assert guest.status == GuestStatus.EXPIRED


@pytest.mark.asyncio
async def test_find_guest_by_email(db_session: AsyncSession):
    """Test finding guest by email."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="TEST_PARTNER7",
        name="Test Partner 7",
        short_name="TP7",
    )
    db_session.add(partner)
    await db_session.commit()  # Commit partner first to get ID

    guest = GuestUser(
        email="findme@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
    )
    db_session.add(guest)
    await db_session.commit()

    service = GuestService(db_session)

    # Find existing guest
    found = await service.find_guest_by_email("findme@example.com")
    assert found is not None
    assert found.id == guest.id

    # Try to find non-existent guest
    not_found = await service.find_guest_by_email("nothere@example.com")
    assert not_found is None


@pytest.mark.asyncio
async def test_find_guest_by_azure_id(db_session: AsyncSession):
    """Test finding guest by Azure AD ID."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="TEST_PARTNER8",
        name="Test Partner 8",
        short_name="TP8",
    )
    db_session.add(partner)
    await db_session.commit()  # Commit partner first to get ID

    guest = GuestUser(
        email="guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
        azure_ad_id="azure-find-123",
    )
    db_session.add(guest)
    await db_session.commit()

    service = GuestService(db_session)

    # Find existing guest
    found = await service.find_guest_by_azure_id("azure-find-123")
    assert found is not None
    assert found.id == guest.id

    # Try to find non-existent guest
    not_found = await service.find_guest_by_azure_id("not-here")
    assert not_found is None


@pytest.mark.asyncio
async def test_search_guests(db_session: AsyncSession):
    """Test searching guests with filters."""
    # Create partners
    partner1 = PartnerCompany(
        company_code="SEARCH_P1",
        name="Search Partner 1",
        short_name="SP1",
    )
    partner2 = PartnerCompany(
        company_code="SEARCH_P2",
        name="Search Partner 2",
        short_name="SP2",
    )
    db_session.add_all([partner1, partner2])
    await db_session.commit()

    # Create guests
    guests = [
        GuestUser(
            email="alice@example.com",
            partner_company_id=partner1.id,
            status=GuestStatus.ACCEPTED,
        ),
        GuestUser(
            email="bob@example.com",
            partner_company_id=partner1.id,
            status=GuestStatus.INVITED,
        ),
        GuestUser(
            email="charlie@example.com",
            partner_company_id=partner2.id,
            status=GuestStatus.ACCEPTED,
        ),
        GuestUser(
            email="alice@other.com",
            partner_company_id=partner2.id,
            status=GuestStatus.EXPIRED,
        ),
    ]
    db_session.add_all(guests)
    await db_session.commit()

    service = GuestService(db_session)

    # Search by email pattern (should find both alice emails)
    results = await service.search_guests(email="alice", include_expired=True)
    assert len(results) == 2

    # Search by partner
    results = await service.search_guests(partner_company_id=partner1.id)
    assert len(results) == 2

    # Search by status
    results = await service.search_guests(status=GuestStatus.ACCEPTED)
    assert len(results) == 2

    # Search excluding expired
    results = await service.search_guests(include_expired=False)
    assert len(results) == 3

    # Combined search
    results = await service.search_guests(
        email="alice",
        partner_company_id=partner1.id,
        status=GuestStatus.ACCEPTED,
    )
    assert len(results) == 1
    assert results[0].email == "alice@example.com"


@pytest.mark.asyncio
async def test_update_guest_groups(db_session: AsyncSession):
    """Test updating guest group assignments."""
    # Create partner, guest, and groups
    partner = PartnerCompany(
        company_code="UPDATE_PARTNER",
        name="Update Partner",
        short_name="UP",
    )
    db_session.add(partner)
    await db_session.commit()  # Commit partner first to get ID

    guest = GuestUser(
        email="guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
    )
    db_session.add(guest)

    groups = [
        Group(azure_ad_group_id="group1", display_name="Group 1"),
        Group(azure_ad_group_id="group2", display_name="Group 2"),
        Group(azure_ad_group_id="group3", display_name="Group 3"),
    ]
    db_session.add_all(groups)
    await db_session.commit()

    # Initial assignment to groups 1 and 2
    for group in groups[:2]:
        assignment = GuestGroupAssignment(
            guest_user_id=guest.id,
            group_id=group.id,
            assigned_by="initial@admin.com",
        )
        db_session.add(assignment)
    await db_session.commit()

    service = GuestService(db_session)

    # Update to groups 2 and 3 (remove 1, keep 2, add 3)
    await service.update_guest_groups(
        guest_id=guest.id,
        group_ids=[groups[1].id, groups[2].id],
        updated_by="update@admin.com",
    )

    # Check current assignments
    result = await db_session.execute(
        select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest.id)
    )
    all_assignments = result.scalars().all()

    # Group 1 should be marked as removed
    group1_assignment = next(a for a in all_assignments if a.group_id == groups[0].id)
    assert group1_assignment.removed_at is not None
    assert group1_assignment.removed_by == "update@admin.com"

    # Group 2 should remain active
    group2_assignment = next(a for a in all_assignments if a.group_id == groups[1].id)
    assert group2_assignment.removed_at is None

    # Group 3 should be newly added
    group3_assignments = [a for a in all_assignments if a.group_id == groups[2].id]
    assert len(group3_assignments) == 1
    assert group3_assignments[0].assigned_by == "update@admin.com"
    assert group3_assignments[0].removed_at is None


@pytest.mark.asyncio
async def test_validate_email(db_session: AsyncSession):
    """Test email validation."""
    service = GuestService(db_session)

    # Valid emails
    assert service._validate_email("user@example.com")
    assert service._validate_email("user.name@example.com")
    assert service._validate_email("user+tag@example.co.uk")
    assert service._validate_email("user123@sub.example.com")

    # Invalid emails
    assert not service._validate_email("not-an-email")
    assert not service._validate_email("@example.com")
    assert not service._validate_email("user@")
    assert not service._validate_email("user@.com")
    assert not service._validate_email("user @example.com")
    assert not service._validate_email("")
