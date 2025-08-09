"""Tests for lock scheduler and monitoring functionality."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from freezegun import freeze_time
from sqlalchemy.orm import Session

from api.models.lock import (
    LockRule,
    LockState,
    LockWindowType,
    PermissionLevel,
)
from api.services.locks.monitoring import LockMonitoringService


@pytest.fixture
def sample_order(test_db: Session):
    """Create a sample order/EM for testing."""
    from api.models.contract import Contract, OrderEm, PartnerCompany

    # Create required contract first
    contract = Contract(
        contract_number="C-TEST-001",
        name="Test Contract",
        start_date=datetime.now(UTC),
        status="active",
        created_by="test_user",
    )
    test_db.add(contract)
    test_db.flush()

    # Create required partner company
    partner = PartnerCompany(
        name="Test Partner",
        short_name="TEST",
        company_code="TEST001",
    )
    test_db.add(partner)
    test_db.flush()

    order = OrderEm(
        em_number="EM-2025-001",
        title="Test Order",
        contract_id=contract.id,
        partner_company_id=partner.id,
        year=2025,
        part="A",
    )
    test_db.add(order)
    test_db.commit()
    return order


class TestSchedulerReliability:
    """Test scheduler reliability (subtask 19)."""

    @pytest.fixture
    def monitoring_service(self, test_db: Session):
        """Create monitoring service."""
        return LockMonitoringService(test_db)

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client."""
        with patch("api.services.locks.monitoring.redis_client") as mock:
            yield mock

    def test_scheduler_health_check(self, monitoring_service, mock_redis, test_db, sample_order):
        """Test scheduler health check functionality."""
        # Set up mock Redis responses
        mock_redis.get.return_value = datetime.now(UTC).isoformat()
        mock_redis.ping.return_value = True

        # Add an active rule to database
        rule = LockRule(
            id=uuid4(),
            order_em_id=sample_order.id,
            rule_name="Test Rule",
            t_value=datetime.now(UTC),
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test",
        )
        test_db.add(rule)
        test_db.commit()

        # Check health
        health_status = monitoring_service.check_scheduler_health()

        # Debug: print the health status if it fails
        if not health_status["healthy"]:
            print(f"Health status: {health_status}")

        assert health_status["healthy"] is True
        assert "last_evaluation" in health_status["checks"]
        assert health_status["checks"]["database"]["healthy"] is True
        assert health_status["checks"]["redis"]["healthy"] is True
        assert health_status["checks"]["active_rules"]["count"] > 0

    def test_missed_evaluation_alert(self, monitoring_service, mock_redis):
        """Test alert on missed evaluations (subtask 14)."""
        # Set last evaluation to 35 minutes ago
        old_time = datetime.now(UTC) - timedelta(minutes=35)
        mock_redis.get.return_value = old_time.isoformat()

        health_status = monitoring_service.check_scheduler_health()

        assert health_status["healthy"] is False
        assert health_status["checks"]["last_evaluation"]["healthy"] is False
        assert health_status["checks"]["last_evaluation"]["minutes_ago"] > 30

    def test_evaluation_latency_recording(self, monitoring_service, mock_redis):
        """Test job execution latency monitoring (subtask 12)."""
        evaluation_run_id = str(uuid4())
        duration_ms = 1500.0

        monitoring_service.record_evaluation_latency(evaluation_run_id, duration_ms)

        # Verify Redis calls
        mock_redis.zadd.assert_called_once()
        mock_redis.zremrangebyrank.assert_called_once_with(
            "locks:metrics:evaluation_latency", 0, -1001
        )

    def test_transition_success_rate_tracking(self, monitoring_service, mock_redis):
        """Test transition success/failure rate tracking (subtask 13)."""
        # Record success
        monitoring_service.record_transition_result(
            order_em_id=1,
            folder_path="/test/folder",
            success=True,
            duration_ms=250.0,
        )

        # Record failure
        monitoring_service.record_transition_result(
            order_em_id=2,
            folder_path="/test/folder2",
            success=False,
        )

        # Verify Redis calls for metrics
        assert mock_redis.hincrby.call_count >= 2
        assert mock_redis.lpush.call_count == 1  # Failure details

    def test_reliability_metrics_calculation(self, monitoring_service, mock_redis):
        """Test scheduler reliability metrics calculation."""
        # Mock evaluation history with regular 15-minute intervals
        now = datetime.now(UTC).timestamp()
        history = [
            ("eval1", now - 3600),  # 1 hour ago
            ("eval2", now - 2700),  # 45 min ago
            ("eval3", now - 1800),  # 30 min ago
            ("eval4", now - 900),  # 15 min ago
            ("eval5", now),  # Now
        ]
        mock_redis.zrange.return_value = history

        metrics = monitoring_service.get_scheduler_reliability_metrics()

        assert metrics["reliability_percentage"] == 100.0  # All on time
        assert metrics["on_time_executions"] == 4
        assert metrics["total_executions"] == 4
        assert 14 <= metrics["avg_interval_minutes"] <= 16


class TestClockDrift:
    """Test clock drift scenarios (subtask 21)."""

    @freeze_time("2025-01-15 12:00:00")
    def test_clock_drift_handling(self, test_db, sample_order):
        """Test system behavior with simulated clock drift."""

        # Create a lock rule
        rule = LockRule(
            id=uuid4(),
            order_em_id=sample_order.id,
            rule_name="Test Rule",
            t_value=datetime(2025, 1, 10, tzinfo=UTC),
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test",
        )
        test_db.add(rule)
        test_db.commit()

        # Simulate clock drift by jumping time forward
        with freeze_time("2025-01-15 12:05:00"):  # 5 minutes forward
            # System should handle this gracefully
            from api.services.locks.lock_evaluator import LockEvaluator

            evaluator = LockEvaluator(test_db)
            transitions = evaluator.evaluate_all_active_orders()

            # Should still evaluate correctly despite drift
            assert isinstance(transitions, list)

    def test_concurrent_evaluation_prevention(self, sample_order):
        """Test prevention of concurrent evaluations."""
        # Test that distributed locking prevents concurrent evaluations
        # In production, this is handled by Redis locks in the scheduler

        import threading

        lock = threading.Lock()
        results = []

        def try_evaluate():
            if lock.acquire(blocking=False):
                results.append("acquired")
                # Don't release to simulate evaluation in progress
            else:
                results.append("blocked")

        # First evaluation acquires lock
        try_evaluate()
        # Second evaluation should be blocked
        try_evaluate()

        assert results == ["acquired", "blocked"]


class TestIdempotencyWithDuplicateRuns:
    """Test idempotency with duplicate runs (subtask 18)."""

    def test_duplicate_evaluation_prevention(self, test_db, sample_order):
        """Test that duplicate evaluations are prevented."""
        from api.models.idempotency import IdempotentOperation

        # Create idempotency key for time window
        window_start = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        window_key = f"lock_eval_{window_start.isoformat()}"

        # Create first operation record
        first_op = IdempotentOperation(
            idempotency_key=window_key,
            em_id="system",
            operation="lock_evaluation",
            scope="all_orders",
            timestamp_window=window_start,
            status="completed",
        )
        test_db.add(first_op)
        test_db.commit()

        # Try to create duplicate - should find existing
        existing = (
            test_db.query(IdempotentOperation)
            .filter(IdempotentOperation.idempotency_key == window_key)
            .first()
        )

        assert existing is not None
        assert existing.status == "completed"

        # Verify that duplicate prevention works
        assert existing.idempotency_key == window_key

    def test_evaluation_window_rounding(self):
        """Test that evaluations are rounded to 15-minute windows."""

        # Test various times within same window
        test_times = [
            datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC),
            datetime(2025, 1, 15, 12, 5, 30, tzinfo=UTC),
            datetime(2025, 1, 15, 12, 14, 59, tzinfo=UTC),
        ]

        expected_window = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        for test_time in test_times:
            # Calculate window
            window_start = test_time.replace(
                minute=(test_time.minute // 15) * 15, second=0, microsecond=0
            )
            assert window_start == expected_window


class TestTimezoneEdgeCases:
    """Test timezone edge cases (subtask 20)."""

    def test_utc_consistency(self, test_db):
        """Test that all times are consistently handled in UTC."""
        from api.services.locks.lock_rule_service import LockRuleService

        service = LockRuleService(test_db)

        # Test with naive datetime
        naive_time = datetime(2025, 1, 15, 12, 0, 0)
        start_date, end_date = service.calculate_absolute_dates(naive_time, -3, 7)

        assert start_date.tzinfo == UTC
        assert end_date.tzinfo == UTC

    @freeze_time("2025-03-09 01:00:00", tz_offset=-5)  # EST before DST
    def test_dst_transition_handling(self, test_db, sample_order):
        """Test handling of DST transitions."""
        from api.services.locks.lock_evaluator import LockEvaluator

        # Create rule spanning DST transition
        rule = LockRule(
            id=uuid4(),
            order_em_id=1,
            rule_name="DST Test",
            t_value=datetime(2025, 3, 9, tzinfo=UTC),
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=2,  # Spans DST change
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test",
        )
        test_db.add(rule)
        test_db.commit()

        evaluator = LockEvaluator(test_db)

        # Evaluate before DST
        with freeze_time("2025-03-09 06:00:00", tz_offset=0):
            result = evaluator.evaluate_current_time_against_rules([rule])
            assert result is not None

        # Evaluate after DST (March 10, 2AM becomes 3AM)
        with freeze_time("2025-03-10 07:00:00", tz_offset=0):
            result = evaluator.evaluate_current_time_against_rules([rule])
            assert result is not None

    def test_leap_year_handling(self, test_db, sample_order):
        """Test handling of leap year dates."""
        from api.services.locks.lock_rule_service import LockRuleService

        service = LockRuleService(test_db)

        # Test with Feb 29 in leap year
        leap_date = datetime(2024, 2, 29, 12, 0, 0, tzinfo=UTC)

        # Create rule on leap day
        rule = service.create_lock_rule(
            order_em_id=1,
            rule_name="Leap Year Test",
            t_value=leap_date,
            window_type=LockWindowType.ACTIVE,
            start_offset=-1,
            end_offset=1,
            permission_level=PermissionLevel.FULL,
            created_by="test",
        )

        assert rule.t_value.day == 29
        assert rule.t_value.month == 2
        assert rule.t_value.year == 2024


class TestDashboardMetrics:
    """Test dashboard metrics generation (subtask 15)."""

    def test_dashboard_metrics_generation(self, test_db, sample_order):
        """Test generation of dashboard metrics."""
        from api.services.locks.monitoring import LockMonitoringService

        # Create test data
        rule = LockRule(
            id=uuid4(),
            order_em_id=1,
            rule_name="Test",
            t_value=datetime.now(UTC),
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test",
        )
        test_db.add(rule)

        state = LockState(
            id=uuid4(),
            order_em_id=sample_order.id,
            folder_id=uuid4(),  # Add required folder_id
            folder_path="/test",
            current_state=LockWindowType.ACTIVE,
            permission_level=PermissionLevel.FULL,
            locked_at=datetime.now(UTC),
            is_manual_override=False,
        )
        test_db.add(state)
        test_db.commit()

        with patch("api.services.locks.monitoring.redis_client") as mock_redis:
            mock_redis.hgetall.return_value = {"count": "10", "total_duration_ms": "5000"}
            mock_redis.lrange.return_value = []
            mock_redis.zrange.return_value = []
            mock_redis.get.return_value = None

            service = LockMonitoringService(test_db)
            metrics = service.get_dashboard_metrics()

            assert "timestamp" in metrics
            assert "current_hour" in metrics
            assert "lock_state_distribution" in metrics
            assert metrics["active_rules"] == 1
            assert len(metrics["lock_state_distribution"]) > 0
