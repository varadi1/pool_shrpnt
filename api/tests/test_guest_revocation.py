"""Tests for guest revocation functionality."""

import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from api.models.guest import GuestUser, GuestStatus, GuestGroupAssignment
from api.models.rbac import Group
from api.models.contract import PartnerCompany
from api.services.guests.guest_service import GuestService


@pytest.fixture
def mock_session():
    """Create mock async session."""
    session = AsyncMock(spec=AsyncSession)
    return session


@pytest.fixture
def mock_sync_session():
    """Create mock sync session."""
    session = MagicMock(spec=Session)
    return session


@pytest.fixture
def guest_service(mock_session, mock_sync_session):
    """Create guest service with mocked dependencies."""
    with patch("api.services.guests.guest_service.get_graph_auth_service"):
        service = GuestService(mock_session, mock_sync_session)
        service.graph_auth = MagicMock()
        service.audit_service = MagicMock()
        return service


@pytest.fixture
def sample_guest():
    """Create a sample guest user."""
    partner = PartnerCompany(id=1, name="Test Partner", short_code="TST", domain="testpartner.com")

    guest = GuestUser(
        id=uuid4(),
        email="guest@example.com",
        display_name="Test Guest",
        partner_company_id=1,
        partner_company=partner,
        status=GuestStatus.ACCEPTED.value,
        azure_ad_id="azure-id-123",
        created_by="admin@company.com",
        expires_at=datetime.now(UTC) + timedelta(days=90),
    )
    return guest


@pytest.fixture
def sample_group():
    """Create a sample group."""
    return Group(
        id=uuid4(),
        azure_ad_group_id="group-123",
        display_name="Test Group",
        description="Test group description",
    )


class TestGuestRevocation:
    """Test guest revocation functionality."""

    @pytest.mark.asyncio
    async def test_revoke_guest_success(self, guest_service, mock_session, sample_guest):
        """Test successful guest revocation."""
        # Setup
        mock_session.get.return_value = sample_guest
        mock_session.execute.return_value.scalars.return_value.all.return_value = []

        # Execute
        result = await guest_service.revoke_guest(
            guest_id=sample_guest.id,
            revoked_by="admin@company.com",
            revocation_reason="Contract ended",
            correlation_id="test-correlation-id",
        )

        # Verify
        assert result.status == GuestStatus.REVOKED.value
        assert result.revoked_by == "admin@company.com"
        assert result.revocation_reason == "Contract ended"
        assert result.revoked_at is not None
        mock_session.commit.assert_called_once()

        # Verify audit logging
        guest_service.audit_service.log_guest_event.assert_called_once()
        call_args = guest_service.audit_service.log_guest_event.call_args
        assert call_args.kwargs["action"] == "GUEST_REVOKED"
        assert call_args.kwargs["user_id"] == "admin@company.com"

    @pytest.mark.asyncio
    async def test_revoke_guest_not_found(self, guest_service, mock_session):
        """Test revocation with non-existent guest."""
        # Setup
        mock_session.get.return_value = None
        guest_id = uuid4()

        # Execute and verify
        with pytest.raises(ValueError, match=f"Guest not found: {guest_id}"):
            await guest_service.revoke_guest(
                guest_id=guest_id, revoked_by="admin@company.com", revocation_reason="Test"
            )

    @pytest.mark.asyncio
    async def test_revoke_already_revoked_guest(self, guest_service, mock_session, sample_guest):
        """Test revocation of already revoked guest."""
        # Setup
        sample_guest.status = GuestStatus.REVOKED.value
        mock_session.get.return_value = sample_guest

        # Execute and verify
        with pytest.raises(ValueError, match="Guest already revoked"):
            await guest_service.revoke_guest(
                guest_id=sample_guest.id, revoked_by="admin@company.com", revocation_reason="Test"
            )

    @pytest.mark.asyncio
    async def test_bulk_revoke_guests(self, guest_service, mock_session, sample_guest):
        """Test bulk revocation of multiple guests."""
        # Setup
        guest_ids = [uuid4() for _ in range(3)]
        mock_session.get.side_effect = [sample_guest] * 3
        mock_session.execute.return_value.scalars.return_value.all.return_value = []

        # Execute
        result = await guest_service.bulk_revoke_guests(
            guest_ids=guest_ids,
            revoked_by="admin@company.com",
            revocation_reason="Bulk revocation test",
            correlation_id="bulk-test",
        )

        # Verify
        assert result["total"] == 3
        assert len(result["succeeded"]) == 3
        assert len(result["failed"]) == 0
        assert result["correlation_id"] == "bulk-test"

        # Verify audit for bulk operation
        audit_calls = guest_service.audit_service.log_guest_event.call_args_list
        bulk_audit_call = [c for c in audit_calls if c.kwargs.get("action") == "GUEST_BULK_REVOKED"]
        assert len(bulk_audit_call) == 1

    @pytest.mark.asyncio
    async def test_bulk_revoke_with_failures(self, guest_service, mock_session):
        """Test bulk revocation with some failures."""
        # Setup
        guest_ids = [uuid4() for _ in range(3)]
        sample_guest = MagicMock()
        sample_guest.id = guest_ids[0]
        sample_guest.email = "guest1@example.com"
        sample_guest.status = GuestStatus.ACCEPTED.value

        # First guest succeeds, second fails (not found), third succeeds
        mock_session.get.side_effect = [sample_guest, None, sample_guest]
        mock_session.execute.return_value.scalars.return_value.all.return_value = []

        # Execute
        result = await guest_service.bulk_revoke_guests(
            guest_ids=guest_ids, revoked_by="admin@company.com", revocation_reason="Test"
        )

        # Verify
        assert result["total"] == 3
        assert len(result["succeeded"]) == 1  # Only first one succeeds
        assert len(result["failed"]) == 2  # Second and third fail

    @pytest.mark.asyncio
    async def test_remove_from_azure_ad_groups(self, guest_service, sample_guest, sample_group):
        """Test removal from Azure AD groups."""
        # Setup
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 204
        mock_client.delete.return_value = mock_response

        guest_service.graph_auth.get_graph_client.return_value.__aenter__.return_value = mock_client

        # Execute
        await guest_service._remove_from_azure_ad_groups(
            azure_ad_user_id=sample_guest.azure_ad_id,
            groups=[sample_group],
            correlation_id="test-correlation",
        )

        # Verify
        mock_client.delete.assert_called_once_with(
            f"/groups/{sample_group.azure_ad_group_id}/members/{sample_guest.azure_ad_id}/$ref"
        )

    @pytest.mark.asyncio
    async def test_remove_from_azure_ad_groups_with_retry(
        self, guest_service, sample_guest, sample_group
    ):
        """Test removal from Azure AD groups with rate limiting and retry."""
        # Setup
        mock_client = AsyncMock()

        # First call returns 429 (rate limited), second succeeds
        mock_response_429 = MagicMock()
        mock_response_429.status_code = 429
        mock_response_429.headers = {"Retry-After": "1"}

        mock_response_204 = MagicMock()
        mock_response_204.status_code = 204

        mock_client.delete.side_effect = [mock_response_429, mock_response_204]

        guest_service.graph_auth.get_graph_client.return_value.__aenter__.return_value = mock_client

        # Execute
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await guest_service._remove_from_azure_ad_groups(
                azure_ad_user_id=sample_guest.azure_ad_id,
                groups=[sample_group],
                correlation_id="test-correlation",
            )

        # Verify
        assert mock_client.delete.call_count == 2

    @pytest.mark.asyncio
    async def test_list_guests_by_partner(self, guest_service, mock_session):
        """Test listing guests by partner company."""
        # Setup
        partner_id = 1
        guest1 = MagicMock(status=GuestStatus.ACCEPTED.value)
        guest2 = MagicMock(status=GuestStatus.REVOKED.value)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [guest1]
        mock_session.execute.return_value = mock_result

        # Execute - without revoked
        result = await guest_service.list_guests_by_partner(
            partner_company_id=partner_id, include_revoked=False
        )

        # Verify
        assert len(result) == 1
        assert guest1 in result
        assert guest2 not in result

    @pytest.mark.asyncio
    async def test_purge_revoked_guest(self, guest_service, mock_session, sample_guest):
        """Test purging a revoked guest from Azure AD."""
        # Setup
        sample_guest.status = GuestStatus.REVOKED.value
        sample_guest.revoked_at = datetime.now(UTC) - timedelta(days=31)
        mock_session.get.return_value = sample_guest

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 204
        mock_client.delete.return_value = mock_response

        guest_service.graph_auth.get_graph_client.return_value.__aenter__.return_value = mock_client

        # Execute
        await guest_service.purge_revoked_guest(
            guest_id=sample_guest.id, correlation_id="purge-test"
        )

        # Verify
        assert sample_guest.status == GuestStatus.PURGED.value
        mock_client.delete.assert_called_once_with(f"/users/{sample_guest.azure_ad_id}")
        mock_session.commit.assert_called_once()

        # Verify audit
        guest_service.audit_service.log_guest_event.assert_called_once()
        call_args = guest_service.audit_service.log_guest_event.call_args
        assert call_args.kwargs["action"] == "GUEST_PURGED"

    @pytest.mark.asyncio
    async def test_purge_non_revoked_guest_fails(self, guest_service, mock_session, sample_guest):
        """Test that purging non-revoked guest fails."""
        # Setup
        sample_guest.status = GuestStatus.ACCEPTED.value
        mock_session.get.return_value = sample_guest

        # Execute and verify
        with pytest.raises(ValueError, match="Guest must be revoked before purging"):
            await guest_service.purge_revoked_guest(guest_id=sample_guest.id)

    @pytest.mark.asyncio
    async def test_remove_from_all_groups(
        self, guest_service, mock_session, sample_guest, sample_group
    ):
        """Test removing guest from all assigned groups."""
        # Setup
        assignment = GuestGroupAssignment(
            id=uuid4(),
            guest_user_id=sample_guest.id,
            group_id=sample_group.id,
            group=sample_group,
            assigned_by="admin@company.com",
            removed_at=None,
        )

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [assignment]
        mock_session.execute.return_value = mock_result

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 204
        mock_client.delete.return_value = mock_response

        guest_service.graph_auth.get_graph_client.return_value.__aenter__.return_value = mock_client

        # Execute
        await guest_service._remove_from_all_groups(
            guest=sample_guest, removed_by="admin@company.com", correlation_id="test-correlation"
        )

        # Verify
        assert assignment.removed_at is not None
        assert assignment.removed_by == "admin@company.com"
        mock_client.delete.assert_called_once()
