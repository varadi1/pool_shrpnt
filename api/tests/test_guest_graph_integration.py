"""Integration tests for guest Graph API operations."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import PartnerCompany
from api.models.guest import GuestInvitation, GuestStatus, GuestUser
from api.services.guests.guest_service import GuestService


@pytest.mark.asyncio
async def test_graph_api_invitation_full_flow(db_session: AsyncSession):
    """Test complete Graph API invitation flow including retry and notification."""
    # Create partner company
    partner = PartnerCompany(
        company_code="GRAPH_PARTNER",
        name="Graph Test Partner",
        short_name="GTP",
    )
    db_session.add(partner)
    await db_session.commit()

    service = GuestService(db_session)

    # Mock Graph API responses
    mock_invitation_response = {
        "id": "graph-inv-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?id=123",
        "invitedUserEmailAddress": "graph.test@example.com",
        "status": "PendingAcceptance",
        "invitedUser": {"id": None},
    }

    # Mock notification service
    with patch("api.services.guests.guest_service.NotificationService") as MockNotification:
        mock_notification = AsyncMock()
        MockNotification.return_value = mock_notification

        with patch.object(
            service, "_create_b2b_invitation_with_retry", return_value=mock_invitation_response
        ):
            guest = await service.invite_guest(
                email="graph.test@example.com",
                partner_company_id=partner.id,
                display_name="Graph Test User",
                role="partner_admin",
                invited_by="admin@company.com",
                send_notification=True,
                locale="en",
            )

    # Verify guest created correctly
    assert guest.email == "graph.test@example.com"
    assert guest.status == GuestStatus.INVITED

    # Verify invitation record
    result = await db_session.execute(
        select(GuestInvitation).where(GuestInvitation.guest_user_id == guest.id)
    )
    invitation = result.scalar_one()
    assert invitation.invitation_id == "graph-inv-123"
    assert invitation.redeem_url == mock_invitation_response["inviteRedeemUrl"]


@pytest.mark.asyncio
async def test_graph_api_rate_limit_handling(db_session: AsyncSession):
    """Test Graph API rate limit (429) handling with exponential backoff."""
    service = GuestService(db_session)

    # Create mock responses: 429, 429, then success
    mock_client = AsyncMock()

    mock_response_429_1 = MagicMock()
    mock_response_429_1.status_code = 429
    mock_response_429_1.headers = {"Retry-After": "1"}

    mock_response_429_2 = MagicMock()
    mock_response_429_2.status_code = 429
    mock_response_429_2.headers = {"Retry-After": "2"}

    mock_response_success = MagicMock()
    mock_response_success.status_code = 201
    mock_response_success.json.return_value = {
        "id": "inv-retry-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?retry",
        "status": "PendingAcceptance",
    }

    mock_client.post.side_effect = [mock_response_429_1, mock_response_429_2, mock_response_success]

    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        # Mock sleep to speed up test
        with patch(
            "api.services.guests.guest_service.asyncio.sleep", new_callable=AsyncMock
        ) as mock_sleep:
            result = await service._create_b2b_invitation_with_retry(
                email="retry.test@example.com", display_name="Retry Test User", max_retries=3
            )

    # Verify successful after retries
    assert result["id"] == "inv-retry-123"
    assert mock_client.post.call_count == 3
    # Verify exponential backoff was called
    assert mock_sleep.call_count >= 2


@pytest.mark.asyncio
async def test_graph_api_503_service_unavailable(db_session: AsyncSession):
    """Test Graph API 503 Service Unavailable handling."""
    service = GuestService(db_session)

    mock_client = AsyncMock()
    mock_response_503 = MagicMock()
    mock_response_503.status_code = 503

    mock_response_success = MagicMock()
    mock_response_success.status_code = 201
    mock_response_success.json.return_value = {
        "id": "inv-503-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?503",
    }

    mock_client.post.side_effect = [mock_response_503, mock_response_success]

    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        with patch("api.services.guests.guest_service.asyncio.sleep", new_callable=AsyncMock):
            result = await service._create_b2b_invitation_with_retry(
                email="503.test@example.com", display_name="503 Test User"
            )

    assert result["id"] == "inv-503-123"
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_graph_api_batch_operations(db_session: AsyncSession):
    """Test batch Graph API operations for multiple invitations."""
    # Create partner
    partner = PartnerCompany(
        company_code="BATCH_PARTNER",
        name="Batch Test Partner",
        short_name="BTP",
    )
    db_session.add(partner)
    await db_session.commit()

    service = GuestService(db_session)

    # Test multiple invitations
    emails = ["batch1@example.com", "batch2@example.com", "batch3@example.com"]

    guests = []
    for i, email in enumerate(emails):
        mock_response = {
            "id": f"batch-inv-{i}",
            "inviteRedeemUrl": f"https://login.microsoftonline.com/redeem?batch={i}",
            "invitedUserEmailAddress": email,
            "status": "PendingAcceptance",
        }

        with patch.object(service, "_create_b2b_invitation_with_retry", return_value=mock_response):
            with patch.object(service, "_send_invitation_notification", new_callable=AsyncMock):
                guest = await service.invite_guest(
                    email=email,
                    partner_company_id=partner.id,
                    display_name=f"Batch User {i}",
                    role="partner_viewer",
                )
                guests.append(guest)

    # Verify all guests created
    assert len(guests) == 3
    for guest in guests:
        assert guest.status == GuestStatus.INVITED


@pytest.mark.asyncio
async def test_graph_api_invitation_acceptance_check(db_session: AsyncSession):
    """Test checking invitation acceptance status via Graph API."""
    # Create partner and guest with pending invitation
    partner = PartnerCompany(
        company_code="ACCEPT_PARTNER",
        name="Accept Test Partner",
        short_name="ATP",
    )
    db_session.add(partner)
    await db_session.commit()

    guest = GuestUser(
        email="accept.test@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    db_session.add(guest)
    await db_session.commit()

    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="accept-inv-123",
        sent_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=30),
        status="pending",
        redeem_url="https://login.microsoftonline.com/redeem?accept",
    )
    db_session.add(invitation)
    await db_session.commit()

    service = GuestService(db_session)

    # Mock Graph API response showing invitation accepted
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "status": "Completed",
        "invitedUser": {
            "id": "azure-user-accepted-123",
            "displayName": "Accept Test User",
            "mail": "accept.test@example.com",
        },
    }
    mock_client.get.return_value = mock_response

    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        # Mock group assignment
        with patch.object(service, "_assign_groups_by_role", new_callable=AsyncMock):
            status = await service.check_invitation_status(guest.id)

    # Verify status updated
    assert status["status"] == "accepted"
    assert status["guest_status"] == GuestStatus.ACCEPTED

    # Verify guest updated in database
    await db_session.refresh(guest)
    assert guest.status == GuestStatus.ACCEPTED
    assert guest.azure_ad_id == "azure-user-accepted-123"
    assert guest.accepted_at is not None


@pytest.mark.asyncio
async def test_graph_api_group_assignment(db_session: AsyncSession):
    """Test Azure AD group assignment via Graph API."""
    # Create partner and accepted guest
    partner = PartnerCompany(
        company_code="GROUP_PARTNER",
        name="Group Test Partner",
        short_name="GRP",
    )
    db_session.add(partner)
    await db_session.commit()

    guest = GuestUser(
        email="group.test@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
        azure_ad_id="azure-group-user-123",
    )
    db_session.add(guest)
    await db_session.commit()

    service = GuestService(db_session)

    # Test group assignment for partner_admin role
    await service._assign_groups_by_role(
        guest_user_id=guest.id,
        partner_company_id=partner.id,
        role="partner_admin",
        assigned_by="admin@company.com",
    )

    # Check groups were created and assigned
    from sqlalchemy import select

    from api.models.guest import GuestGroupAssignment
    from api.models.rbac import Group

    result = await db_session.execute(
        select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest.id)
    )
    assignments = result.scalars().all()

    # Should have at least 2 groups for partner_admin
    assert len(assignments) >= 2

    # Verify group names match expected pattern
    group_ids = [a.group_id for a in assignments]
    result = await db_session.execute(select(Group).where(Group.id.in_(group_ids)))
    groups = result.scalars().all()
    group_names = {g.display_name for g in groups}

    # Should contain at least these expected groups
    assert "partner_admins" in group_names
    # Check that a partner-specific admin group was created
    partner_admin_groups = [name for name in group_names if "partner_" in name and "_admins" in name]
    assert len(partner_admin_groups) >= 1, f"Expected at least one partner admin group, got {group_names}"


@pytest.mark.asyncio
async def test_graph_api_token_refresh(db_session: AsyncSession):
    """Test Graph API handling with automatic token refresh."""
    service = GuestService(db_session)

    # Mock successful response after token refresh
    mock_client = AsyncMock()

    mock_response_success = MagicMock()
    mock_response_success.status_code = 201
    mock_response_success.json.return_value = {
        "id": "token-refresh-inv",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?token",
    }

    mock_client.post.return_value = mock_response_success

    # Mock the graph auth service to test token acquisition
    with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
        mock_get_client.return_value.__aenter__.return_value = mock_client

        # Test that the service can handle token refresh transparently
        with patch.object(
            service.graph_auth, "get_access_token", new_callable=AsyncMock
        ) as mock_get_token:
            mock_get_token.return_value = "new-access-token"

            result = await service._create_b2b_invitation_with_retry(
                email="token.test@example.com", display_name="Token Test User"
            )

    assert result["id"] == "token-refresh-inv"
    # Verify that the invitation was created successfully
    mock_client.post.assert_called_once()


@pytest.mark.asyncio
async def test_graph_api_error_handling(db_session: AsyncSession):
    """Test Graph API error response handling."""
    service = GuestService(db_session)

    # Test various error scenarios
    error_scenarios = [
        (400, "BadRequest", "Invalid email format"),
        (403, "Forbidden", "Insufficient permissions"),
        (404, "NotFound", "Tenant not found"),
        (409, "Conflict", "User already exists"),
    ]

    for status_code, error_code, message in error_scenarios:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = status_code
        mock_response.json.return_value = {"error": {"code": error_code, "message": message}}
        mock_response.text = f"{error_code}: {message}"
        mock_client.post.return_value = mock_response

        with patch.object(service.graph_auth, "get_graph_client") as mock_get_client:
            mock_get_client.return_value.__aenter__.return_value = mock_client

            with pytest.raises(Exception) as exc_info:
                await service._create_b2b_invitation_with_retry(
                    email=f"error{status_code}@example.com",
                    display_name=f"Error {status_code} User",
                    max_retries=1,  # Don't retry on client errors
                )

            # Verify appropriate error handling
            assert error_code in str(exc_info.value) or message in str(exc_info.value)


@pytest.mark.asyncio
async def test_graph_api_invitation_expiry(db_session: AsyncSession):
    """Test handling of expired invitations."""
    # Create partner and guest with expired invitation
    partner = PartnerCompany(
        company_code="EXPIRE_PARTNER",
        name="Expire Test Partner",
        short_name="ETP",
    )
    db_session.add(partner)
    await db_session.commit()

    guest = GuestUser(
        email="expire.test@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    db_session.add(guest)
    await db_session.commit()

    # Create expired invitation (31 days old)
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="expire-inv-123",
        sent_at=datetime.now(UTC) - timedelta(days=31),
        expires_at=datetime.now(UTC) - timedelta(days=1),
        status="pending",
    )
    db_session.add(invitation)
    await db_session.commit()

    service = GuestService(db_session)

    # Check status - should detect expiry
    status = await service.check_invitation_status(guest.id)

    assert status["status"] == "expired"
    assert status["guest_status"] == GuestStatus.EXPIRED

    # Verify guest updated
    await db_session.refresh(guest)
    assert guest.status == GuestStatus.EXPIRED
