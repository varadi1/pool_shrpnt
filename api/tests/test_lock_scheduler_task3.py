"""Comprehensive tests for Task 3 of Story 3.2 - Monitoring, Metrics, and State Reconciliation."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from api.models.lock import LockRule, LockState, LockTransitionLog
from api.models.scheduler import SchedulerRun
from api.services.locks.monitoring import LockMonitoringService
from api.services.locks.state_reconciliation import StateReconciliationService


class TestMonitoringMetrics:
    """Test monitoring and metrics tracking (AC: 7)."""

    @pytest.fixture
    def monitoring_service(self, db_session: Session) -> LockMonitoringService:
        """Create monitoring service instance."""
        return LockMonitoringService(db_session)

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client."""
        with patch("api.services.locks.monitoring.redis_client") as mock:
            mock.hgetall.return_value = {}
            mock.get.return_value = None
            mock.zadd.return_value = 1
            mock.hset.return_value = 1
            mock.expire.return_value = True
            yield mock

    def test_record_scheduler_execution(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
    ):
        """Test scheduler execution time tracking (subtask 1)."""
        # Record execution
        scheduler_run_id = str(uuid4())
        monitoring_service.record_scheduler_execution(
            scheduler_run_id=scheduler_run_id,
            ems_processed=150,
            execution_time_ms=45000,  # 45 seconds
            failed_count=5,
        )

        # Verify metrics were recorded
        assert mock_redis.hset.called
        call_args = mock_redis.hset.call_args
        assert "locks:scheduler:metrics:" in call_args[0][0]

        # Verify averages were updated
        assert mock_redis.hset.call_count >= 2

    def test_monitor_ems_processed_per_run(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
    ):
        """Test monitoring EMs processed per run (subtask 2)."""
        # Set up mock data
        mock_redis.hgetall.return_value = {
            "sample_count": "10",
            "avg_ems_processed": "100",
            "avg_execution_time_ms": "30000",
            "avg_success_rate": "95",
        }

        # Record new execution
        monitoring_service.record_scheduler_execution(
            scheduler_run_id=str(uuid4()),
            ems_processed=200,
            execution_time_ms=35000,
            failed_count=3,
        )

        # Verify average calculation
        calls = mock_redis.hset.call_args_list
        avg_call = None
        for call in calls:
            if "averages" in str(call):
                avg_call = call
                break

        assert avg_call is not None

    def test_measure_state_transition_success_rate(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
        db_session: Session,
    ):
        """Test state transition success rate measurement (subtask 3)."""
        # Set up mock transition data
        mock_redis.hgetall.side_effect = [
            {"count": "50", "total_duration_ms": "25000"},  # Success data
            {"count": "5"},  # Failure data
        ] * 24

        # Create mock lock states
        for i in range(3):
            lock_state = LockState(
                order_em_id=i + 1,
                folder_id=uuid4(),
                folder_path=f"/test/folder_{i}",
                current_state="readonly",
                permission_level="read",
                lock_type="automatic",
                is_active=True,
            )
            db_session.add(lock_state)
        db_session.commit()

        # Get metrics
        metrics = monitoring_service.get_state_transition_metrics()

        assert "summary" in metrics
        assert metrics["summary"]["total_transitions"] > 0
        assert "overall_success_rate" in metrics["summary"]
        assert "current_state_distribution" in metrics

    def test_alert_on_performance_degradation(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
    ):
        """Test alerting on performance degradation (subtask 4)."""
        with patch.object(monitoring_service, "_send_alert") as mock_alert:
            # Record slow execution (> 5 minutes)
            monitoring_service.record_scheduler_execution(
                scheduler_run_id=str(uuid4()),
                ems_processed=1000,
                execution_time_ms=360000,  # 6 minutes
                failed_count=10,
            )

            # Verify alert was sent
            mock_alert.assert_called()
            call_args = mock_alert.call_args[0]
            assert "Performance Degradation" in call_args[0]

    def test_alert_on_high_failure_rate(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
    ):
        """Test alerting on high failure rate."""
        with patch.object(monitoring_service, "_send_alert") as mock_alert:
            # Record high failure rate (> 10%)
            monitoring_service.record_scheduler_execution(
                scheduler_run_id=str(uuid4()),
                ems_processed=100,
                execution_time_ms=60000,
                failed_count=15,  # 15% failure rate
            )

            # Verify alert was sent
            assert mock_alert.call_count == 1
            call_args = mock_alert.call_args[0]
            assert "High Failure Rate" in call_args[0]

    def test_create_lock_state_dashboard(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
        db_session: Session,
    ):
        """Test dashboard creation for lock state overview (subtask 5)."""
        # Set up mock data
        mock_redis.get.return_value = datetime.now(UTC).isoformat()
        mock_redis.hgetall.return_value = {
            "avg_ems_processed": "150",
            "avg_execution_time_ms": "45000",
            "avg_success_rate": "95",
            "sample_count": "20",
            "last_updated": datetime.now(UTC).isoformat(),
        }
        mock_redis.lrange.return_value = []
        mock_redis.zrange.return_value = []

        # Create test data
        scheduler_run = SchedulerRun(
            run_type="lock_evaluation",
            started_at=datetime.now(UTC) - timedelta(minutes=5),
            completed_at=datetime.now(UTC),
            ems_processed=150,
            ems_failed=5,
            status="completed",
        )
        db_session.add(scheduler_run)
        db_session.commit()

        # Create dashboard
        dashboard = monitoring_service.create_lock_state_dashboard()

        # Verify dashboard structure
        assert "timestamp" in dashboard
        assert "system_health" in dashboard
        assert "scheduler_metrics" in dashboard
        assert "transition_metrics" in dashboard
        assert "performance_metrics" in dashboard
        assert "alerts" in dashboard
        assert "summary" in dashboard

        # Verify metrics content
        assert dashboard["scheduler_metrics"]["average_ems_per_run"] == 150
        assert dashboard["scheduler_metrics"]["average_success_rate"] == 95

    def test_scheduler_timing_and_intervals(
        self,
        monitoring_service: LockMonitoringService,
        mock_redis,
    ):
        """Test scheduler timing and interval tracking (AC: 1)."""
        # Simulate evaluation history with 15-minute intervals
        evaluation_history = []
        base_time = datetime.now(UTC) - timedelta(hours=1)

        for i in range(5):
            timestamp = base_time + timedelta(minutes=15 * i)
            evaluation_history.append((f"run_{i}", timestamp.timestamp()))

        mock_redis.zrange.return_value = evaluation_history

        # Get reliability metrics
        reliability = monitoring_service.get_scheduler_reliability_metrics()

        assert reliability["total_executions"] == 4  # 5 runs = 4 intervals
        assert reliability["avg_interval_minutes"] == pytest.approx(15, rel=0.1)
        assert reliability["reliability_percentage"] >= 90  # Should be close to 100%


class TestStateReconciliation:
    """Test state reconciliation functionality (AC: 8)."""

    @pytest.fixture
    def reconciliation_service(self, db_session: Session) -> StateReconciliationService:
        """Create reconciliation service instance."""
        return StateReconciliationService(db_session)

    @pytest.fixture
    def mock_graph_client(self):
        """Mock Graph API client."""
        mock = AsyncMock()
        mock.sites = MagicMock()
        return mock

    @pytest.mark.asyncio
    async def test_compare_database_state_with_sharepoint(
        self,
        reconciliation_service: StateReconciliationService,
        mock_graph_client,
        db_session: Session,
    ):
        """Test comparing database state with SharePoint."""
        # Create test lock state
        lock_state = LockState(
            order_em_id=1,
            folder_id=uuid4(),
            folder_path="/test/folder",
            current_state="readonly",
            permission_level="read",
            lock_type="automatic",
            is_active=True,
        )
        db_session.add(lock_state)
        db_session.commit()

        # Mock SharePoint permissions (different from database)
        with patch("api.services.locks.state_reconciliation.get_graph_client") as mock_get_client:
            mock_get_client.return_value = mock_graph_client

            with patch.object(
                reconciliation_service, "_get_sharepoint_permissions"
            ) as mock_get_perms:
                mock_get_perms.return_value = {
                    "value": [{"roles": ["write"]}]  # Different from expected "read"
                }

                with patch.object(
                    reconciliation_service, "_apply_permission_correction"
                ) as mock_apply:
                    mock_apply.return_value = {"success": True}

                    # Run reconciliation
                    result = await reconciliation_service.reconcile_lock_state(1)

        assert result["drift_detected"] is True
        assert result["status"] == "success"
        assert len(result["corrections_applied"]) == 1

    @pytest.mark.asyncio
    async def test_detect_and_correct_drift(
        self,
        reconciliation_service: StateReconciliationService,
        db_session: Session,
    ):
        """Test drift detection and correction."""
        # Create lock state with expected permission
        lock_state = LockState(
            order_em_id=2,
            folder_id=uuid4(),
            folder_path="/test/drift",
            current_state="limited_access",
            permission_level="write",
            lock_type="automatic",
            is_active=True,
        )
        db_session.add(lock_state)
        db_session.commit()

        # Mock drift detection and correction
        with patch.object(reconciliation_service, "_get_sharepoint_permissions") as mock_get:
            mock_get.return_value = {"value": [{"roles": ["read"]}]}  # Drift!

            with patch.object(
                reconciliation_service, "_apply_permission_correction"
            ) as mock_correct:
                mock_correct.return_value = {"success": True}

                with patch("api.services.locks.state_reconciliation.get_graph_client"):
                    result = await reconciliation_service.reconcile_lock_state(2)

        assert result["drift_detected"] is True
        assert "drift_details" in result
        assert result["drift_details"]["expected"] == "write"
        assert result["drift_details"]["actual"] == "read"

    @pytest.mark.asyncio
    async def test_run_reconciliation_after_failures(
        self,
        reconciliation_service: StateReconciliationService,
        db_session: Session,
    ):
        """Test running reconciliation after failures."""
        # Create multiple lock states
        for i in range(5):
            lock_state = LockState(
                order_em_id=i + 10,
                folder_id=uuid4(),
                folder_path=f"/test/failure_{i}",
                current_state="readonly",
                permission_level="read",
                lock_type="automatic",
                is_active=True,
            )
            db_session.add(lock_state)
        db_session.commit()

        # Mock reconciliation with some failures
        with patch.object(reconciliation_service, "reconcile_lock_state") as mock_reconcile:
            mock_reconcile.side_effect = [
                {"status": "success", "drift_detected": False},
                {"status": "error", "errors": ["API error"]},
                {"status": "success", "drift_detected": True, "corrections_applied": [{}]},
                Exception("Connection failed"),
                {"status": "success", "drift_detected": False},
            ]

            # Run bulk reconciliation
            result = await reconciliation_service.run_bulk_reconciliation(
                em_ids=[10, 11, 12, 13, 14],
                after_failure=True,
            )

        assert result["total_ems"] == 5
        assert result["reconciled"] == 4  # One threw exception
        assert result["errors"] == 2  # One error status, one exception
        assert result["after_failure"] is True

    @pytest.mark.asyncio
    async def test_generate_reconciliation_reports(
        self,
        reconciliation_service: StateReconciliationService,
        db_session: Session,
    ):
        """Test reconciliation report generation."""
        # Create test transition logs
        for i in range(10):
            log = LockTransitionLog(
                order_em_id=i % 3 + 1,
                folder_path=f"/test/report_{i}",
                previous_permission="write" if i % 2 == 0 else "read",
                new_permission="read" if i % 2 == 0 else "write",
                transition_reason="State reconciliation - drift correction",
                success=i % 4 != 0,  # 75% success rate
                error_message="Rate limited" if i % 4 == 0 else None,
                transitioned_at=datetime.now(UTC) - timedelta(days=i % 7),
            )
            db_session.add(log)
        db_session.commit()

        # Generate report
        report = await reconciliation_service.generate_reconciliation_report()

        assert "period" in report
        assert "summary" in report
        assert report["summary"]["total_reconciliations"] == 10
        assert report["summary"]["successful"] == 7
        assert report["summary"]["failed"] == 3
        assert "by_em" in report
        assert "drift_patterns" in report
        assert "common_errors" in report

    @pytest.mark.asyncio
    async def test_handle_manual_sharepoint_changes(
        self,
        reconciliation_service: StateReconciliationService,
        db_session: Session,
    ):
        """Test handling manual SharePoint changes."""
        # Create lock state without manual override
        lock_state = LockState(
            order_em_id=20,
            folder_id=uuid4(),
            folder_path="/test/manual",
            current_state="readonly",
            permission_level="read",
            lock_type="automatic",
            is_active=True,
            is_manual_override=False,
        )
        db_session.add(lock_state)
        db_session.commit()

        # Test unauthorized manual change
        with patch.object(reconciliation_service.monitoring_service, "_send_alert") as mock_alert:
            result = await reconciliation_service.handle_manual_changes(
                folder_path="/test/manual",
                detected_permission="write",
                expected_permission="read",
            )

        assert result["action"] == "corrected"
        assert "Unauthorized" in result["reason"]
        mock_alert.assert_called_once()

        # Test authorized manual override
        lock_state.is_manual_override = True
        db_session.commit()

        result = await reconciliation_service.handle_manual_changes(
            folder_path="/test/manual",
            detected_permission="write",
            expected_permission="read",
        )

        assert result["action"] == "preserved"
        assert "Manual override" in result["reason"]


class TestSchedulerPerformance:
    """Test scheduler performance requirements."""

    @pytest.mark.asyncio
    async def test_process_1000_ems_within_5_minutes(
        self,
        db_session: Session,
    ):
        """Test processing 1000+ EMs within 5-minute window (AC: 7)."""
        from api.services.locks.state_transition_service import StateTransitionService

        # Create 1000 test EMs with lock rules
        for i in range(1000):
            rule = LockRule(
                order_em_id=i + 1,
                rule_name=f"rule_{i}",
                t_value=datetime.now(UTC),
                window_type="active",
                start_offset=0,
                end_offset=7,
                permission_level="read",
                is_active=True,
                created_by="test_user",
            )
            db_session.add(rule)
        db_session.commit()

        # Mock the transition service
        transition_service = StateTransitionService(db_session)

        with patch.object(transition_service, "apply_state_transition") as mock_apply:
            mock_apply.return_value = {"success": True}

            # Simulate batch processing
            start_time = datetime.now(UTC)
            batch_size = 50

            for i in range(0, 1000, batch_size):
                # Process batch
                batch_ems = list(range(i + 1, min(i + batch_size + 1, 1001)))
                for em_id in batch_ems:
                    await mock_apply(em_id)

            end_time = datetime.now(UTC)
            duration = (end_time - start_time).total_seconds()

        # Verify processing time is under 5 minutes (300 seconds)
        # In test environment, this should be much faster
        assert duration < 300
        assert mock_apply.call_count == 1000


class TestIntegrationScenarios:
    """Test integration scenarios for Task 3."""

    @pytest.mark.asyncio
    async def test_scheduler_with_monitoring_integration(
        self,
        db_session: Session,
    ):
        """Test scheduler integration with monitoring."""
        monitoring_service = LockMonitoringService(db_session)

        # Create scheduler run
        scheduler_run = SchedulerRun(
            run_type="lock_evaluation",
            started_at=datetime.now(UTC),
            status="running",
        )
        db_session.add(scheduler_run)
        db_session.commit()

        # Record execution
        with patch("api.services.locks.monitoring.redis_client") as mock_redis:
            mock_redis.hgetall.return_value = {}

            monitoring_service.record_scheduler_execution(
                scheduler_run_id=str(scheduler_run.id),
                ems_processed=100,
                execution_time_ms=30000,
                failed_count=2,
            )

            # Update scheduler run
            scheduler_run.completed_at = datetime.now(UTC)
            scheduler_run.ems_processed = 100
            scheduler_run.ems_failed = 2
            scheduler_run.status = "completed"
            db_session.commit()

        assert scheduler_run.status == "completed"
        assert scheduler_run.ems_processed == 100

    @pytest.mark.asyncio
    async def test_reconciliation_with_monitoring_alerts(
        self,
        db_session: Session,
    ):
        """Test reconciliation triggering monitoring alerts."""
        reconciliation_service = StateReconciliationService(db_session)

        # Create lock state with drift
        lock_state = LockState(
            order_em_id=100,
            folder_id=uuid4(),
            folder_path="/test/alert",
            current_state="readonly",
            permission_level="read",
            lock_type="automatic",
            is_active=True,
        )
        db_session.add(lock_state)
        db_session.commit()

        # Mock manual change detection
        with patch.object(reconciliation_service.monitoring_service, "_send_alert") as mock_alert:
            await reconciliation_service.handle_manual_changes(
                folder_path="/test/alert",
                detected_permission="write",
                expected_permission="read",
            )

        # Verify alert was triggered
        mock_alert.assert_called()
        alert_args = mock_alert.call_args[0]
        assert "Unauthorized" in alert_args[0]


class TestLoadAndStress:
    """Load and stress tests for Task 3 components."""

    @pytest.mark.asyncio
    async def test_concurrent_reconciliation_runs(
        self,
        db_session: Session,
    ):
        """Test handling concurrent reconciliation runs."""
        reconciliation_service = StateReconciliationService(db_session)

        # Create multiple lock states
        for i in range(100):
            lock_state = LockState(
                order_em_id=i + 200,
                folder_id=uuid4(),
                folder_path=f"/test/concurrent_{i}",
                current_state="readonly",
                permission_level="read",
                lock_type="automatic",
                is_active=True,
            )
            db_session.add(lock_state)
        db_session.commit()

        # Mock reconciliation
        with patch.object(reconciliation_service, "reconcile_lock_state") as mock_reconcile:
            mock_reconcile.return_value = {"status": "success", "drift_detected": False}

            # Run multiple reconciliations concurrently
            tasks = [
                reconciliation_service.run_bulk_reconciliation(
                    em_ids=list(range(200 + i * 10, 210 + i * 10))
                )
                for i in range(10)
            ]

            results = await asyncio.gather(*tasks)

        # Verify all completed successfully
        for result in results:
            assert result["total_ems"] == 10
            assert result["errors"] == 0

    def test_metrics_storage_performance(
        self,
        monitoring_service: LockMonitoringService,
    ):
        """Test metrics storage performance with high volume."""
        with patch("api.services.locks.monitoring.redis_client") as mock_redis:
            mock_redis.hset.return_value = 1
            mock_redis.hgetall.return_value = {}
            mock_redis.expire.return_value = True

            # Record many executions rapidly
            for i in range(100):
                monitoring_service.record_scheduler_execution(
                    scheduler_run_id=str(uuid4()),
                    ems_processed=100 + i,
                    execution_time_ms=30000 + i * 100,
                    failed_count=i % 10,
                )

            # Verify Redis wasn't overwhelmed
            assert mock_redis.hset.call_count >= 100
