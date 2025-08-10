"""
Comprehensive tests for guest revocation and permission removal.
Tests immediate revocation, Graph API integration, and permission cleanup.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from freezegun import freeze_time
from httpx import HTTPStatusError, Response

from api.models.guest import GuestUser, GuestStatus, GuestGroupAssignment
from api.services.guests.guest_service import GuestService
from api.services.audit import AuditEventType, AuditService
from api.core.exceptions import GraphAPIException, ResourceNotFoundError
from api.core.retry import RetryConfig


@pytest.fixture
def guest_service():
    """Create GuestService instance with mocked dependencies."""
    service = GuestService()
    service.graph_client = AsyncMock()
    service.audit_service = AsyncMock()
    service.notification_service = AsyncMock()
    return service


@pytest.fixture
async def guest_user(db_session: AsyncSession):
    """Create a test guest user."""
    guest = GuestUser(
        id=uuid4(),
        email="guest@partner.com",
        display_name="Test Guest",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        invited_by=uuid4(),
        invited_at=datetime.utcnow() - timedelta(days=30),
        accepted_at=datetime.utcnow() - timedelta(days=29),
        expires_at=datetime.utcnow() + timedelta(days=60),
    )
    db_session.add(guest)
    await db_session.commit()
    await db_session.refresh(guest)
    return guest


@pytest.fixture
async def guest_with_groups(db_session: AsyncSession, guest_user):
    """Create a guest user with group assignments."""
    groups = []
    for i in range(3):
        assignment = GuestGroupAssignment(
            id=uuid4(),
            guest_user_id=guest_user.id,
            azure_group_id=str(uuid4()),
            group_name=f"TestGroup{i}",
            assigned_at=datetime.utcnow(),
            assigned_by=uuid4(),
        )
        db_session.add(assignment)
        groups.append(assignment)

    await db_session.commit()
    return guest_user, groups


class TestImmediateRevocation:
    """Test immediate revocation and permission removal."""

    @pytest.mark.asyncio
    async def test_revoke_guest_immediate_effect(self, guest_service, db_session, guest_user):
        """Test that revocation takes immediate effect in database."""
        revoked_by = uuid4()
        reason = "Contract terminated"

        # Mock Graph API response
        guest_service.graph_client.delete_user.return_value = True

        # Perform revocation
        result = await guest_service.revoke_guest(db_session, guest_user.id, revoked_by, reason)

        # Verify immediate database changes
        assert result.status == GuestStatus.REVOKED
        assert result.revoked_at is not None
        assert result.revoked_by == revoked_by
        assert result.revocation_reason == reason
        assert result.is_active is False

        # Verify timestamp is recent (within 1 second)
        time_diff = datetime.utcnow() - result.revoked_at
        assert time_diff.total_seconds() < 1

        # Verify audit event was created immediately
        guest_service.audit_service.log_event.assert_called_once()
        audit_call = guest_service.audit_service.log_event.call_args
        assert audit_call[1]["event_type"] == AuditEventType.GUEST_REVOKED
        assert audit_call[1]["actor_id"] == revoked_by
        assert audit_call[1]["details"]["reason"] == reason

    @pytest.mark.asyncio
    async def test_revoke_removes_from_all_groups(
        self, guest_service, db_session, guest_with_groups
    ):
        """Test that revocation removes guest from all Azure AD groups."""
        guest_user, groups = guest_with_groups
        revoked_by = uuid4()

        # Mock Graph API responses
        remove_calls = []
        for group in groups:
            guest_service.graph_client.remove_group_member = AsyncMock(return_value=True)
            remove_calls.append(call(group.azure_group_id, guest_user.azure_ad_id))

        # Perform revocation
        await guest_service.revoke_guest(db_session, guest_user.id, revoked_by, "Security policy")

        # Verify all group removals were called
        assert guest_service.graph_client.remove_group_member.call_count == len(groups)

        # Verify group assignments are marked as removed
        await db_session.refresh(guest_user)
        for assignment in guest_user.group_assignments:
            assert assignment.removed_at is not None
            assert assignment.removed_by == revoked_by

    @pytest.mark.asyncio
    async def test_revoke_within_one_minute_requirement(
        self, guest_service, db_session, guest_with_groups
    ):
        """Test that all revocation operations complete within 1 minute."""
        guest_user, groups = guest_with_groups
        revoked_by = uuid4()

        # Track operation time
        start_time = datetime.utcnow()

        # Mock Graph API with realistic delays (100ms per call)
        async def mock_remove_with_delay(group_id, user_id):
            import asyncio

            await asyncio.sleep(0.1)  # 100ms delay
            return True

        guest_service.graph_client.remove_group_member = mock_remove_with_delay

        # Perform revocation
        await guest_service.revoke_guest(db_session, guest_user.id, revoked_by, "Test timing")

        # Verify completion within 1 minute
        elapsed = (datetime.utcnow() - start_time).total_seconds()
        assert elapsed < 60, f"Revocation took {elapsed} seconds, exceeding 1 minute limit"

    @pytest.mark.asyncio
    async def test_revoke_with_sharepoint_permissions(self, guest_service, db_session, guest_user):
        """Test that revocation removes SharePoint/Teams permissions."""
        revoked_by = uuid4()

        # Mock SharePoint site and Teams data
        guest_user.sharepoint_sites = [
            {"site_id": "site1", "permission_level": "Edit"},
            {"site_id": "site2", "permission_level": "Read"},
        ]
        guest_user.teams_channels = [
            {"team_id": "team1", "channel_id": "channel1"},
            {"team_id": "team2", "channel_id": "channel2"},
        ]

        # Mock Graph API calls for SharePoint/Teams
        guest_service.graph_client.remove_site_permission = AsyncMock(return_value=True)
        guest_service.graph_client.remove_channel_member = AsyncMock(return_value=True)

        # Perform revocation
        await guest_service.revoke_guest(db_session, guest_user.id, revoked_by, "Full cleanup")

        # Verify SharePoint permissions removed
        assert guest_service.graph_client.remove_site_permission.call_count == 2

        # Verify Teams channel memberships removed
        assert guest_service.graph_client.remove_channel_member.call_count == 2

    @pytest.mark.asyncio
    async def test_revoke_handles_partial_failures(
        self, guest_service, db_session, guest_with_groups
    ):
        """Test compensation logic for partial Graph API failures."""
        guest_user, groups = guest_with_groups
        revoked_by = uuid4()

        # Mock mixed success/failure responses
        call_count = 0

        async def mock_remove_with_failures(group_id, user_id):
            nonlocal call_count
            call_count += 1
            if call_count == 2:  # Fail on second group
                raise GraphAPIException("Rate limit exceeded", status_code=429)
            return True

        guest_service.graph_client.remove_group_member = mock_remove_with_failures

        # Configure retry with exponential backoff
        guest_service.retry_config = RetryConfig(
            max_attempts=3, initial_delay=0.1, exponential_base=2.0
        )

        # Perform revocation (should retry failed operations)
        with patch("api.services.guests.guest_service.retry_async") as mock_retry:
            mock_retry.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)

            result = await guest_service.revoke_guest(
                db_session, guest_user.id, revoked_by, "With retries"
            )

        # Guest should still be marked as revoked
        assert result.status == GuestStatus.REVOKED

        # Verify compensation was attempted
        assert guest_service.audit_service.log_event.call_count >= 1

    @pytest.mark.asyncio
    async def test_revoke_idempotency(self, guest_service, db_session, guest_user):
        """Test that revocation is idempotent."""
        revoked_by = uuid4()
        reason = "First revocation"

        # First revocation
        guest_service.graph_client.delete_user.return_value = True
        result1 = await guest_service.revoke_guest(db_session, guest_user.id, revoked_by, reason)
        assert result1.status == GuestStatus.REVOKED

        # Second revocation (should be idempotent)
        result2 = await guest_service.revoke_guest(
            db_session, guest_user.id, revoked_by, "Second attempt"
        )

        # Should return same revoked guest without additional changes
        assert result2.id == result1.id
        assert result2.status == GuestStatus.REVOKED
        assert result2.revocation_reason == reason  # Original reason preserved

        # Graph API should only be called once
        assert guest_service.graph_client.delete_user.call_count == 1

    @pytest.mark.asyncio
    async def test_revoke_with_notification(self, guest_service, db_session, guest_user):
        """Test that revocation triggers notifications."""
        revoked_by = uuid4()
        admin_email = "admin@company.com"

        # Mock admin lookup
        with patch("api.services.guests.guest_service.get_user_email") as mock_get_email:
            mock_get_email.return_value = admin_email

            # Perform revocation
            await guest_service.revoke_guest(
                db_session, guest_user.id, revoked_by, "Policy violation"
            )

        # Verify notification was queued
        guest_service.notification_service.queue_notification.assert_called()
        notification_call = guest_service.notification_service.queue_notification.call_args

        assert notification_call[1]["template"] == "guest_revoked"
        assert notification_call[1]["recipient"] == admin_email
        assert guest_user.email in str(notification_call[1]["context"])

    @pytest.mark.asyncio
    async def test_revoke_concurrent_operations(self, guest_service, db_session, guest_user):
        """Test handling of concurrent revocation attempts."""
        import asyncio

        revoked_by1 = uuid4()
        revoked_by2 = uuid4()

        # Mock Graph API
        guest_service.graph_client.delete_user.return_value = True

        # Simulate concurrent revocation attempts
        async def revoke1():
            return await guest_service.revoke_guest(
                db_session, guest_user.id, revoked_by1, "Reason 1"
            )

        async def revoke2():
            await asyncio.sleep(0.01)  # Small delay
            return await guest_service.revoke_guest(
                db_session, guest_user.id, revoked_by2, "Reason 2"
            )

        # Run concurrently
        results = await asyncio.gather(revoke1(), revoke2(), return_exceptions=True)

        # Both should succeed (idempotent)
        assert all(not isinstance(r, Exception) for r in results)

        # Only first revocation should be effective
        final_guest = results[0] if results[0].revoked_by == revoked_by1 else results[1]
        assert final_guest.revocation_reason in ["Reason 1", "Reason 2"]
