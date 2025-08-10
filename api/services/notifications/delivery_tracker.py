"""Delivery tracking and monitoring service for notifications."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.notification import NotificationLog

logger = logging.getLogger(__name__)


class DeliveryTracker:
    """Tracks and monitors notification delivery status."""

    def __init__(self, session):
        """Initialize delivery tracker."""
        self.session = session
        self.sla_threshold = 98.0  # 98% delivery rate SLA

    async def track_delivery_attempt(
        self,
        notification_id: UUID,
        channel: str,
        recipient: str,
        status: str,
        error_message: str | None = None,
        correlation_id: UUID | None = None,
    ) -> NotificationLog:
        """Track a delivery attempt.

        Args:
            notification_id: Notification queue ID
            channel: Delivery channel (email/teams)
            recipient: Recipient identifier
            status: Delivery status
            error_message: Error message if failed
            correlation_id: Correlation ID for tracing

        Returns:
            NotificationLog entry
        """
        log_entry = NotificationLog(
            notification_type="delivery_attempt",
            recipient_email=recipient if channel == "email" else None,
            recipient_teams_id=recipient if channel == "teams" else None,
            channel=channel,
            delivery_status=status,
            error_message=error_message,
            related_entity_id=notification_id,
            correlation_id=correlation_id,
        )

        if status in ["sent", "delivered"]:
            log_entry.delivered_at = datetime.now(UTC)

        self.session.add(log_entry)
        if isinstance(self.session, AsyncSession):
            await self.session.commit()
        else:
            self.session.commit()

        logger.info(
            f"Tracked delivery attempt for {notification_id}",
            extra={
                "notification_id": str(notification_id),
                "channel": channel,
                "status": status,
                "correlation_id": str(correlation_id) if correlation_id else None,
            },
        )

        return log_entry

    async def update_delivery_status(
        self,
        notification_id: UUID,
        new_status: str,
        webhook_data: dict[str, Any] | None = None,
    ) -> bool:
        """Update delivery status from webhook or callback.

        Args:
            notification_id: Notification ID
            new_status: New delivery status
            webhook_data: Optional webhook payload

        Returns:
            True if updated successfully
        """
        # Find the notification log entry
        stmt = select(NotificationLog).where(NotificationLog.related_entity_id == notification_id)
        result = await self.session.execute(stmt) if isinstance(self.session, AsyncSession) else self.session.execute(stmt)
        log_entry = result.scalar_one_or_none()

        if not log_entry:
            logger.warning(f"No log entry found for notification {notification_id}")
            return False

        # Update status
        log_entry.delivery_status = new_status
        if new_status == "delivered":
            log_entry.delivered_at = datetime.now(UTC)

        # Store webhook data if provided
        if webhook_data:
            # Store in error_message field as JSON for now
            import json

            log_entry.error_message = json.dumps(webhook_data)

        if isinstance(self.session, AsyncSession):
            await self.session.commit()
        else:
            self.session.commit()

        logger.info(
            f"Updated delivery status for {notification_id} to {new_status}",
            extra={
                "notification_id": str(notification_id),
                "new_status": new_status,
            },
        )

        return True

    async def get_delivery_metrics(
        self,
        hours: int = 24,
        channel: str | None = None,
    ) -> dict[str, Any]:
        """Get delivery metrics for monitoring.

        Args:
            hours: Hours to look back
            channel: Optional channel filter

        Returns:
            Delivery metrics
        """
        since = datetime.now(UTC) - timedelta(hours=hours)

        # Build query
        query = select(
            NotificationLog.delivery_status,
            func.count(NotificationLog.id).label("count"),
        ).where(NotificationLog.sent_at >= since)

        if channel:
            query = query.where(NotificationLog.channel == channel)

        query = query.group_by(NotificationLog.delivery_status)

        # Execute query
        result = await self.session.execute(query) if isinstance(self.session, AsyncSession) else self.session.execute(query)
        status_counts = {row[0]: row[1] for row in result.all()}

        # Calculate metrics
        total = sum(status_counts.values())
        delivered = status_counts.get("delivered", 0) + status_counts.get("sent", 0)
        failed = status_counts.get("failed", 0)
        pending = status_counts.get("pending", 0)

        success_rate = (delivered / total * 100) if total > 0 else 0.0

        metrics = {
            "period_hours": hours,
            "channel": channel or "all",
            "total_notifications": total,
            "delivered": delivered,
            "failed": failed,
            "pending": pending,
            "success_rate": round(success_rate, 2),
            "sla_met": success_rate >= self.sla_threshold,
            "status_breakdown": status_counts,
        }

        # Check if we need to alert
        if success_rate < self.sla_threshold and total >= 10:  # Min 10 notifications
            await self._trigger_sla_alert(success_rate, metrics)

        return metrics

    async def get_channel_metrics(self, hours: int = 24) -> dict[str, dict[str, Any]]:
        """Get metrics broken down by channel.

        Args:
            hours: Hours to look back

        Returns:
            Metrics by channel
        """
        metrics = {}

        for channel in ["email", "teams"]:
            metrics[channel] = await self.get_delivery_metrics(hours, channel)

        # Calculate combined metrics
        total_delivered = sum(m["delivered"] for m in metrics.values())
        total_count = sum(m["total_notifications"] for m in metrics.values())

        metrics["combined"] = {
            "total_notifications": total_count,
            "delivered": total_delivered,
            "success_rate": round(
                (total_delivered / total_count * 100) if total_count > 0 else 0.0, 2
            ),
            "sla_met": all(m["sla_met"] for m in metrics.values()),
        }

        return metrics

    async def get_failure_analysis(self, hours: int = 24) -> dict[str, Any]:
        """Analyze failure patterns.

        Args:
            hours: Hours to look back

        Returns:
            Failure analysis
        """
        since = datetime.now(UTC) - timedelta(hours=hours)

        # Get failed notifications
        stmt = select(NotificationLog).where(
            and_(
                NotificationLog.sent_at >= since,
                NotificationLog.delivery_status == "failed",
            )
        )
        result = await self.session.execute(stmt) if isinstance(self.session, AsyncSession) else self.session.execute(stmt)
        failed_notifications = result.scalars().all()

        # Analyze failures
        failure_patterns = {}
        for notification in failed_notifications:
            # Extract error type from message
            error_type = self._categorize_error(notification.error_message)
            if error_type not in failure_patterns:
                failure_patterns[error_type] = {
                    "count": 0,
                    "channels": {},
                    "retry_counts": [],
                }

            failure_patterns[error_type]["count"] += 1

            channel = notification.channel
            if channel not in failure_patterns[error_type]["channels"]:
                failure_patterns[error_type]["channels"][channel] = 0
            failure_patterns[error_type]["channels"][channel] += 1

            failure_patterns[error_type]["retry_counts"].append(notification.retry_count)

        # Calculate average retry counts
        for pattern in failure_patterns.values():
            retry_counts = pattern["retry_counts"]
            pattern["avg_retries"] = sum(retry_counts) / len(retry_counts) if retry_counts else 0
            del pattern["retry_counts"]  # Remove raw data

        return {
            "period_hours": hours,
            "total_failures": len(failed_notifications),
            "failure_patterns": failure_patterns,
            "most_common_error": (
                max(failure_patterns.items(), key=lambda x: x[1]["count"])[0]
                if failure_patterns
                else None
            ),
        }

    async def get_performance_metrics(self, hours: int = 24) -> dict[str, Any]:
        """Get performance metrics for notifications.

        Args:
            hours: Hours to look back

        Returns:
            Performance metrics
        """
        since = datetime.now(UTC) - timedelta(hours=hours)

        # Get delivery times for successful notifications
        stmt = select(NotificationLog).where(
            and_(
                NotificationLog.sent_at >= since,
                NotificationLog.delivered_at.isnot(None),
            )
        )
        result = await self.session.execute(stmt) if isinstance(self.session, AsyncSession) else self.session.execute(stmt)
        delivered_notifications = result.scalars().all()

        if not delivered_notifications:
            return {
                "period_hours": hours,
                "avg_delivery_time_seconds": 0,
                "min_delivery_time_seconds": 0,
                "max_delivery_time_seconds": 0,
                "p95_delivery_time_seconds": 0,
                "sample_size": 0,
            }

        # Calculate delivery times
        delivery_times = []
        for notification in delivered_notifications:
            if notification.sent_at and notification.delivered_at:
                delta = notification.delivered_at - notification.sent_at
                delivery_times.append(delta.total_seconds())

        delivery_times.sort()

        # Calculate percentiles
        p95_index = int(len(delivery_times) * 0.95)

        return {
            "period_hours": hours,
            "avg_delivery_time_seconds": round(sum(delivery_times) / len(delivery_times), 2),
            "min_delivery_time_seconds": round(min(delivery_times), 2),
            "max_delivery_time_seconds": round(max(delivery_times), 2),
            "p95_delivery_time_seconds": round(delivery_times[p95_index], 2),
            "sample_size": len(delivery_times),
        }

    async def _trigger_sla_alert(self, current_rate: float, metrics: dict[str, Any]) -> None:
        """Trigger an alert when SLA is breached.

        Args:
            current_rate: Current success rate
            metrics: Current metrics
        """
        logger.error(
            f"SLA BREACH: Delivery rate {current_rate:.2f}% is below {self.sla_threshold}%",
            extra={
                "alert_type": "sla_breach",
                "current_rate": current_rate,
                "sla_threshold": self.sla_threshold,
                "metrics": metrics,
            },
        )

        # TODO: Send alert notification to ops team
        # This would integrate with monitoring/alerting system

    def _categorize_error(self, error_message: str | None) -> str:
        """Categorize error message into types.

        Args:
            error_message: Error message to categorize

        Returns:
            Error category
        """
        if not error_message:
            return "unknown"

        error_lower = error_message.lower()

        if "timeout" in error_lower:
            return "timeout"
        elif "rate" in error_lower or "429" in error_lower:
            return "rate_limit"
        elif "auth" in error_lower or "401" in error_lower or "403" in error_lower:
            return "authentication"
        elif "not found" in error_lower or "404" in error_lower:
            return "not_found"
        elif "network" in error_lower or "connection" in error_lower:
            return "network"
        elif "invalid" in error_lower or "bad request" in error_lower:
            return "invalid_request"
        else:
            return "other"


class DeliveryWebhookHandler:
    """Handles delivery status webhooks from external services."""

    def __init__(self, session):
        """Initialize webhook handler."""
        self.session = session
        self.tracker = DeliveryTracker(session)

    async def handle_graph_webhook(self, webhook_data: dict[str, Any]) -> dict[str, Any]:
        """Handle Graph API delivery webhook.

        Args:
            webhook_data: Webhook payload from Graph API

        Returns:
            Processing result
        """
        # Extract notification ID and status from webhook
        message_id = webhook_data.get("messageId")
        status = webhook_data.get("status", "").lower()

        if not message_id:
            return {"success": False, "error": "Missing messageId"}

        # Map Graph status to our status
        status_map = {
            "delivered": "delivered",
            "failed": "failed",
            "bounced": "failed",
            "deferred": "pending",
            "expanded": "delivered",
        }

        mapped_status = status_map.get(status, "unknown")

        # Update delivery status
        success = await self.tracker.update_delivery_status(
            notification_id=UUID(message_id),
            new_status=mapped_status,
            webhook_data=webhook_data,
        )

        return {
            "success": success,
            "message_id": message_id,
            "status": mapped_status,
        }

    async def handle_teams_webhook(self, webhook_data: dict[str, Any]) -> dict[str, Any]:
        """Handle Teams delivery webhook.

        Args:
            webhook_data: Webhook payload from Teams

        Returns:
            Processing result
        """
        # Teams webhooks would be similar to Graph webhooks
        # This is a placeholder for Teams-specific handling
        return await self.handle_graph_webhook(webhook_data)
