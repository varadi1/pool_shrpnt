"""API endpoints for notification management and monitoring."""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_db
from api.schemas.notification import (
    DeliveryMetricsResponse,
    NotificationTestRequest,
    NotificationWebhookRequest,
    TemplateUpdateRequest,
)
from api.services.notifications.audit_logger import NotificationAuditLogger
from api.services.notifications.delivery_tracker import (
    DeliveryTracker,
    DeliveryWebhookHandler,
)
from api.services.notifications.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.post("/send")
async def send_notification(
    template_key: str,
    recipients: list[dict[str, Any]],
    variables: dict[str, Any] | None = None,
    priority: int = 5,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Send an immediate notification.

    Args:
        template_key: Template to use
        recipients: List of recipients
        variables: Template variables
        priority: Queue priority
        db: Database session

    Returns:
        Response with queued notification IDs
    """
    service = NotificationService(db)

    queued_ids = await service.queue_notification(
        template_key=template_key,
        recipients=recipients,
        variables=variables or {},
        priority=priority,
    )

    # Audit log
    if queued_ids:
        audit_logger = NotificationAuditLogger(db)
        await audit_logger.log_notification_sent(
            notification_id=queued_ids[0],
            template_key=template_key,
            recipients=recipients,
            channel="both",  # Determined by template
            variables=variables,
        )

    return {
        "success": True,
        "queued_count": len(queued_ids),
        "notification_ids": [str(id) for id in queued_ids],
    }


@router.get("/templates")
async def list_templates(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List available notification templates.

    Args:
        active_only: Only show active templates
        db: Database session

    Returns:
        List of templates
    """
    from sqlalchemy import select

    from api.models.notification import NotificationTemplate

    query = select(NotificationTemplate)
    if active_only:
        query = query.where(NotificationTemplate.active == True)

    result = await db.execute(query)
    templates = result.scalars().all()

    return [
        {
            "id": str(template.id),
            "template_key": template.template_key,
            "channel": template.channel,
            "subject_template": template.subject_template,
            "active": template.active,
            "locale": template.locale,
        }
        for template in templates
    ]


@router.put("/templates/{template_key}")
async def update_template(
    template_key: str,
    update_request: TemplateUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update a notification template.

    Args:
        template_key: Template identifier
        update_request: Update data
        db: Database session

    Returns:
        Update result
    """
    from sqlalchemy import select

    from api.models.notification import NotificationTemplate

    # Find template
    stmt = select(NotificationTemplate).where(NotificationTemplate.template_key == template_key)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Update fields
    if update_request.subject_template is not None:
        template.subject_template = update_request.subject_template
    if update_request.body_template is not None:
        template.body_template = update_request.body_template
    if update_request.teams_card_template is not None:
        template.teams_card_template = update_request.teams_card_template
    if update_request.active is not None:
        template.active = update_request.active

    template.updated_at = datetime.utcnow()

    await db.commit()

    return {
        "success": True,
        "template_key": template_key,
        "updated_fields": update_request.dict(exclude_unset=True),
    }


@router.get("/delivery-stats")
async def get_delivery_stats(
    hours: int = Query(24, ge=1, le=168),
    channel: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> DeliveryMetricsResponse:
    """Get delivery statistics.

    Args:
        hours: Hours to look back (max 168/7 days)
        channel: Optional channel filter
        db: Database session

    Returns:
        Delivery metrics
    """
    tracker = DeliveryTracker(db)

    # Get overall metrics
    metrics = await tracker.get_delivery_metrics(hours, channel)

    # Get channel breakdown if not filtered
    channel_metrics = None
    if not channel:
        channel_metrics = await tracker.get_channel_metrics(hours)

    # Get performance metrics
    performance = await tracker.get_performance_metrics(hours)

    # Get failure analysis
    failures = await tracker.get_failure_analysis(hours)

    return DeliveryMetricsResponse(
        period_hours=hours,
        overall_metrics=metrics,
        channel_metrics=channel_metrics,
        performance_metrics=performance,
        failure_analysis=failures,
    )


@router.post("/test")
async def send_test_notification(
    request: NotificationTestRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Send a test notification.

    Args:
        request: Test notification request
        db: Database session

    Returns:
        Test result
    """
    service = NotificationService(db)

    # Create test recipient
    test_recipient = {
        "id": UUID("00000000-0000-0000-0000-000000000000"),
        "email": request.recipient_email,
        "teams_id": request.recipient_teams_id,
        "role": "TEST",
    }

    # Queue test notification
    queued_ids = await service.queue_notification(
        template_key=request.template_key,
        recipients=[test_recipient],
        variables=request.variables or {},
        priority=1,  # High priority for tests
        bypass_dedup=True,  # Always send test notifications
    )

    return {
        "success": len(queued_ids) > 0,
        "test_mode": True,
        "notification_id": str(queued_ids[0]) if queued_ids else None,
        "recipient": request.recipient_email or request.recipient_teams_id,
    }


@router.post("/webhook/delivery")
async def handle_delivery_webhook(
    webhook_data: NotificationWebhookRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Handle delivery status webhook.

    Args:
        webhook_data: Webhook payload
        db: Database session

    Returns:
        Processing result
    """
    handler = DeliveryWebhookHandler(db)

    # Route to appropriate handler based on source
    if webhook_data.source == "graph":
        result = await handler.handle_graph_webhook(webhook_data.data)
    elif webhook_data.source == "teams":
        result = await handler.handle_teams_webhook(webhook_data.data)
    else:
        raise HTTPException(
            status_code=400, detail=f"Unknown webhook source: {webhook_data.source}"
        )

    return result


@router.get("/audit/{notification_id}")
async def get_notification_audit_trail(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Get audit trail for a notification.

    Args:
        notification_id: Notification ID
        db: Database session

    Returns:
        Audit trail entries
    """
    audit_logger = NotificationAuditLogger(db)

    audit_trail = await audit_logger.get_notification_audit_trail(notification_id)

    return [
        {
            "event_type": entry.event_type,
            "action": entry.action,
            "actor": entry.actor,
            "metadata": entry.metadata,
            "created_at": entry.created_at.isoformat(),
        }
        for entry in audit_trail
    ]


@router.get("/audit/summary")
async def get_audit_summary(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get audit summary for notifications.

    Args:
        hours: Hours to look back
        db: Database session

    Returns:
        Audit summary
    """
    audit_logger = NotificationAuditLogger(db)

    summary = await audit_logger.get_audit_summary(hours)

    return summary


@router.get("/metrics/sla")
async def get_sla_metrics(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get SLA compliance metrics.

    Args:
        hours: Hours to look back
        db: Database session

    Returns:
        SLA metrics
    """
    tracker = DeliveryTracker(db)

    # Get metrics for different time windows
    windows = [1, 4, 24] if hours >= 24 else [hours]
    sla_metrics = {}

    for window in windows:
        if window <= hours:
            metrics = await tracker.get_delivery_metrics(window)
            sla_metrics[f"{window}h"] = {
                "success_rate": metrics["success_rate"],
                "sla_met": metrics["sla_met"],
                "total_notifications": metrics["total_notifications"],
            }

    # Calculate overall SLA
    overall_metrics = await tracker.get_delivery_metrics(hours)

    return {
        "sla_threshold": 98.0,
        "current_period_hours": hours,
        "overall_sla_met": overall_metrics["sla_met"],
        "overall_success_rate": overall_metrics["success_rate"],
        "time_windows": sla_metrics,
        "alert_triggered": not overall_metrics["sla_met"]
        and overall_metrics["total_notifications"] >= 10,
    }
