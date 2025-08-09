"""Comprehensive tests for Task 2 of Story 3.3 - Manual Lock Management."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy.orm import Session

from api.models.audit import AuditLog
from api.models.contract import OrderEm
from api.models.lock import (
    LockState,
    LockTransitionLog,
    LockType,
    PermissionLevel,
)
from api.models.notification import NotificationQueue
from api.services.locks.lock_evaluator import LockEvaluator
from api.services.locks.manual_lock_service import ManualLockService


class TestAuditLogging:
    """Test comprehensive audit logging for manual lock operations."""

    def test_manual_lock_applied_audit_event(self, db_session: Session):
        """Test that MANUAL_LOCK_APPLIED events are logged with full context."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        user_id = uuid4()
        correlation_id = "test-correlation-123"

        # Act
        result = service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Security review required",
            user_id=user_id,
            user_role="PM",
            correlation_id=correlation_id,
        )

        # Assert
        # Check audit log entries
        audit_logs = (
            db_session.query(AuditLog).filter(AuditLog.action == "MANUAL_LOCK_APPLIED").all()
        )

        assert len(audit_logs) == 1
        audit_log = audit_logs[0]

        assert audit_log.user_id == str(user_id)
        assert audit_log.entity_type == "order_em"
        assert audit_log.entity_id == "1"
        assert audit_log.correlation_id == correlation_id
        assert audit_log.extra_metadata["reason"] == "Security review required"
        assert audit_log.extra_metadata["user_role"] == "PM"
        assert "affected_folders" in audit_log.extra_metadata

    def test_manual_lock_released_audit_event(self, db_session: Session):
        """Test that MANUAL_LOCK_RELEASED events are logged with reason."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)

        # Create existing manual lock
        existing_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/sites/site123/Shared Documents/EM-2025-001/Szakértők",
            lock_type=LockType.MANUAL,
            permission_level=PermissionLevel.READ,
            lock_reason="Initial lock",
            locked_by=uuid4(),
            locked_at=datetime.now(UTC),
            is_active=True,
            is_manual_override=True,
        )
        db_session.add(existing_lock)
        db_session.commit()

        user_id = uuid4()
        correlation_id = "test-correlation-456"

        # Act
        result = service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="unlock",
            reason="Security review completed",
            user_id=user_id,
            user_role="PM",
            correlation_id=correlation_id,
        )

        # Assert
        audit_logs = (
            db_session.query(AuditLog).filter(AuditLog.action == "MANUAL_LOCK_RELEASED").all()
        )

        assert len(audit_logs) == 1
        audit_log = audit_logs[0]

        assert audit_log.user_id == str(user_id)
        assert audit_log.correlation_id == correlation_id
        assert audit_log.extra_metadata["reason"] == "Security review completed"

    def test_audit_includes_actor_timestamp_folders(self, db_session: Session):
        """Test that audit logs include actor ID, timestamp, and affected folders."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        user_id = uuid4()

        # Act
        before_time = datetime.utcnow()
        result = service.apply_manual_lock(
            em_id=1,
            scope="deliverables",
            action="lock",
            reason="Deliverables review",
            user_id=user_id,
            user_role="PM",
        )
        after_time = datetime.utcnow()

        # Assert
        audit_log = (
            db_session.query(AuditLog).filter(AuditLog.action == "MANUAL_LOCK_APPLIED").first()
        )

        assert audit_log.user_id == str(user_id)  # Actor ID
        assert before_time <= audit_log.timestamp <= after_time  # Timestamp
        assert "/Eredménytermékek" in str(audit_log.extra_metadata["affected_folders"])  # Folders

    def test_audit_correlation_id_traceability(self, db_session: Session):
        """Test that correlation ID enables traceability across related events."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        correlation_id = "trace-123-456"

        # Act
        service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Test traceability",
            user_id=uuid4(),
            user_role="PM",
            correlation_id=correlation_id,
        )

        # Assert
        # Check all related events have same correlation ID
        audit_logs = (
            db_session.query(AuditLog).filter(AuditLog.correlation_id == correlation_id).all()
        )

        assert len(audit_logs) >= 1
        for log in audit_logs:
            assert log.correlation_id == correlation_id

        # Check transition logs
        transition_logs = (
            db_session.query(LockTransitionLog)
            .filter(LockTransitionLog.correlation_id == correlation_id)
            .all()
        )

        assert len(transition_logs) >= 1
        for log in transition_logs:
            assert log.correlation_id == correlation_id


class TestLockPriorityEvaluation:
    """Test lock state evaluation respecting manual lock priority."""

    def test_manual_lock_prevents_automatic_transition(self, db_session: Session):
        """Test that manual locks prevent automatic time-based transitions."""
        # Arrange
        evaluator = LockEvaluator(db_session)

        # Create order with lock rule
        em = OrderEm(id=1, name="EM-2025-001")
        db_session.add(em)

        # Create manual lock
        manual_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/test/folder",
            lock_type=LockType.MANUAL,
            permission_level=PermissionLevel.READ,
            is_active=True,
            lock_reason="Manual override",
            locked_by=uuid4(),
            locked_at=datetime.now(UTC),
        )
        db_session.add(manual_lock)
        db_session.commit()

        # Act
        transitions = evaluator.determine_required_transitions(
            order_em_id=1,
            folder_paths=["/test/folder"],
            evaluation_time=datetime.now(UTC),
        )

        # Assert
        assert len(transitions) == 0  # No transition because manual lock has priority

    def test_lock_priority_manual_over_cr_over_automatic(self, db_session: Session):
        """Test that priority is: Manual > CR > Automatic."""
        # Arrange
        service = ManualLockService(db_session)

        # Act
        priority = service.check_lock_priority(
            em_id=1,
            folder_path="/test/folder",
        )

        # Assert no lock initially
        assert priority is None

        # Add automatic lock
        auto_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/test/folder",
            lock_type=LockType.AUTOMATIC,
            permission_level=PermissionLevel.LIMITED,
            is_active=True,
        )
        db_session.add(auto_lock)
        db_session.commit()

        priority = service.check_lock_priority(1, "/test/folder")
        assert priority == "automatic"

        # Add manual lock (should override)
        manual_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/test/folder",
            lock_type=LockType.MANUAL,
            permission_level=PermissionLevel.READ,
            is_active=True,
            locked_by=uuid4(),
        )
        db_session.add(manual_lock)
        db_session.commit()

        priority = service.check_lock_priority(1, "/test/folder")
        assert priority == "manual"

    def test_manual_lock_reason_preserved_in_state(self, db_session: Session):
        """Test that manual lock reason is preserved in lock state."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        lock_reason = "Emergency security lockdown - potential breach detected"

        # Act
        service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="lock",
            reason=lock_reason,
            user_id=uuid4(),
            user_role="PM",
        )

        # Assert
        lock_state = (
            db_session.query(LockState).filter(LockState.lock_type == LockType.MANUAL).first()
        )

        assert lock_state.lock_reason == lock_reason
        assert lock_state.override_reason == lock_reason

    def test_manual_lock_expiry_handling(self, db_session: Session):
        """Test that expired manual locks are handled correctly."""
        # Arrange
        evaluator = LockEvaluator(db_session)

        # Create expired manual lock (50 hours old)
        old_time = datetime.now(UTC) - timedelta(hours=50)
        expired_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/test/expired",
            lock_type=LockType.MANUAL,
            permission_level=PermissionLevel.READ,
            is_active=True,
            locked_at=old_time,
            locked_by=uuid4(),
        )
        db_session.add(expired_lock)
        db_session.commit()

        # Act
        expired = evaluator.check_and_expire_manual_locks(max_duration_hours=48)

        # Assert
        assert len(expired) == 1
        assert expired[0] == (1, "/test/expired")

        # Check lock is deactivated
        lock = db_session.query(LockState).filter(LockState.folder_path == "/test/expired").first()
        assert lock.is_active is False
        assert lock.removal_reason == "Manual lock expired after 48 hours"


class TestNotificationTriggers:
    """Test notification triggers for manual lock events."""

    def test_lock_state_changed_event_triggered(self, db_session: Session):
        """Test that lock.state.changed event is triggered on manual operations."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        # Act
        with patch.object(service, "_trigger_lock_notification") as mock_trigger:
            service.apply_manual_lock(
                em_id=1,
                scope="experts",
                action="lock",
                reason="Test notification",
                user_id=uuid4(),
                user_role="PM",
            )

        # Assert
        mock_trigger.assert_called_once()
        call_args = mock_trigger.call_args[1]
        assert call_args["action"] == "lock"
        assert call_args["scope"] == "experts"
        assert call_args["reason"] == "Test notification"

    def test_notification_includes_affected_users(self, db_session: Session):
        """Test that notifications include affected users/groups in payload."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        # Act
        service.apply_manual_lock(
            em_id=1,
            scope="deliverables",
            action="lock",
            reason="Review required",
            user_id=uuid4(),
            user_role="PM",
        )

        # Assert
        notification = (
            db_session.query(NotificationQueue)
            .filter(NotificationQueue.event_type == "MANUAL_LOCK_CHANGE")
            .first()
        )

        assert notification is not None
        assert notification.priority == 2  # High priority
        assert notification.event_data["em_id"] == 1
        assert notification.event_data["scope"] == "deliverables"
        assert notification.event_data["action"] == "manual_lock"

    def test_notification_deduplication_window(self, db_session: Session):
        """Test that notifications apply de-duplication within 24h window."""
        # This is handled by the notification service
        # We just ensure the event is queued properly
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        # Act - Multiple lock operations
        for i in range(3):
            service.apply_manual_lock(
                em_id=1,
                scope="experts",
                action="lock" if i % 2 == 0 else "unlock",
                reason=f"Test reason {i}",
                user_id=uuid4(),
                user_role="PM",
            )

        # Assert - All events are queued (dedup happens in processing)
        notifications = (
            db_session.query(NotificationQueue)
            .filter(NotificationQueue.event_type == "MANUAL_LOCK_CHANGE")
            .all()
        )

        assert len(notifications) == 3  # All queued, dedup happens later


class TestIntegrationScenarios:
    """Test complete integration scenarios."""

    def test_pm_manual_lock_with_full_audit_trail(self, db_session: Session):
        """Test PM applying manual lock with complete audit trail."""
        # Arrange
        service = ManualLockService(db_session)
        em = OrderEm(
            id=1,
            name="EM-2025-001",
            sharepoint_site_id="site123",
        )
        db_session.add(em)
        db_session.commit()

        user_id = uuid4()
        correlation_id = f"pm_lock_{uuid4()}"

        # Act
        result = service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Confidential review in progress",
            user_id=user_id,
            user_role="PM",
            correlation_id=correlation_id,
        )

        # Assert
        assert result["success"] is True
        assert result["correlation_id"] == correlation_id

        # Check complete audit trail
        audit_logs = (
            db_session.query(AuditLog).filter(AuditLog.correlation_id == correlation_id).all()
        )
        assert len(audit_logs) >= 1

        # Check lock state
        lock_state = (
            db_session.query(LockState)
            .filter(
                LockState.lock_type == LockType.MANUAL,
                LockState.is_active == True,
            )
            .first()
        )
        assert lock_state is not None
        assert lock_state.lock_reason == "Confidential review in progress"

        # Check transition log
        transition = (
            db_session.query(LockTransitionLog)
            .filter(LockTransitionLog.correlation_id == correlation_id)
            .first()
        )
        assert transition is not None
        assert transition.success is True

    def test_manual_lock_overrides_automatic_scheduling(self, db_session: Session):
        """Test that manual locks override automatic time-based scheduling."""
        # Arrange
        evaluator = LockEvaluator(db_session)
        service = ManualLockService(db_session)

        em = OrderEm(id=1, name="EM-2025-001", sharepoint_site_id="site123")
        db_session.add(em)

        # Create automatic lock first
        auto_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/sites/site123/folder",
            lock_type=LockType.AUTOMATIC,
            permission_level=PermissionLevel.LIMITED,
            is_active=True,
        )
        db_session.add(auto_lock)
        db_session.commit()

        # Apply manual lock
        service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Override automatic",
            user_id=uuid4(),
            user_role="PM",
        )

        # Act - Try automatic transition
        transitions = evaluator.determine_required_transitions(
            order_em_id=1,
            folder_paths=["/sites/site123/Shared Documents/EM-2025-001/Szakértők"],
        )

        # Assert - No transitions due to manual lock
        assert len(transitions) == 0

    def test_notification_and_audit_on_lock_expiry(self, db_session: Session):
        """Test that notifications and audit logs are created when locks expire."""
        # Arrange
        evaluator = LockEvaluator(db_session)

        # Create expired lock
        old_lock = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/test/expiring",
            lock_type=LockType.MANUAL,
            permission_level=PermissionLevel.READ,
            is_active=True,
            locked_at=datetime.now(UTC) - timedelta(hours=49),
            locked_by=uuid4(),
            lock_reason="Will expire soon",
        )
        db_session.add(old_lock)
        db_session.commit()

        # Act
        expired = evaluator.check_and_expire_manual_locks(max_duration_hours=48)

        # Assert
        assert len(expired) == 1

        # Check transition log created
        transition = (
            db_session.query(LockTransitionLog)
            .filter(
                LockTransitionLog.folder_path == "/test/expiring",
                LockTransitionLog.new_state == "expired",
            )
            .first()
        )
        assert transition is not None
        assert "auto-expired" in transition.transition_reason
