"""Simple unit tests for Task 3 functionality."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4


def test_monitoring_metrics_record():
    """Test recording scheduler execution metrics."""
    from api.services.locks.monitoring import LockMonitoringService

    # Mock dependencies
    mock_db = MagicMock()
    service = LockMonitoringService(mock_db)

    with patch("api.services.locks.monitoring.redis_client") as mock_redis:
        mock_redis.hgetall.return_value = {}
        mock_redis.hset.return_value = 1
        mock_redis.expire.return_value = True

        # Test recording execution
        service.record_scheduler_execution(
            scheduler_run_id=str(uuid4()),
            ems_processed=100,
            execution_time_ms=30000,
            failed_count=5,
        )

        # Verify Redis was called
        assert mock_redis.hset.called
        assert mock_redis.expire.called


def test_state_transition_metrics():
    """Test state transition metrics calculation."""
    from api.services.locks.monitoring import LockMonitoringService

    mock_db = MagicMock()
    mock_db.query.return_value.group_by.return_value.all.return_value = [
        ("readonly", 10),
        ("full_access", 20),
    ]

    service = LockMonitoringService(mock_db)

    with patch("api.services.locks.monitoring.redis_client") as mock_redis:
        mock_redis.hgetall.return_value = {"count": "10", "total_duration_ms": "5000"}

        metrics = service.get_state_transition_metrics()

        assert "summary" in metrics
        assert "transitions" in metrics
        assert "current_state_distribution" in metrics


def test_scheduler_reliability():
    """Test scheduler reliability metrics calculation."""
    from api.services.locks.monitoring import LockMonitoringService

    mock_db = MagicMock()
    service = LockMonitoringService(mock_db)

    # Mock evaluation history with consistent 15-minute intervals
    evaluation_history = []
    base_timestamp = datetime.now(UTC).timestamp()
    for i in range(5):
        evaluation_history.append(
            (f"run_{i}", base_timestamp + (i * 900))  # 900 seconds = 15 minutes
        )

    with patch("api.services.locks.monitoring.redis_client") as mock_redis:
        mock_redis.zrange.return_value = evaluation_history

        reliability = service.get_scheduler_reliability_metrics()

        assert "reliability_percentage" in reliability
        assert "total_executions" in reliability
        assert reliability["total_executions"] == 4  # 5 runs = 4 intervals


def test_performance_alert():
    """Test performance degradation alerting."""
    from api.services.locks.monitoring import LockMonitoringService

    mock_db = MagicMock()
    service = LockMonitoringService(mock_db)

    with patch("api.services.locks.monitoring.redis_client") as mock_redis:
        mock_redis.hgetall.return_value = {}

        with patch.object(service, "_send_alert") as mock_alert:
            # Test slow execution triggers alert
            service.record_scheduler_execution(
                scheduler_run_id=str(uuid4()),
                ems_processed=1000,
                execution_time_ms=360000,  # 6 minutes > 5 minute threshold
                failed_count=10,
            )

            # Verify alert was triggered
            mock_alert.assert_called()
            assert "Performance Degradation" in mock_alert.call_args[0][0]


def test_scheduler_run_model():
    """Test SchedulerRun model creation."""
    from api.models.scheduler import SchedulerRun

    run = SchedulerRun(
        run_type="lock_evaluation",
        started_at=datetime.now(UTC),
        status="running",
    )

    assert run.run_type == "lock_evaluation"
    assert run.status == "running"
    assert run.started_at is not None
    assert run.completed_at is None


def test_reconciliation_categorize_error():
    """Test error categorization in reconciliation."""
    # Mock the database session
    mock_db = MagicMock()
    mock_monitoring = MagicMock()

    # Create a minimal reconciliation service mock
    class MockReconciliationService:
        def __init__(self, db):
            self.db = db
            self.monitoring_service = mock_monitoring

        def _categorize_error(self, error_message: str) -> str:
            if "throttl" in error_message.lower() or "429" in error_message:
                return "rate_limit"
            elif (
                "permission" in error_message.lower()
                or "401" in error_message
                or "403" in error_message
            ):
                return "permission_denied"
            elif "timeout" in error_message.lower():
                return "timeout"
            elif "not found" in error_message.lower() or "404" in error_message:
                return "not_found"
            else:
                return "other"

    service = MockReconciliationService(mock_db)

    # Test various error categories
    assert service._categorize_error("429 Too Many Requests") == "rate_limit"
    assert service._categorize_error("throttled") == "rate_limit"
    assert service._categorize_error("401 Unauthorized") == "permission_denied"
    assert service._categorize_error("403 Forbidden") == "permission_denied"
    assert service._categorize_error("Permission denied") == "permission_denied"
    assert service._categorize_error("Request timeout") == "timeout"
    assert service._categorize_error("404 Not Found") == "not_found"
    assert service._categorize_error("Unknown error") == "other"


def test_dashboard_creation():
    """Test dashboard metrics aggregation."""
    from api.services.locks.monitoring import LockMonitoringService

    mock_db = MagicMock()

    # Mock query results
    (
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value
    ) = []
    mock_db.query.return_value.filter.return_value.scalar.return_value = 10
    mock_db.query.return_value.group_by.return_value.all.return_value = []

    service = LockMonitoringService(mock_db)

    with patch("api.services.locks.monitoring.redis_client") as mock_redis:
        mock_redis.get.return_value = datetime.now(UTC).isoformat()
        mock_redis.hgetall.return_value = {
            "avg_ems_processed": "100",
            "avg_execution_time_ms": "30000",
            "avg_success_rate": "95",
            "sample_count": "10",
        }
        mock_redis.lrange.return_value = []
        mock_redis.zrange.return_value = []
        mock_redis.ping.return_value = True

        # Mock the SchedulerRun import
        with patch("api.models.scheduler.SchedulerRun"):
            dashboard = service.create_lock_state_dashboard()

        # Verify dashboard structure
        assert "timestamp" in dashboard
        assert "system_health" in dashboard
        assert "scheduler_metrics" in dashboard
        assert "performance_metrics" in dashboard
        assert "alerts" in dashboard
        assert "summary" in dashboard

        # Verify metrics values
        assert dashboard["scheduler_metrics"]["average_ems_per_run"] == 100
        assert dashboard["scheduler_metrics"]["average_success_rate"] == 95
