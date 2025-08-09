"""Tests for Story 3.2 Task 2: Permission reconciliation and event emission."""

import asyncio
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.audit import AuditLog
from api.models.contract import Contract, OrderEm, PartnerCompany
from api.models.lock import LockState
from api.services.locks.permission_reconciler import (
    DeadLetterQueue,
    EventEmitter,
    PermissionReconciler,
    RetryPolicy,
    SyncStatus,
)


@pytest.fixture
async def test_em_with_sharepoint(async_test_db: AsyncSession):
    """Create test EM with SharePoint configuration."""
    contract = Contract(
        contract_number="C-TEST-002",
        name="Test Contract",
        start_date=datetime.now(UTC),
        status="active",
        created_by="test_user",
    )
    async_test_db.add(contract)

    partner = PartnerCompany(
        name="Test Partner",
        short_name="TEST",
        company_code="TEST002",
    )
    async_test_db.add(partner)

    await async_test_db.flush()

    order_em = OrderEm(
        em_number="EM-2025-002",
        title="Test Order with SharePoint",
        contract_id=contract.id,
        partner_company_id=partner.id,
        year=2025,
        part="B",
        status="active",
        sharepoint_site_id="site_123",
        sharepoint_drive_id="drive_456",
        folder_structure={
            "path": "/root",
            "children": [
                {"path": "/root/documents"},
                {"path": "/root/uploads"},
            ],
        },
    )
    async_test_db.add(order_em)
    await async_test_db.commit()

    return order_em


@pytest.fixture
async def test_lock_states(async_test_db: AsyncSession, test_em_with_sharepoint):
    """Create test lock states."""
    states = [
        LockState(
            id=uuid.uuid4(),
            order_em_id=test_em_with_sharepoint.id,
            folder_path="/root/documents",
            current_state="locked",
            permission_level="readonly",
            lock_type="automatic",
            is_active=True,
            applied_by="system",
            applied_at=datetime.now(UTC),
        ),
        LockState(
            id=uuid.uuid4(),
            order_em_id=test_em_with_sharepoint.id,
            folder_path="/root/uploads",
            current_state="upload_window",
            permission_level="upload_window",
            lock_type="automatic",
            is_active=True,
            applied_by="system",
            applied_at=datetime.now(UTC),
        ),
    ]

    for state in states:
        async_test_db.add(state)

    await async_test_db.commit()
    return states


class TestRetryPolicy:
    """Test retry policy with exponential backoff (AC: 5)."""

    def test_exponential_backoff_calculation(self):
        """Test exponential backoff delay calculation."""
        policy = RetryPolicy(
            max_retries=3,
            base_delay=1.0,
            max_delay=30.0,
            exponential_base=2.0,
        )

        # First retry: 1 * 2^0 = 1
        assert policy.get_next_delay() == 1.0

        # Second retry: 1 * 2^1 = 2
        assert policy.get_next_delay() == 2.0

        # Third retry: 1 * 2^2 = 4
        assert policy.get_next_delay() == 4.0

        # Fourth attempt exceeds max_retries
        assert policy.get_next_delay() == 0
        assert not policy.should_retry()

    def test_max_delay_enforcement(self):
        """Test that delays don't exceed max_delay."""
        policy = RetryPolicy(
            max_retries=10,
            base_delay=1.0,
            max_delay=5.0,
            exponential_base=2.0,
        )

        # Get delays until we hit max
        delays = []
        for _ in range(5):
            delay = policy.get_next_delay()
            delays.append(delay)

        # Check that no delay exceeds max_delay
        assert all(d <= 5.0 for d in delays)
        assert max(delays) == 5.0

    def test_failure_recording(self):
        """Test audit trail of retry attempts."""
        policy = RetryPolicy()

        error1 = Exception("Connection timeout")
        policy.record_failure(error1, {"folder": "/test1"})

        error2 = Exception("Rate limited")
        policy.record_failure(error2, {"folder": "/test2"})

        assert len(policy.failures) == 2
        assert policy.failures[0]["error"] == "Connection timeout"
        assert policy.failures[1]["error"] == "Rate limited"
        assert "timestamp" in policy.failures[0]


class TestDeadLetterQueue:
    """Test dead letter queue for persistent failures (AC: 5)."""

    @pytest.mark.asyncio
    async def test_add_failed_sync_to_dlq(self, async_test_db):
        """Test adding failed sync to DLQ."""
        dlq = DeadLetterQueue(async_test_db)
        policy = RetryPolicy()
        policy.retry_count = 3

        lock_state_id = uuid.uuid4()
        await dlq.add_failed_sync(
            lock_state_id=lock_state_id,
            order_em_id=1,
            folder_path="/test/folder",
            error="Permission denied",
            retry_policy=policy,
        )

        # Verify audit log entry was created
        query = select(AuditLog).where(
            AuditLog.entity_type == "lock_permission_sync",
            AuditLog.action == "dlq_enqueue",
        )
        result = await async_test_db.execute(query)
        audit = result.scalar_one_or_none()

        assert audit is not None
        assert audit.entity_id == str(lock_state_id)
        assert audit.details["error"] == "Permission denied"
        assert audit.details["retry_attempts"] == 3

    @pytest.mark.asyncio
    async def test_retrieve_failed_syncs(self, async_test_db):
        """Test retrieving failed syncs from DLQ."""
        dlq = DeadLetterQueue(async_test_db)

        # Add multiple failures
        for i in range(3):
            await dlq.add_failed_sync(
                lock_state_id=uuid.uuid4(),
                order_em_id=i,
                folder_path=f"/folder_{i}",
                error=f"Error {i}",
                retry_policy=RetryPolicy(),
            )

        # Retrieve failures
        failed_syncs = await dlq.get_failed_syncs(limit=10)

        assert len(failed_syncs) == 3
        assert all("lock_state_id" in sync for sync in failed_syncs)
        assert all("details" in sync for sync in failed_syncs)


class TestEventEmitter:
    """Test event emission system (AC: 6)."""

    @pytest.mark.asyncio
    async def test_emit_state_changed_event(self, async_test_db):
        """Test emitting lock.state.changed events."""
        emitter = EventEmitter(async_test_db)

        await emitter.emit_state_changed(
            order_em_id=1,
            folder_path="/test/folder",
            old_state="unlocked",
            new_state="locked",
            permission_level="readonly",
            affected_users=["user1", "user2"],
            change_type="automatic",
        )

        assert len(emitter.event_queue) == 1
        event = emitter.event_queue[0]

        assert event["event_type"] == "lock.state.changed"
        assert event["payload"]["order_em_id"] == 1
        assert event["payload"]["folder_path"] == "/test/folder"
        assert event["payload"]["new_state"] == "locked"
        assert event["payload"]["affected_users"] == ["user1", "user2"]

    @pytest.mark.asyncio
    async def test_event_includes_affected_folders_and_users(self, async_test_db):
        """Test event payload includes affected folders and users."""
        emitter = EventEmitter(async_test_db)

        await emitter.emit_state_changed(
            order_em_id=1,
            folder_path="/root/documents",
            old_state="full_access",
            new_state="readonly",
            permission_level="readonly",
            affected_users=["team_lead", "developer1", "reviewer"],
            change_type="manual",
        )

        event = emitter.event_queue[0]
        payload = event["payload"]

        assert payload["folder_path"] == "/root/documents"
        assert "team_lead" in payload["affected_users"]
        assert "developer1" in payload["affected_users"]
        assert payload["change_type"] == "manual"

    @pytest.mark.asyncio
    async def test_cr_override_detection_support(self, async_test_db):
        """Test support for CR override detection (Story 3.5)."""
        emitter = EventEmitter(async_test_db)

        await emitter.emit_state_changed(
            order_em_id=1,
            folder_path="/critical/folder",
            old_state="automatic_lock",
            new_state="cr_locked",
            permission_level="readonly",
            affected_users=["cr_team"],
            change_type="cr_override",
        )

        event = emitter.event_queue[0]
        assert event["payload"]["change_type"] == "cr_override"

    @pytest.mark.asyncio
    async def test_event_ordering_preserved(self, async_test_db):
        """Test event ordering and delivery."""
        emitter = EventEmitter(async_test_db)

        # Emit multiple events
        for i in range(5):
            await emitter.emit_state_changed(
                order_em_id=i,
                folder_path=f"/folder_{i}",
                old_state="old",
                new_state="new",
                permission_level="readonly",
                affected_users=[],
                change_type="automatic",
            )

        # Verify order is preserved
        assert len(emitter.event_queue) == 5
        for i, event in enumerate(emitter.event_queue):
            assert event["payload"]["order_em_id"] == i

    @pytest.mark.asyncio
    async def test_flush_events(self, async_test_db):
        """Test flushing events to notification system."""
        emitter = EventEmitter(async_test_db)

        # Add events
        await emitter.emit_state_changed(
            order_em_id=1,
            folder_path="/test",
            old_state="old",
            new_state="new",
            permission_level="readonly",
            affected_users=[],
            change_type="automatic",
        )

        # Flush events
        await emitter.flush_events()

        # Queue should be empty after flush
        assert len(emitter.event_queue) == 0

        # Verify audit log was created
        query = select(AuditLog).where(AuditLog.entity_type == "lock_state_event")
        result = await async_test_db.execute(query)
        audit = result.scalar_one_or_none()
        assert audit is not None


class TestPermissionReconciler:
    """Test permission reconciliation service (AC: 8)."""

    @pytest.mark.asyncio
    @patch("api.services.locks.permission_reconciler.SharePointPermissionService")
    async def test_sync_lock_permissions(
        self,
        mock_sp_service,
        async_test_db,
        test_lock_states,
    ):
        """Test syncing lock permissions to SharePoint."""
        # Mock SharePoint service
        mock_instance = AsyncMock()
        mock_instance.apply_permissions = AsyncMock(return_value={"status": "success"})
        mock_sp_service.return_value = mock_instance

        reconciler = PermissionReconciler(async_test_db)
        reconciler.sp_service = mock_instance

        result = await reconciler.sync_lock_permissions(test_lock_states)

        assert result["total"] == 2
        assert result["succeeded"] == 2
        assert result["failed"] == 0

        # Verify apply_permissions was called for each state
        assert mock_instance.apply_permissions.call_count == 2

    @pytest.mark.asyncio
    @patch("api.services.locks.permission_reconciler.SharePointPermissionService")
    async def test_graph_api_throttling_handling(
        self,
        mock_sp_service,
        async_test_db,
        test_lock_states,
    ):
        """Test handling of Graph API throttling (429 responses)."""
        from api.core.errors import GraphAPIError

        # Mock SharePoint service to raise rate limit error
        mock_instance = AsyncMock()
        mock_instance.apply_permissions = AsyncMock(
            side_effect=[
                GraphAPIError("Rate limited", status_code=429),
                {"status": "success"},  # Success on retry
            ]
        )
        mock_sp_service.return_value = mock_instance

        reconciler = PermissionReconciler(async_test_db)
        reconciler.sp_service = mock_instance

        # Take only first lock state for testing
        result = await reconciler.sync_lock_permissions([test_lock_states[0]])

        # Should succeed after retry
        assert result["succeeded"] == 1
        assert result["failed"] == 0

        # Verify retry occurred
        assert mock_instance.apply_permissions.call_count == 2

    @pytest.mark.asyncio
    @patch("api.services.locks.permission_reconciler.SharePointPermissionService")
    async def test_compensation_for_partial_failures(
        self,
        mock_sp_service,
        async_test_db,
        test_lock_states,
    ):
        """Test compensation tasks for partial failures."""
        # Mock SharePoint service to fail permanently
        mock_instance = AsyncMock()
        mock_instance.apply_permissions = AsyncMock(side_effect=Exception("Permanent failure"))
        mock_sp_service.return_value = mock_instance

        reconciler = PermissionReconciler(async_test_db)
        reconciler.sp_service = mock_instance

        result = await reconciler.sync_lock_permissions([test_lock_states[0]])

        # Should trigger compensation
        assert result["compensated"] == 1
        assert result["failed"] == 0  # Compensated, not failed

        # Verify compensation was logged
        query = select(AuditLog).where(AuditLog.action == "compensation_triggered")
        result = await async_test_db.execute(query)
        audit = result.scalar_one_or_none()
        assert audit is not None

    @pytest.mark.asyncio
    async def test_sync_status_tracking(
        self,
        async_test_db,
        test_lock_states,
    ):
        """Test tracking sync status in database."""
        reconciler = PermissionReconciler(async_test_db)

        # Mock successful sync
        with patch.object(reconciler, "_apply_single_permission", new=AsyncMock()):
            await reconciler._sync_em_permissions(
                test_lock_states[0].order_em_id,
                [test_lock_states[0]],
                "test_correlation",
            )

        # Reload lock state
        await async_test_db.refresh(test_lock_states[0])

        assert test_lock_states[0].sharepoint_sync_status == SyncStatus.COMPLETED
        assert test_lock_states[0].sharepoint_sync_at is not None

    @pytest.mark.asyncio
    @patch("api.services.locks.permission_reconciler.SharePointPermissionService")
    async def test_state_reconciliation(
        self,
        mock_sp_service,
        async_test_db,
        test_em_with_sharepoint,
        test_lock_states,
    ):
        """Test reconciliation ensures SharePoint matches desired state (AC: 8)."""
        reconciler = PermissionReconciler(async_test_db)

        # Mock current permissions don't match expected
        with patch.object(
            reconciler,
            "_get_sharepoint_permissions",
            return_value={"roles": ["read", "write", "delete"]},  # Wrong permissions
        ):
            with patch.object(
                reconciler, "_apply_single_permission", new=AsyncMock()
            ) as mock_apply:
                result = await reconciler.reconcile_permissions(test_em_with_sharepoint.id)

        assert result["drift_detected"] == 2  # Both folders have drift
        assert result["drift_corrected"] == 2

        # Verify corrections were applied
        assert mock_apply.call_count == 2

    @pytest.mark.asyncio
    async def test_monitoring_and_alerting(
        self,
        async_test_db,
        test_lock_states,
    ):
        """Test monitoring and alerting on repeated failures."""
        reconciler = PermissionReconciler(async_test_db)

        # Simulate multiple failures
        with patch.object(
            reconciler, "_apply_single_permission", side_effect=Exception("Repeated failure")
        ):
            await reconciler.sync_lock_permissions(test_lock_states)

        # Check monitoring metrics
        metrics = reconciler.get_monitoring_metrics()

        assert metrics["metrics"]["syncs_attempted"] == 2
        assert metrics["metrics"]["syncs_failed"] == 2
        assert metrics["metrics"]["compensations_triggered"] == 2

        # Verify failures were added to DLQ
        dlq_items = await reconciler.dlq.get_failed_syncs()
        assert len(dlq_items) >= 2


class TestIntegrationScenarios:
    """Test integration scenarios with notification system."""

    @pytest.mark.asyncio
    async def test_notification_system_trigger(
        self,
        async_test_db,
        test_lock_states,
    ):
        """Test triggering notification system (Story 3.4)."""
        reconciler = PermissionReconciler(async_test_db)

        # Mock successful sync
        with patch.object(reconciler, "_apply_single_permission", new=AsyncMock()):
            with patch.object(reconciler, "_get_affected_users", return_value=["user1", "user2"]):
                await reconciler._sync_em_permissions(
                    test_lock_states[0].order_em_id,
                    [test_lock_states[0]],
                    "test_correlation",
                )

        # Check events were queued for notification
        assert len(reconciler.event_emitter.event_queue) == 1
        event = reconciler.event_emitter.event_queue[0]

        # This event would trigger Story 3.4 notification system
        assert event["event_type"] == "lock.state.changed"
        assert "affected_users" in event["payload"]

    @pytest.mark.asyncio
    async def test_performance_within_limits(self):
        """Test sync performance meets requirements."""
        reconciler = PermissionReconciler(AsyncMock())

        # Test batch processing time
        start = asyncio.get_event_loop().time()

        # Mock 100 lock states
        lock_states = [
            MagicMock(
                order_em_id=1,
                folder_path=f"/folder_{i}",
                permission_level="readonly",
            )
            for i in range(100)
        ]

        with patch.object(reconciler, "_sync_em_permissions", new=AsyncMock()):
            await reconciler.sync_lock_permissions(lock_states)

        elapsed = asyncio.get_event_loop().time() - start

        # Should process 100 items quickly (under 10 seconds with mocking)
        assert elapsed < 10
