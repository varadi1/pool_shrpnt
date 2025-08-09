"""Core notification service for managing notifications."""
import hashlib
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.retry import exponential_backoff_with_jitter
from api.models.contract import OrderEm, PartnerCompany
from api.models.notification import (
    NotificationHistory,
    NotificationLog,
    NotificationQueue,
    NotificationTemplate,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for managing notifications."""

    def __init__(self, session: AsyncSession):
        """Initialize notification service."""
        self.session = session

    async def queue_notification(
        self,
        template_key: str,
        recipients: list[dict[str, Any]],
        variables: dict[str, Any],
        priority: int = 5,
        scheduled_for: datetime | None = None,
        event_type: str | None = None,
        event_id: UUID | None = None,
        bypass_dedup: bool = False,
    ) -> list[UUID]:
        """Queue notifications for sending.

        Args:
            template_key: Template identifier
            recipients: List of recipient info dicts
            variables: Template variables
            priority: Queue priority (1=highest, 10=lowest)
            scheduled_for: When to send (None = immediate)
            event_type: Event that triggered notification
            event_id: ID of triggering event
            bypass_dedup: Bypass de-duplication for critical notifications

        Returns:
            List of queued notification IDs
        """
        # Get template
        template = await self._get_template(template_key)
        if not template:
            logger.error(f"Template not found: {template_key}")
            return []

        queued_ids = []
        notifications_to_queue = []

        for recipient in recipients:
            # Check for de-duplication (unless bypassed)
            if (
                not bypass_dedup
                and event_type
                and not await self._should_send_notification(
                    event_type, event_id, recipient.get("id"), template.channel
                )
            ):
                logger.info(
                    f"Skipping duplicate notification for {recipient.get('email')} "
                    f"(event: {event_type})"
                )
                continue

            # Create queue entry
            notification = NotificationQueue(
                template_id=template.id,
                recipient_email=recipient.get("email"),
                recipient_teams_id=recipient.get("teams_id"),
                recipient_role=recipient.get("role"),
                channel=template.channel,
                variables=variables,
                priority=priority,
                scheduled_for=scheduled_for,
                status="pending",
            )

            self.session.add(notification)
            notifications_to_queue.append(notification)

            # Record in history for de-duplication
            if event_type:
                await self._record_notification_history(
                    event_type, event_id, recipient.get("id"), template.channel
                )

        # Flush to generate IDs
        await self.session.flush()

        # Collect IDs after flush
        for notification in notifications_to_queue:
            queued_ids.append(notification.id)

        await self.session.commit()
        logger.info(f"Queued {len(queued_ids)} notifications for template {template_key}")
        return queued_ids

    async def resolve_recipients(
        self,
        roles: list[str],
        em_id: int | None = None,
        partner_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """Resolve roles to actual recipients.

        Args:
            roles: List of role names
            em_id: Order/EM ID for context
            partner_id: Partner ID for context

        Returns:
            List of recipient info dicts
        """
        recipients = []

        for role in roles:
            if role == "NEU_PM" and em_id:
                # Get PM from order_em (using created_by as PM for now)
                stmt = select(OrderEm).where(OrderEm.id == em_id)
                result = await self.session.execute(stmt)
                order = result.scalar_one_or_none()
                if order and order.created_by:
                    # For now, use created_by as email
                    recipients.append(
                        {
                            "id": uuid4(),  # Generate ID for tracking
                            "email": order.created_by,
                            "teams_id": None,
                            "role": "NEU_PM",
                        }
                    )

            elif role == "PARTNER_ADMIN" and partner_id:
                # Get partner company admin email
                stmt = select(PartnerCompany).where(PartnerCompany.id == partner_id)
                result = await self.session.execute(stmt)
                partner = result.scalar_one_or_none()
                if partner and partner.contact_email:
                    recipients.append(
                        {
                            "id": uuid4(),
                            "email": partner.contact_email,
                            "teams_id": None,
                            "role": "PARTNER_ADMIN",
                        }
                    )

            elif role == "PARTNER_EXPERT" and partner_id:
                # For now, also use partner contact email for experts
                stmt = select(PartnerCompany).where(PartnerCompany.id == partner_id)
                result = await self.session.execute(stmt)
                partner = result.scalar_one_or_none()
                if partner and partner.contact_email:
                    recipients.append(
                        {
                            "id": uuid4(),
                            "email": partner.contact_email,
                            "teams_id": None,
                            "role": "PARTNER_EXPERT",
                        }
                    )

        return recipients

    def render_template(self, template_content: str, variables: dict[str, Any]) -> str:
        """Render template with variables.

        Args:
            template_content: Template string with {{variables}}
            variables: Variable values

        Returns:
            Rendered content
        """
        content = template_content

        # Replace {{variable}} placeholders
        for key, value in variables.items():
            placeholder = f"{{{{{key}}}}}"
            content = content.replace(placeholder, str(value))

        # Check for any unreplaced variables (log warning)
        unresolved = re.findall(r"\{\{(\w+)\}\}", content)
        if unresolved:
            logger.warning(f"Unresolved template variables: {unresolved}")

        return content

    async def process_queue(self, batch_size: int = 10, max_retries: int = 3) -> dict[str, int]:
        """Process pending notifications from queue.

        Args:
            batch_size: Number of notifications to process
            max_retries: Maximum retry attempts

        Returns:
            Processing statistics
        """
        stats = {"processed": 0, "sent": 0, "failed": 0}

        # Get pending notifications
        now = datetime.now(UTC)
        stmt = (
            select(NotificationQueue)
            .where(
                and_(
                    NotificationQueue.status == "pending",
                    NotificationQueue.retry_count < max_retries,
                    NotificationQueue.scheduled_for <= now,
                )
            )
            .order_by(NotificationQueue.priority, NotificationQueue.created_at)
            .limit(batch_size)
        )

        result = await self.session.execute(stmt)
        notifications = result.scalars().all()

        for notification in notifications:
            stats["processed"] += 1

            # Update status to processing
            notification.status = "processing"
            await self.session.commit()

            try:
                # Process based on channel
                success = await self._send_notification(notification)

                if success:
                    notification.status = "sent"
                    stats["sent"] += 1
                    await self._log_delivery(notification, "sent")
                else:
                    raise Exception("Delivery failed")

            except Exception as e:
                logger.error(f"Failed to send notification {notification.id}: {e}")
                notification.retry_count += 1

                if notification.retry_count >= max_retries:
                    notification.status = "failed"
                    stats["failed"] += 1
                    await self._log_delivery(notification, "failed", str(e))
                else:
                    # Schedule retry with exponential backoff
                    delay_seconds = exponential_backoff_with_jitter(
                        notification.retry_count, base_delay=60
                    )
                    notification.scheduled_for = datetime.now(UTC) + timedelta(
                        seconds=delay_seconds
                    )
                    notification.status = "pending"

            await self.session.commit()

        return stats

    async def get_delivery_stats(self, hours: int = 24) -> dict[str, Any]:
        """Get delivery statistics.

        Args:
            hours: Hours to look back

        Returns:
            Delivery statistics
        """
        since = datetime.now(UTC) - timedelta(hours=hours)

        # Get counts by status
        stmt = select(
            NotificationLog.delivery_status,
            NotificationLog.channel,
        ).where(NotificationLog.sent_at >= since)

        result = await self.session.execute(stmt)
        rows = result.all()

        stats = {
            "total": len(rows),
            "by_status": {},
            "by_channel": {},
            "success_rate": 0.0,
        }

        for status, channel in rows:
            stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
            stats["by_channel"][channel] = stats["by_channel"].get(channel, 0) + 1

        # Calculate success rate
        if stats["total"] > 0:
            delivered = stats["by_status"].get("delivered", 0)
            stats["success_rate"] = (delivered / stats["total"]) * 100

        return stats

    async def cleanup_old_history(self, days: int = 30) -> int:
        """Clean up old notification history records.

        Args:
            days: Number of days to keep history

        Returns:
            Number of records deleted
        """
        cutoff_date = datetime.now(UTC) - timedelta(days=days)

        # Delete old history records
        stmt = select(NotificationHistory).where(NotificationHistory.sent_at < cutoff_date)
        result = await self.session.execute(stmt)
        old_records = result.scalars().all()

        count = len(old_records)
        for record in old_records:
            await self.session.delete(record)

        await self.session.commit()
        logger.info(f"Cleaned up {count} old notification history records")
        return count

    # Private helper methods

    async def _get_template(self, template_key: str) -> NotificationTemplate | None:
        """Get notification template by key."""
        stmt = select(NotificationTemplate).where(
            and_(
                NotificationTemplate.template_key == template_key,
                NotificationTemplate.active.is_(True),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _should_send_notification(
        self,
        event_type: str,
        event_id: UUID | None,
        recipient_id: UUID | None,
        channel: str,
    ) -> bool:
        """Check if notification should be sent (de-duplication)."""
        if not event_id or not recipient_id:
            return True  # Can't de-duplicate without IDs

        # Check for duplicate within 24 hours
        since = datetime.now(UTC) - timedelta(hours=24)
        dedup_key = self._generate_dedup_key(event_type, event_id, recipient_id)

        stmt = select(NotificationHistory).where(
            and_(
                NotificationHistory.dedup_key == dedup_key,
                NotificationHistory.sent_at >= since,
            )
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        return existing is None

    async def _record_notification_history(
        self,
        event_type: str,
        event_id: UUID | None,
        recipient_id: UUID | None,
        channel: str,
    ) -> None:
        """Record notification in history for de-duplication."""
        if not event_id or not recipient_id:
            return

        dedup_key = self._generate_dedup_key(event_type, event_id, recipient_id)

        history = NotificationHistory(
            event_type=event_type,
            event_id=event_id,
            recipient_id=recipient_id,
            channel=channel,
            dedup_key=dedup_key,
        )
        self.session.add(history)

    def _generate_dedup_key(self, event_type: str, event_id: UUID, recipient_id: UUID) -> str:
        """Generate de-duplication key."""
        key = f"{event_type}:{event_id}:{recipient_id}"
        return hashlib.sha256(key.encode()).hexdigest()[:255]

    async def _send_notification(self, notification: NotificationQueue) -> bool:
        """Send notification (placeholder - will be implemented by senders)."""
        # This will be implemented by email/teams senders
        logger.info(f"Would send notification {notification.id} via {notification.channel}")
        return True  # Placeholder

    async def _log_delivery(
        self,
        notification: NotificationQueue,
        status: str,
        error_message: str | None = None,
    ) -> None:
        """Log delivery status."""
        log_entry = NotificationLog(
            notification_type=notification.template.template_key
            if notification.template
            else "unknown",
            recipient_email=notification.recipient_email,
            recipient_teams_id=notification.recipient_teams_id,
            channel=notification.channel,
            delivery_status=status,
            retry_count=notification.retry_count,
            error_message=error_message,
            correlation_id=uuid4(),
        )

        if status == "delivered":
            log_entry.delivered_at = datetime.now(UTC)

        self.session.add(log_entry)
