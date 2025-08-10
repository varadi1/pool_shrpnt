"""Tests for notification monitoring and delivery tracking."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.notification import (
    NotificationLog,
)
from api.services.notifications.audit_logger import NotificationAuditLogger
from api.services.notifications.delivery_tracker import (
    DeliveryTracker,
    DeliveryWebhookHandler,
)


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_track_delivery_attempt(db_session: AsyncSession):
    """Test tracking delivery attempts."""
    tracker = DeliveryTracker(db_session)

    notification_id = uuid4()
    correlation_id = uuid4()

    # Track successful delivery
    log_entry = await tracker.track_delivery_attempt(
        notification_id=notification_id,
        channel="email",
        recipient="test@example.com",
        status="delivered",
        correlation_id=correlation_id,
    )

    assert log_entry.delivery_status == "delivered"
    assert log_entry.delivered_at is not None
    assert log_entry.recipient_email == "test@example.com"
    assert log_entry.correlation_id == correlation_id


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_track_failed_delivery(db_session: AsyncSession):
    """Test tracking failed delivery attempts."""
    tracker = DeliveryTracker(db_session)

    notification_id = uuid4()

    # Track failed delivery
    log_entry = await tracker.track_delivery_attempt(
        notification_id=notification_id,
        channel="teams",
        recipient="user@example.com",
        status="failed",
        error_message="Rate limit exceeded",
    )

    assert log_entry.delivery_status == "failed"
    assert log_entry.delivered_at is None
    assert log_entry.error_message == "Rate limit exceeded"
    assert log_entry.recipient_teams_id == "user@example.com"


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_delivery_metrics_calculation(db_session: AsyncSession):
    """Test delivery metrics calculation."""
    tracker = DeliveryTracker(db_session)

    # Create test data
    now = datetime.now(UTC)

    # Add successful deliveries
    for i in range(8):
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email=f"user{i}@example.com",
            delivery_status="delivered",
            sent_at=now - timedelta(hours=1),
            delivered_at=now - timedelta(minutes=30),
        )
        db_session.add(log)

    # Add failed deliveries
    for i in range(2):
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email=f"failed{i}@example.com",
            delivery_status="failed",
            sent_at=now - timedelta(hours=1),
            error_message="Delivery failed",
        )
        db_session.add(log)

    await db_session.commit()

    # Get metrics
    metrics = await tracker.get_delivery_metrics(hours=2)

    assert metrics["total_notifications"] == 10
    assert metrics["delivered"] == 8
    assert metrics["failed"] == 2
    assert metrics["success_rate"] == 80.0
    assert metrics["sla_met"] is False  # Below 98% threshold


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_sla_alert_triggered(db_session: AsyncSession):
    """Test SLA alert triggering."""
    tracker = DeliveryTracker(db_session)

    # Create test data with low success rate
    now = datetime.now(UTC)

    # Add mostly failed deliveries
    for i in range(20):
        status = "delivered" if i < 5 else "failed"
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email=f"user{i}@example.com",
            delivery_status=status,
            sent_at=now - timedelta(minutes=30),
        )
        db_session.add(log)

    await db_session.commit()

    # Get metrics - should trigger alert
    with patch.object(tracker, "_trigger_sla_alert") as mock_alert:
        metrics = await tracker.get_delivery_metrics(hours=1)

        assert metrics["success_rate"] == 25.0  # 5/20
        assert metrics["sla_met"] is False
        mock_alert.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_channel_metrics(db_session: AsyncSession):
    """Test channel-specific metrics."""
    tracker = DeliveryTracker(db_session)

    now = datetime.now(UTC)

    # Add email deliveries
    for i in range(5):
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email=f"user{i}@example.com",
            delivery_status="delivered",
            sent_at=now - timedelta(hours=1),
        )
        db_session.add(log)

    # Add Teams deliveries
    for i in range(3):
        log = NotificationLog(
            notification_type="test",
            channel="teams",
            recipient_teams_id=f"team{i}",
            delivery_status="delivered",
            sent_at=now - timedelta(hours=1),
        )
        db_session.add(log)

    await db_session.commit()

    # Get channel metrics
    metrics = await tracker.get_channel_metrics(hours=2)

    assert metrics["email"]["total_notifications"] == 5
    assert metrics["teams"]["total_notifications"] == 3
    assert metrics["combined"]["total_notifications"] == 8
    assert metrics["combined"]["success_rate"] == 100.0


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_failure_analysis(db_session: AsyncSession):
    """Test failure pattern analysis."""
    tracker = DeliveryTracker(db_session)

    now = datetime.now(UTC)

    # Add various failure types
    failure_types = [
        ("timeout", "Connection timeout"),
        ("timeout", "Request timeout"),
        ("rate_limit", "429 Too Many Requests"),
        ("authentication", "401 Unauthorized"),
        ("authentication", "403 Forbidden"),
    ]

    for error_type, message in failure_types:
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email="user@example.com",
            delivery_status="failed",
            sent_at=now - timedelta(hours=1),
            error_message=message,
            retry_count=2,
        )
        db_session.add(log)

    await db_session.commit()

    # Analyze failures
    analysis = await tracker.get_failure_analysis(hours=2)

    assert analysis["total_failures"] == 5
    assert "timeout" in analysis["failure_patterns"]
    assert "authentication" in analysis["failure_patterns"]
    assert analysis["failure_patterns"]["timeout"]["count"] == 2
    assert analysis["failure_patterns"]["authentication"]["count"] == 2


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_performance_metrics(db_session: AsyncSession):
    """Test performance metrics calculation."""
    tracker = DeliveryTracker(db_session)

    now = datetime.now(UTC)

    # Add deliveries with various times
    delivery_times = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30]  # seconds

    for seconds in delivery_times:
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email="user@example.com",
            delivery_status="delivered",
            sent_at=now - timedelta(seconds=seconds + 60),
            delivered_at=now - timedelta(seconds=60),
        )
        db_session.add(log)

    await db_session.commit()

    # Get performance metrics
    metrics = await tracker.get_performance_metrics(hours=2)

    assert metrics["sample_size"] == 10
    assert metrics["avg_delivery_time_seconds"] > 0
    assert metrics["min_delivery_time_seconds"] == 1.0
    assert metrics["max_delivery_time_seconds"] == 30.0
    assert metrics["p95_delivery_time_seconds"] <= 30.0


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_webhook_handler(db_session: AsyncSession):
    """Test webhook handling for delivery status."""
    handler = DeliveryWebhookHandler(db_session)

    # Create a notification log entry
    notification_id = uuid4()
    log = NotificationLog(
        notification_type="test",
        channel="email",
        recipient_email="user@example.com",
        delivery_status="pending",
        related_entity_id=notification_id,
    )
    db_session.add(log)
    await db_session.commit()

    # Handle Graph webhook
    webhook_data = {
        "messageId": str(notification_id),
        "status": "delivered",
        "timestamp": datetime.now(UTC).isoformat(),
    }

    result = await handler.handle_graph_webhook(webhook_data)

    assert result["success"] is True
    assert result["status"] == "delivered"

    # Verify status was updated
    await db_session.refresh(log)
    assert log.delivery_status == "delivered"


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_audit_logging(db_session: AsyncSession):
    """Test comprehensive audit logging."""
    audit_logger = NotificationAuditLogger(db_session)

    notification_id = uuid4()
    correlation_id = uuid4()

    # Log notification sent
    audit_entry = await audit_logger.log_notification_sent(
        notification_id=notification_id,
        template_key="test.template",
        recipients=[{"email": "user@example.com", "role": "TEST"}],
        channel="email",
        variables={"message": "Test"},
        correlation_id=correlation_id,
    )

    assert audit_entry.event_type == "NOTIFICATION_SENT"
    assert audit_entry.entity_id == str(notification_id)
    assert audit_entry.correlation_id == correlation_id

    # Log status change
    await audit_logger.log_delivery_status_change(
        notification_id=notification_id,
        old_status="pending",
        new_status="delivered",
        correlation_id=correlation_id,
    )

    # Log retry
    await audit_logger.log_retry_attempt(
        notification_id=notification_id,
        attempt_number=1,
        max_attempts=3,
        error="Temporary failure",
        correlation_id=correlation_id,
    )

    # Get audit trail
    trail = await audit_logger.get_notification_audit_trail(notification_id)

    assert len(trail) == 3
    assert trail[0].event_type == "NOTIFICATION_SENT"
    assert trail[1].event_type == "NOTIFICATION_STATUS_CHANGED"
    assert trail[2].event_type == "NOTIFICATION_RETRY"


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_audit_content_storage(db_session: AsyncSession):
    """Test storing notification content for compliance."""
    audit_logger = NotificationAuditLogger(db_session)

    notification_id = uuid4()

    # Store notification content
    rendered_content = {
        "subject": "Test Subject",
        "body": "This is a test notification body with sensitive information.",
    }

    audit_entry = await audit_logger.log_notification_content(
        notification_id=notification_id,
        rendered_content=rendered_content,
        template_key="test.template",
    )

    assert audit_entry.event_type == "NOTIFICATION_CONTENT_STORED"
    metadata = audit_entry.metadata
    assert metadata["content"]["subject"] == "Test Subject"
    assert "full_content_hash" in metadata["content"]
    assert len(metadata["content"]["body"]) <= 1000  # Truncated


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_batch_processing_audit(db_session: AsyncSession):
    """Test batch processing audit logging."""
    audit_logger = NotificationAuditLogger(db_session)

    correlation_id = uuid4()

    # Log batch processing
    audit_entry = await audit_logger.log_batch_processing(
        batch_size=100,
        processed=100,
        succeeded=98,
        failed=2,
        duration_seconds=15.5,
        correlation_id=correlation_id,
    )

    assert audit_entry.event_type == "NOTIFICATION_BATCH_PROCESSED"
    metadata = audit_entry.metadata
    assert metadata["batch_size"] == 100
    assert metadata["succeeded"] == 98
    assert metadata["success_rate"] == 98.0
    assert metadata["duration_seconds"] == 15.5


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_template_rendering_audit(db_session: AsyncSession):
    """Test template rendering audit logging."""
    audit_logger = NotificationAuditLogger(db_session)

    # Log successful render
    await audit_logger.log_template_render(
        template_key="deadline.t-3",
        variables={"em_name": "Test EM", "deadline": "2025-01-15"},
        success=True,
    )

    # Log failed render
    await audit_logger.log_template_render(
        template_key="invalid.template",
        variables={},
        success=False,
        error="Template not found",
    )

    # Get audit summary
    summary = await audit_logger.get_audit_summary(hours=1)

    assert summary["total_events"] >= 2
    assert "NOTIFICATION_TEMPLATE_RENDERED" in summary["event_counts"]


@pytest.mark.asyncio
@pytest.mark.asyncio
async def test_98_percent_sla_verification(db_session: AsyncSession):
    """Test that 98% SLA is properly tracked and verified."""
    tracker = DeliveryTracker(db_session)

    now = datetime.now(UTC)

    # Create exactly 98% success rate (98 out of 100)
    for i in range(98):
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email=f"success{i}@example.com",
            delivery_status="delivered",
            sent_at=now - timedelta(hours=1),
            delivered_at=now - timedelta(minutes=30),
        )
        db_session.add(log)

    for i in range(2):
        log = NotificationLog(
            notification_type="test",
            channel="email",
            recipient_email=f"failed{i}@example.com",
            delivery_status="failed",
            sent_at=now - timedelta(hours=1),
        )
        db_session.add(log)

    await db_session.commit()

    # Check metrics
    metrics = await tracker.get_delivery_metrics(hours=2)

    assert metrics["total_notifications"] == 100
    assert metrics["success_rate"] == 98.0
    assert metrics["sla_met"] is True  # Exactly meets threshold

    # Add one more failure to drop below SLA
    log = NotificationLog(
        notification_type="test",
        channel="email",
        recipient_email="failed_extra@example.com",
        delivery_status="failed",
        sent_at=now - timedelta(hours=1),
    )
    db_session.add(log)
    await db_session.commit()

    # Check metrics again
    metrics = await tracker.get_delivery_metrics(hours=2)

    assert metrics["total_notifications"] == 101
    assert metrics["success_rate"] < 98.0
    assert metrics["sla_met"] is False  # Below threshold
