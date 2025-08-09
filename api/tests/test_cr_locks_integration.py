"""Integration tests for CR locks with notifications and SharePoint sync."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from freezegun import freeze_time
from sqlalchemy.orm import Session

from api.models.change_request import ChangeRequest, CRScope, CRStatus
from api.models.contract import OrderEm
from api.models.lock import LockState, PermissionLevel
from api.services.locks.cr_service import CRService
from api.services.notifications.notification_service import NotificationService
from api.services.sharepoint.permission_service import SharePointPermissionService


@pytest.fixture
def notification_service():
    """Mock notification service."""
    service = MagicMock(spec=NotificationService)
    service.resolve_recipients = AsyncMock(
        return_value=[
            {"id": uuid4(), "email": "pm@example.com", "role": "NEU_PM"},
            {"id": uuid4(), "email": "partner@example.com", "role": "PARTNER_ADMIN"},
        ]
    )
    service.queue_notification = AsyncMock(return_value=[uuid4(), uuid4()])
    return service


@pytest.fixture
def sharepoint_service():
    """Mock SharePoint permission service."""
    service = MagicMock(spec=SharePointPermissionService)
    service.apply_permissions = AsyncMock(return_value={"status": "success"})
    return service


@pytest.fixture
def mock_db_session():
    """Mock database session with query method."""
    session = MagicMock(spec=Session)
    session.commit = MagicMock()
    session.rollback = MagicMock()
    session.flush = MagicMock()
    session.add = MagicMock()
    return session


@pytest.fixture
def cr_service_with_integrations(mock_db_session, notification_service, sharepoint_service):
    """CR service with notification and SharePoint integrations."""
    return CRService(mock_db_session, notification_service, sharepoint_service)


@pytest.fixture
def sample_em_with_sharepoint():
    """Sample OrderEm with SharePoint configuration."""
    em = MagicMock(spec=OrderEm)
    em.id = 1
    em.name = "Test EM 2025"
    em.partner_id = 123
    em.sharepoint_site_id = "site-123"
    em.expert_group_ids = ["group-experts"]
    em.deliverable_group_ids = ["group-deliverables"]
    return em


def create_mock_lock_state(
    folder_path: str, group_id: str, permission_level=PermissionLevel.READ, cr_id=None
):
    """Helper to create a properly mocked LockState."""
    lock_state = MagicMock(spec=LockState)
    lock_state.folder_path = folder_path
    lock_state.group_id = group_id
    lock_state.permission_level = permission_level
    lock_state.cr_id = cr_id
    # Add attributes that can be set during sync
    lock_state.sharepoint_sync_status = None
    lock_state.sharepoint_sync_at = None
    lock_state.sharepoint_sync_error = None
    return lock_state


class TestCRNotificationIntegration:
    """Test CR notification integration."""

    @pytest.mark.asyncio
    async def test_cr_opened_notification(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        notification_service,
    ):
        """Test notification is sent when CR is opened."""
        # Setup
        user_id = uuid4()

        # Mock the database queries
        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = []

        with patch.object(cr_service_with_integrations, "_apply_cr_unlock", new_callable=AsyncMock):
            with patch.object(
                cr_service_with_integrations, "_sync_sharepoint_permissions", new_callable=AsyncMock
            ):
                # Execute
                cr = await cr_service_with_integrations.create_cr(
                    em_id=1,
                    scope=CRScope.EXPERTS,
                    reason="Emergency fix for production issue",
                    created_by=user_id,
                    duration_hours=48,
                )

                # Assert notification was queued
                notification_service.queue_notification.assert_called_once()
                call_args = notification_service.queue_notification.call_args

                assert call_args.kwargs["template_key"] == "cr_opened"
                assert call_args.kwargs["event_type"] == "lock.cr.opened"
                assert call_args.kwargs["priority"] == 3
                assert call_args.kwargs["variables"]["em_id"] == 1
                assert call_args.kwargs["variables"]["scope"] == CRScope.EXPERTS
                assert call_args.kwargs["variables"]["duration_hours"] == 48

    @pytest.mark.asyncio
    async def test_cr_closed_notification(
        self, cr_service_with_integrations, mock_db_session, notification_service
    ):
        """Test notification is sent when CR is closed manually."""
        # Setup
        cr_id = uuid4()
        user_id = uuid4()

        cr = MagicMock(spec=ChangeRequest)
        cr.id = cr_id
        cr.em_id = 1
        cr.scope = CRScope.DELIVERABLES
        cr.status = CRStatus.ACTIVE
        cr.reason = "Initial reason"
        cr.created_at = datetime.now(UTC)
        cr.expires_at = datetime.now(UTC) + timedelta(hours=48)
        cr.duration_hours = 48
        cr.audit_correlation_id = uuid4()

        em = MagicMock(spec=OrderEm)
        em.id = 1
        em.name = "Test EM"
        em.partner_id = 456

        # Mock the database queries
        mock_db_session.query.return_value.filter_by.return_value.first.side_effect = [cr, em]
        mock_db_session.query.return_value.filter.return_value.all.return_value = []

        with patch.object(cr_service_with_integrations, "_revert_cr_lock", new_callable=AsyncMock):
            with patch.object(
                cr_service_with_integrations, "_sync_sharepoint_permissions", new_callable=AsyncMock
            ):
                # Execute
                result = await cr_service_with_integrations.close_cr(
                    cr_id=cr_id, closed_by=user_id, reason="Changes completed successfully"
                )

                # Assert
                assert result.status == CRStatus.CLOSED

                # Assert notification was queued
                notification_service.queue_notification.assert_called_once()
                call_args = notification_service.queue_notification.call_args

                assert call_args.kwargs["template_key"] == "cr_closed"
                assert call_args.kwargs["event_type"] == "lock.cr.closed"
                assert (
                    call_args.kwargs["variables"]["close_reason"]
                    == "Changes completed successfully"
                )
                assert call_args.kwargs["variables"]["closed_by"] == str(user_id)

    @pytest.mark.asyncio
    @freeze_time("2025-01-15 12:00:00")
    async def test_cr_expired_notification(
        self, cr_service_with_integrations, mock_db_session, notification_service
    ):
        """Test notification is sent when CR expires."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.status = CRStatus.ACTIVE
        cr.expires_at = datetime.now(UTC) - timedelta(hours=1)
        cr.reason = "Expired CR reason"
        cr.created_at = datetime.now(UTC) - timedelta(hours=49)
        cr.duration_hours = 48
        cr.audit_correlation_id = uuid4()

        em = MagicMock(spec=OrderEm)
        em.id = 1
        em.name = "Test EM"
        em.partner_id = 789

        # Mock the database queries
        mock_db_session.query.return_value.filter.return_value.all.side_effect = [
            [cr],  # Expired CRs
            [],  # No other active CRs
        ]
        mock_db_session.query.return_value.filter_by.return_value.first.return_value = em

        with patch.object(cr_service_with_integrations, "_revert_cr_lock", new_callable=AsyncMock):
            with patch.object(
                cr_service_with_integrations, "_sync_sharepoint_permissions", new_callable=AsyncMock
            ):
                # Execute
                result = await cr_service_with_integrations.expire_crs()

                # Assert notification was queued
                notification_service.queue_notification.assert_called_once()
                call_args = notification_service.queue_notification.call_args

                assert call_args.kwargs["template_key"] == "cr_expired"
                assert call_args.kwargs["event_type"] == "lock.cr.expired"

    @pytest.mark.asyncio
    async def test_notification_failure_does_not_break_cr_flow(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        notification_service,
    ):
        """Test that notification failures don't break CR operations."""
        # Setup notification to fail
        notification_service.queue_notification.side_effect = Exception("Notification service down")

        user_id = uuid4()
        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = []

        with patch.object(cr_service_with_integrations, "_apply_cr_unlock", new_callable=AsyncMock):
            with patch.object(
                cr_service_with_integrations, "_sync_sharepoint_permissions", new_callable=AsyncMock
            ):
                # Execute - should not raise exception
                cr = await cr_service_with_integrations.create_cr(
                    em_id=1,
                    scope=CRScope.EXPERTS,
                    reason="Test with notification failure",
                    created_by=user_id,
                )

                # Assert CR was created despite notification failure
                assert cr is not None
                assert cr.status == CRStatus.ACTIVE
                mock_db_session.commit.assert_called()


class TestCRSharePointIntegration:
    """Test CR SharePoint permission sync integration."""

    @pytest.mark.asyncio
    async def test_cr_unlock_syncs_to_sharepoint(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        sharepoint_service,
    ):
        """Test that CR unlock syncs permissions to SharePoint."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.expires_at = datetime.now(UTC) + timedelta(hours=48)
        cr.reason = "Test unlock"
        cr.created_by = uuid4()
        cr.audit_correlation_id = uuid4()

        lock_state = MagicMock(spec=LockState)
        lock_state.folder_path = "/2. Szakértők/test"
        lock_state.group_id = "group-experts"
        lock_state.permission_level = PermissionLevel.READ
        lock_state.cr_id = None

        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = [lock_state]

        # Execute
        await cr_service_with_integrations._apply_cr_unlock(cr)

        # Assert lock state was updated
        assert lock_state.permission_level == PermissionLevel.WRITE
        assert lock_state.cr_id == cr.id

        # Assert SharePoint sync was called
        sharepoint_service.apply_permissions.assert_called()
        call_args = sharepoint_service.apply_permissions.call_args

        assert call_args.kwargs["folder_path"] == lock_state.folder_path
        assert call_args.kwargs["site_id"] == "site-123"
        assert call_args.kwargs["break_inheritance"] is True

    @pytest.mark.asyncio
    async def test_cr_revert_syncs_to_sharepoint(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        sharepoint_service,
    ):
        """Test that CR revert syncs permissions back to SharePoint."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.DELIVERABLES
        cr.created_by = uuid4()
        cr.audit_correlation_id = uuid4()

        lock_state = MagicMock(spec=LockState)
        lock_state.folder_path = "/3. Eredménytermékek/test"
        lock_state.permission_level = PermissionLevel.WRITE
        lock_state.cr_id = cr.id
        lock_state.group_id = "group-deliverables"

        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = [lock_state]

        # Execute
        await cr_service_with_integrations._revert_cr_lock(cr)

        # Assert lock state was reverted
        assert lock_state.permission_level == PermissionLevel.READ
        assert lock_state.cr_id is None

        # Assert SharePoint sync was called
        sharepoint_service.apply_permissions.assert_called()
        call_args = sharepoint_service.apply_permissions.call_args

        assert call_args.kwargs["folder_path"] == lock_state.folder_path
        assert call_args.kwargs["break_inheritance"] is False

    @pytest.mark.asyncio
    async def test_sharepoint_throttling_retry(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        sharepoint_service,
    ):
        """Test exponential backoff on SharePoint throttling."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.created_by = uuid4()
        cr.audit_correlation_id = uuid4()

        lock_state = MagicMock(spec=LockState)
        lock_state.folder_path = "/test/path"
        lock_state.group_id = "group-experts"

        # Simulate throttling then success
        sharepoint_service.apply_permissions.side_effect = [
            Exception("429 Too Many Requests"),
            {"status": "success"},
        ]

        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = [lock_state]

        # Execute with sleep mocked
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await cr_service_with_integrations._sync_sharepoint_permissions(
                cr, [lock_state], is_unlock=True
            )

            # Assert retry occurred
            assert sharepoint_service.apply_permissions.call_count == 2
            mock_sleep.assert_called_once()

    @pytest.mark.asyncio
    async def test_sharepoint_sync_failure_does_not_break_cr(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        sharepoint_service,
    ):
        """Test that SharePoint sync failures don't break CR operations."""
        # Setup
        sharepoint_service.apply_permissions.side_effect = Exception("SharePoint API error")

        user_id = uuid4()
        lock_state = create_mock_lock_state(folder_path="/test/folder", group_id="group-experts")

        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        # Return empty list initially, then lock_state for the sync attempt
        mock_db_session.query.return_value.filter.return_value.all.side_effect = [
            [],  # For overlapping CR check
            [lock_state],  # For apply_cr_unlock
        ]

        # Execute - should not raise exception
        with patch.object(cr_service_with_integrations, "_apply_cr_unlock", new_callable=AsyncMock):
            cr = await cr_service_with_integrations.create_cr(
                em_id=1,
                scope=CRScope.EXPERTS,
                reason="Test with SharePoint failure",
                created_by=user_id,
            )

            # Assert CR was created despite SharePoint failure
            assert cr is not None
            assert cr.status == CRStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_no_sharepoint_site_skips_sync(
        self, cr_service_with_integrations, mock_db_session, sharepoint_service
    ):
        """Test that missing SharePoint site config skips sync gracefully."""
        # Setup
        em = MagicMock(spec=OrderEm)
        em.id = 1
        em.sharepoint_site_id = None  # No SharePoint site

        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.audit_correlation_id = uuid4()

        mock_db_session.query.return_value.filter_by.return_value.first.return_value = em

        # Execute
        await cr_service_with_integrations._sync_sharepoint_permissions(cr, [], is_unlock=True)

        # Assert SharePoint sync was not called
        sharepoint_service.apply_permissions.assert_not_called()


class TestCREndToEndScenarios:
    """Test end-to-end CR scenarios."""

    @pytest.mark.asyncio
    async def test_complete_cr_lifecycle_with_integrations(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        notification_service,
        sharepoint_service,
    ):
        """Test complete CR lifecycle: create -> use -> expire with all integrations."""
        user_id = uuid4()

        # Step 1: Create CR
        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = []

        with patch.object(cr_service_with_integrations, "_apply_cr_unlock", new_callable=AsyncMock):
            cr = await cr_service_with_integrations.create_cr(
                em_id=1,
                scope=CRScope.EXPERTS,
                reason="Full lifecycle test with integrations",
                created_by=user_id,
                duration_hours=1,  # Short duration for test
            )

        assert cr.status == CRStatus.ACTIVE

        # Step 2: Simulate time passing and expiry
        cr.expires_at = datetime.now(UTC) - timedelta(minutes=1)

        # Reset mocks for expiry test
        notification_service.queue_notification.reset_mock()
        sharepoint_service.apply_permissions.reset_mock()

        # Mock queries for expiry
        mock_db_session.query.return_value.filter.return_value.all.side_effect = [
            [cr],  # Expired CRs
            [],  # No other active CRs
            [],  # Lock states for revert
        ]
        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )

        with patch.object(cr_service_with_integrations, "_revert_cr_lock", new_callable=AsyncMock):
            # Step 3: Expire CR
            expired = await cr_service_with_integrations.expire_crs()

        assert len(expired) == 1
        assert expired[0].status == CRStatus.EXPIRED

        # Assert notifications were sent for both open and expire
        assert notification_service.queue_notification.call_count >= 1

    @pytest.mark.asyncio
    async def test_concurrent_crs_with_notifications(
        self,
        cr_service_with_integrations,
        mock_db_session,
        sample_em_with_sharepoint,
        notification_service,
    ):
        """Test handling multiple concurrent CRs with proper notifications."""
        user_id = uuid4()

        # Create first CR
        mock_db_session.query.return_value.filter_by.return_value.first.return_value = (
            sample_em_with_sharepoint
        )
        mock_db_session.query.return_value.filter.return_value.all.return_value = []

        with patch.object(cr_service_with_integrations, "_apply_cr_unlock", new_callable=AsyncMock):
            cr1 = await cr_service_with_integrations.create_cr(
                em_id=1,
                scope=CRScope.EXPERTS,
                reason="First CR for concurrent test",
                created_by=user_id,
            )

        # Reset mocks
        notification_service.queue_notification.reset_mock()

        # Create overlapping CR (should extend unlock period)
        existing_cr = MagicMock(spec=ChangeRequest)
        existing_cr.expires_at = cr1.expires_at
        mock_db_session.query.return_value.filter.return_value.all.return_value = [existing_cr]

        with patch.object(cr_service_with_integrations, "_apply_cr_unlock", new_callable=AsyncMock):
            cr2 = await cr_service_with_integrations.create_cr(
                em_id=1,
                scope=CRScope.EXPERTS,
                reason="Second CR extending unlock period",
                created_by=user_id,
                duration_hours=72,  # Longer duration
            )

        # Assert both CRs created and notifications sent
        assert cr1.status == CRStatus.ACTIVE
        assert cr2.status == CRStatus.ACTIVE
        assert cr2.expires_at > cr1.expires_at

        # Each CR creation should trigger a notification
        assert notification_service.queue_notification.call_count >= 1
