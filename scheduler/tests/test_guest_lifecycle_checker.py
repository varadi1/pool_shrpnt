"""
Tests for guest lifecycle checker scheduler task.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from freezegun import freeze_time
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from api.models.guest import GuestStatus, GuestUser
from scheduler.tasks.guest_lifecycle_checker import GuestLifecycleCheckerTask


@pytest.fixture
def mock_guest_service():
    """Mock guest service."""
    service = MagicMock()
    service.revoke_guest = AsyncMock(return_value={"success": True})
    service.purge_revoked_guest = AsyncMock(return_value={"success": True})
    return service


@pytest.fixture
def mock_lifecycle_service():
    """Mock lifecycle service."""
    service = MagicMock()
    service.check_and_enforce_expiry = AsyncMock(return_value={"expired": []})
    return service


@pytest.fixture
def mock_notification_service():
    """Mock notification service."""
    service = MagicMock()
    service.send_notification = AsyncMock(return_value={"success": True})
    return service


@pytest.fixture
def mock_distributed_lock():
    """Mock distributed lock."""
    lock = MagicMock()
    lock.__aenter__ = AsyncMock(return_value=lock)
    lock.__aexit__ = AsyncMock(return_value=None)
    return lock


@pytest.fixture
def lifecycle_checker_task(
    mock_guest_service,
    mock_lifecycle_service,
    mock_notification_service,
    mock_distributed_lock
):
    """Create lifecycle checker task with mocked dependencies."""
    task = GuestLifecycleCheckerTask()
    task.guest_service = mock_guest_service
    task.lifecycle_service = mock_lifecycle_service
    task.notification_service = mock_notification_service
    task.lock = mock_distributed_lock
    return task


def create_mock_guest(
    id: str = None,
    email: str = None,
    status: GuestStatus = GuestStatus.ACCEPTED,
    expires_at: datetime = None,
    revoked_at: datetime = None,
    last_notification_at: datetime = None
):
    """Helper to create mock guest objects."""
    guest = MagicMock(spec=GuestUser)
    guest.id = id or str(uuid4())
    guest.email = email or f"guest{guest.id}@example.com"
    guest.display_name = f"Guest {guest.id}"
    guest.status = status
    guest.expires_at = expires_at
    guest.revoked_at = revoked_at
    guest.last_notification_at = last_notification_at
    guest.deleted_at = None
    guest.partner_company = MagicMock(name="Test Partner")
    return guest


@pytest.mark.asyncio
class TestGuestLifecycleCheckerTask:
    """Test suite for guest lifecycle checker task."""
    
    async def test_execute_with_lock(self, lifecycle_checker_task):
        """Test that execute acquires distributed lock."""
        context = {"correlation_id": "test-123"}
        
        with patch.object(lifecycle_checker_task, "_process_expired_guests", new_callable=AsyncMock) as mock_process, \
             patch.object(lifecycle_checker_task, "_send_expiry_notifications", new_callable=AsyncMock) as mock_notify, \
             patch.object(lifecycle_checker_task, "_purge_old_guests", new_callable=AsyncMock) as mock_purge:
            
            mock_process.return_value = {"revoked_count": 5, "errors": []}
            mock_notify.return_value = {"sent_count": 3, "errors": []}
            mock_purge.return_value = {"purged_count": 2, "errors": []}
            
            results = await lifecycle_checker_task.execute(context)
            
            # Verify lock was acquired
            lifecycle_checker_task.lock.__aenter__.assert_called_once()
            lifecycle_checker_task.lock.__aexit__.assert_called_once()
            
            # Verify all sub-tasks were called
            mock_process.assert_called_once_with("test-123")
            mock_notify.assert_called_once_with("test-123")
            mock_purge.assert_called_once_with("test-123")
            
            # Verify results
            assert results["expired_count"] == 5
            assert results["notified_count"] == 3
            assert results["purged_count"] == 2
            assert len(results["errors"]) == 0
    
    @freeze_time("2025-01-15 02:00:00")
    async def test_process_expired_guests(self, lifecycle_checker_task):
        """Test processing of expired guests."""
        # Create mock expired guests
        expired_guests = [
            create_mock_guest(
                id="guest1",
                expires_at=datetime(2025, 1, 14, 0, 0, 0, tzinfo=timezone.utc),
                status=GuestStatus.ACCEPTED
            ),
            create_mock_guest(
                id="guest2",
                expires_at=datetime(2025, 1, 10, 0, 0, 0, tzinfo=timezone.utc),
                status=GuestStatus.ACCEPTED
            )
        ]
        
        # Mock database session and query
        mock_session = AsyncMock(spec=AsyncSession)
        mock_query_result = MagicMock()
        mock_query_result.scalars.return_value.all.return_value = expired_guests
        mock_session.execute.return_value = mock_query_result
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session, \
             patch.object(lifecycle_checker_task, "_send_expiry_notification", new_callable=AsyncMock) as mock_notify:
            
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            
            results = await lifecycle_checker_task._process_expired_guests("test-123")
            
            # Verify revocation was called for each expired guest
            assert lifecycle_checker_task.guest_service.revoke_guest.call_count == 2
            lifecycle_checker_task.guest_service.revoke_guest.assert_any_call(
                guest_id="guest1",
                revoked_by="system",
                reason="Automatic revocation due to expiry",
                correlation_id="test-123"
            )
            
            # Verify notifications were sent
            assert mock_notify.call_count == 2
            
            # Verify results
            assert results["revoked_count"] == 2
            assert len(results["errors"]) == 0
    
    @freeze_time("2025-01-15 02:00:00")
    async def test_send_expiry_notifications(self, lifecycle_checker_task):
        """Test sending expiry warning notifications."""
        # Create guests expiring in different timeframes
        expiring_soon = create_mock_guest(
            id="guest1",
            expires_at=datetime(2025, 1, 20, 0, 0, 0, tzinfo=timezone.utc),  # 5 days
            status=GuestStatus.ACCEPTED,
            last_notification_at=None
        )
        expiring_later = create_mock_guest(
            id="guest2",
            expires_at=datetime(2025, 1, 22, 0, 0, 0, tzinfo=timezone.utc),  # 7 days
            status=GuestStatus.ACCEPTED,
            last_notification_at=None
        )
        
        mock_guests = [expiring_soon, expiring_later]
        
        # Mock database session
        mock_session = AsyncMock(spec=AsyncSession)
        mock_query_result = MagicMock()
        mock_query_result.scalars.return_value.all.return_value = mock_guests
        mock_session.execute.return_value = mock_query_result
        mock_session.commit = AsyncMock()
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session, \
             patch.object(lifecycle_checker_task, "_get_admin_emails", new_callable=AsyncMock) as mock_get_admins:
            
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            mock_get_admins.return_value = ["admin@example.com"]
            
            results = await lifecycle_checker_task._send_expiry_notifications("test-123")
            
            # Verify notifications were sent
            assert lifecycle_checker_task.notification_service.send_notification.call_count == 2
            
            # Check notification data
            call_args = lifecycle_checker_task.notification_service.send_notification.call_args_list
            first_call = call_args[0][1]
            assert first_call["type"] == "GUEST_EXPIRY_WARNING"
            assert first_call["recipients"] == ["admin@example.com"]
            assert first_call["data"]["days"] == 5  # Days until expiry
            assert first_call["data"]["guest_email"] == "guestguest1@example.com"
            
            # Verify results
            assert results["sent_count"] == 2
            assert len(results["errors"]) == 0
    
    @freeze_time("2025-02-15 02:00:00")
    async def test_purge_old_guests(self, lifecycle_checker_task):
        """Test purging of old revoked guests."""
        # Create revoked guests with different revocation dates
        old_revoked = create_mock_guest(
            id="guest1",
            status=GuestStatus.REVOKED,
            revoked_at=datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)  # 45 days ago
        )
        recent_revoked = create_mock_guest(
            id="guest2",
            status=GuestStatus.REVOKED,
            revoked_at=datetime(2025, 2, 1, 0, 0, 0, tzinfo=timezone.utc)  # 14 days ago
        )
        
        # Only old_revoked should be purged (> 30 days)
        mock_guests = [old_revoked]
        
        # Mock database session
        mock_session = AsyncMock(spec=AsyncSession)
        mock_query_result = MagicMock()
        mock_query_result.scalars.return_value.all.return_value = mock_guests
        mock_session.execute.return_value = mock_query_result
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session:
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            
            results = await lifecycle_checker_task._purge_old_guests("test-123")
            
            # Verify purge was called only for old guest
            assert lifecycle_checker_task.guest_service.purge_revoked_guest.call_count == 1
            lifecycle_checker_task.guest_service.purge_revoked_guest.assert_called_with(
                guest_id="guest1",
                correlation_id="test-123"
            )
            
            # Verify results
            assert results["purged_count"] == 1
            assert len(results["errors"]) == 0
    
    async def test_handle_revocation_failure(self, lifecycle_checker_task):
        """Test error handling when revocation fails."""
        expired_guest = create_mock_guest(
            id="guest1",
            expires_at=datetime(2025, 1, 14, 0, 0, 0, tzinfo=timezone.utc),
            status=GuestStatus.ACCEPTED
        )
        
        # Mock revocation failure
        lifecycle_checker_task.guest_service.revoke_guest.side_effect = Exception("Graph API error")
        
        mock_session = AsyncMock(spec=AsyncSession)
        mock_query_result = MagicMock()
        mock_query_result.scalars.return_value.all.return_value = [expired_guest]
        mock_session.execute.return_value = mock_query_result
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session:
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            
            results = await lifecycle_checker_task._process_expired_guests("test-123")
            
            # Verify error was captured
            assert results["revoked_count"] == 0
            assert len(results["errors"]) == 1
            assert "Graph API error" in results["errors"][0]
    
    async def test_notification_already_sent(self, lifecycle_checker_task):
        """Test that notifications are not resent within 24 hours."""
        # Guest with recent notification
        guest_notified = create_mock_guest(
            id="guest1",
            expires_at=datetime(2025, 1, 20, 0, 0, 0, tzinfo=timezone.utc),
            status=GuestStatus.ACCEPTED,
            last_notification_at=datetime(2025, 1, 14, 12, 0, 0, tzinfo=timezone.utc)  # 14 hours ago
        )
        
        mock_session = AsyncMock(spec=AsyncSession)
        mock_query_result = MagicMock()
        mock_query_result.scalars.return_value.all.return_value = []  # No guests match criteria
        mock_session.execute.return_value = mock_query_result
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session:
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            
            with freeze_time("2025-01-15 02:00:00"):
                results = await lifecycle_checker_task._send_expiry_notifications("test-123")
            
            # Verify no notifications were sent
            assert lifecycle_checker_task.notification_service.send_notification.call_count == 0
            assert results["sent_count"] == 0
    
    async def test_batch_size_limit(self, lifecycle_checker_task):
        """Test that batch size is respected."""
        lifecycle_checker_task.batch_size = 2
        
        # Create more guests than batch size
        expired_guests = [
            create_mock_guest(id=f"guest{i}", status=GuestStatus.ACCEPTED)
            for i in range(5)
        ]
        
        mock_session = AsyncMock(spec=AsyncSession)
        mock_query = MagicMock()
        mock_query.limit.return_value = mock_query
        mock_query_result = MagicMock()
        # Only return batch_size number of guests
        mock_query_result.scalars.return_value.all.return_value = expired_guests[:2]
        mock_session.execute.return_value = mock_query_result
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session, \
             patch.object(lifecycle_checker_task, "_send_expiry_notification", new_callable=AsyncMock):
            
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            
            results = await lifecycle_checker_task._process_expired_guests("test-123")
            
            # Verify only batch_size guests were processed
            assert lifecycle_checker_task.guest_service.revoke_guest.call_count == 2
            assert results["revoked_count"] == 2
    
    async def test_configurable_time_windows(self, lifecycle_checker_task):
        """Test that time windows are configurable."""
        lifecycle_checker_task.expiry_warning_days = 14
        lifecycle_checker_task.purge_after_days = 60
        
        with freeze_time("2025-01-15"):
            # Guest expiring in 14 days should trigger warning
            guest = create_mock_guest(
                id="guest1",
                expires_at=datetime(2025, 1, 29, 0, 0, 0, tzinfo=timezone.utc),
                status=GuestStatus.ACCEPTED
            )
            
            mock_session = AsyncMock(spec=AsyncSession)
            mock_query_result = MagicMock()
            mock_query_result.scalars.return_value.all.return_value = [guest]
            mock_session.execute.return_value = mock_query_result
            mock_session.commit = AsyncMock()
            
            with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session, \
                 patch.object(lifecycle_checker_task, "_get_admin_emails", new_callable=AsyncMock) as mock_get_admins:
                
                mock_get_session.return_value.__aenter__.return_value = mock_session
                mock_get_session.return_value.__aexit__.return_value = None
                mock_get_admins.return_value = ["admin@example.com"]
                
                results = await lifecycle_checker_task._send_expiry_notifications("test-123")
                
                # Verify notification was sent for 14-day window
                assert lifecycle_checker_task.notification_service.send_notification.call_count == 1
                assert results["sent_count"] == 1


@pytest.mark.asyncio
class TestIntegrationScenarios:
    """Integration test scenarios."""
    
    async def test_full_lifecycle_flow(self, lifecycle_checker_task):
        """Test complete lifecycle from expiry warning to purge."""
        correlation_id = "integration-test"
        
        # Day 1: Guest approaching expiry (7 days out)
        with freeze_time("2025-01-08"):
            guest = create_mock_guest(
                id="guest1",
                expires_at=datetime(2025, 1, 15, 0, 0, 0, tzinfo=timezone.utc),
                status=GuestStatus.ACCEPTED
            )
            
            mock_session = AsyncMock(spec=AsyncSession)
            mock_query_result = MagicMock()
            mock_query_result.scalars.return_value.all.return_value = [guest]
            mock_session.execute.return_value = mock_query_result
            mock_session.commit = AsyncMock()
            
            with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session, \
                 patch.object(lifecycle_checker_task, "_get_admin_emails", new_callable=AsyncMock) as mock_get_admins:
                
                mock_get_session.return_value.__aenter__.return_value = mock_session
                mock_get_session.return_value.__aexit__.return_value = None
                mock_get_admins.return_value = ["admin@example.com"]
                
                # Should send warning notification
                results = await lifecycle_checker_task._send_expiry_notifications(correlation_id)
                assert results["sent_count"] == 1
        
        # Day 2: Guest expires and gets revoked
        with freeze_time("2025-01-16"):
            guest.status = GuestStatus.ACCEPTED  # Still active but expired
            
            mock_session = AsyncMock(spec=AsyncSession)
            mock_query_result = MagicMock()
            mock_query_result.scalars.return_value.all.return_value = [guest]
            mock_session.execute.return_value = mock_query_result
            
            with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session, \
                 patch.object(lifecycle_checker_task, "_send_expiry_notification", new_callable=AsyncMock):
                
                mock_get_session.return_value.__aenter__.return_value = mock_session
                mock_get_session.return_value.__aexit__.return_value = None
                
                # Should revoke expired guest
                results = await lifecycle_checker_task._process_expired_guests(correlation_id)
                assert results["revoked_count"] == 1
        
        # Day 3: After 30 days, guest gets purged
        with freeze_time("2025-02-16"):
            guest.status = GuestStatus.REVOKED
            guest.revoked_at = datetime(2025, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
            
            mock_session = AsyncMock(spec=AsyncSession)
            mock_query_result = MagicMock()
            mock_query_result.scalars.return_value.all.return_value = [guest]
            mock_session.execute.return_value = mock_query_result
            
            with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session:
                mock_get_session.return_value.__aenter__.return_value = mock_session
                mock_get_session.return_value.__aexit__.return_value = None
                
                # Should purge old revoked guest
                results = await lifecycle_checker_task._purge_old_guests(correlation_id)
                assert results["purged_count"] == 1