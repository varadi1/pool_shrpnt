"""Audit logging service for notification system."""
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.audit import AuditLog

logger = logging.getLogger(__name__)


class NotificationAuditLogger:
    """Handles audit logging for notification events."""

    def __init__(self, session: AsyncSession):
        """Initialize audit logger."""
        self.session = session

    async def log_notification_sent(
        self,
        notification_id: UUID,
        template_key: str,
        recipients: list[dict[str, Any]],
        channel: str,
        variables: dict[str, Any] | None = None,
        correlation_id: UUID | None = None,
        actor: str | None = None,
    ) -> AuditLog:
        """Log NOTIFICATION_SENT event with metadata.

        Args:
            notification_id: Notification ID
            template_key: Template used
            recipients: List of recipients
            channel: Delivery channel
            variables: Template variables used
            correlation_id: Correlation ID for tracing
            actor: User/system that triggered notification

        Returns:
            AuditLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        # Prepare metadata
        metadata = {
            "notification_id": str(notification_id),
            "template_key": template_key,
            "channel": channel,
            "recipients": [
                {
                    "email": r.get("email"),
                    "teams_id": r.get("teams_id"),
                    "role": r.get("role"),
                }
                for r in recipients
            ],
            "variables": variables or {},
            "correlation_id": str(correlation_id),
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Create audit log entry
        audit_entry = AuditLog(
            event_type="NOTIFICATION_SENT",
            entity_type="notification",
            entity_id=str(notification_id),
            actor=actor or "system",
            action="send",
            metadata=metadata,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )

        self.session.add(audit_entry)
        await self.session.commit()

        logger.info(
            "Logged NOTIFICATION_SENT event",
            extra={
                "notification_id": str(notification_id),
                "template_key": template_key,
                "channel": channel,
                "correlation_id": str(correlation_id),
            },
        )

        return audit_entry

    async def log_delivery_status_change(
        self,
        notification_id: UUID,
        old_status: str,
        new_status: str,
        reason: str | None = None,
        correlation_id: UUID | None = None,
    ) -> AuditLog:
        """Log notification delivery status change.

        Args:
            notification_id: Notification ID
            old_status: Previous status
            new_status: New status
            reason: Reason for status change
            correlation_id: Correlation ID for tracing

        Returns:
            AuditLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        metadata = {
            "notification_id": str(notification_id),
            "old_status": old_status,
            "new_status": new_status,
            "reason": reason,
            "timestamp": datetime.now(UTC).isoformat(),
            "correlation_id": str(correlation_id),
        }

        audit_entry = AuditLog(
            event_type="NOTIFICATION_STATUS_CHANGED",
            entity_type="notification",
            entity_id=str(notification_id),
            actor="system",
            action="status_change",
            metadata=metadata,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )

        self.session.add(audit_entry)
        await self.session.commit()

        logger.info(
            f"Logged delivery status change: {old_status} -> {new_status}",
            extra={
                "notification_id": str(notification_id),
                "correlation_id": str(correlation_id),
            },
        )

        return audit_entry

    async def log_notification_content(
        self,
        notification_id: UUID,
        rendered_content: dict[str, str],
        template_key: str,
        correlation_id: UUID | None = None,
    ) -> AuditLog:
        """Store notification content for compliance.

        Args:
            notification_id: Notification ID
            rendered_content: Rendered notification content
            template_key: Template used
            correlation_id: Correlation ID for tracing

        Returns:
            AuditLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        # Store content with encryption if needed
        metadata = {
            "notification_id": str(notification_id),
            "template_key": template_key,
            "content": {
                "subject": rendered_content.get("subject"),
                "body": rendered_content.get("body")[:1000],  # Truncate for storage
                "full_content_hash": self._hash_content(rendered_content.get("body", "")),
            },
            "timestamp": datetime.now(UTC).isoformat(),
            "correlation_id": str(correlation_id),
        }

        audit_entry = AuditLog(
            event_type="NOTIFICATION_CONTENT_STORED",
            entity_type="notification",
            entity_id=str(notification_id),
            actor="system",
            action="store_content",
            metadata=metadata,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )

        self.session.add(audit_entry)
        await self.session.commit()

        logger.info(
            "Stored notification content for compliance",
            extra={
                "notification_id": str(notification_id),
                "template_key": template_key,
                "correlation_id": str(correlation_id),
            },
        )

        return audit_entry

    async def log_template_render(
        self,
        template_key: str,
        variables: dict[str, Any],
        success: bool,
        error: str | None = None,
        correlation_id: UUID | None = None,
    ) -> AuditLog:
        """Log template rendering event.

        Args:
            template_key: Template identifier
            variables: Variables used
            success: Whether rendering succeeded
            error: Error message if failed
            correlation_id: Correlation ID for tracing

        Returns:
            AuditLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        metadata = {
            "template_key": template_key,
            "variables": variables,
            "success": success,
            "error": error,
            "timestamp": datetime.now(UTC).isoformat(),
            "correlation_id": str(correlation_id),
        }

        audit_entry = AuditLog(
            event_type="NOTIFICATION_TEMPLATE_RENDERED",
            entity_type="notification_template",
            entity_id=template_key,
            actor="system",
            action="render",
            metadata=metadata,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )

        self.session.add(audit_entry)
        await self.session.commit()

        return audit_entry

    async def log_retry_attempt(
        self,
        notification_id: UUID,
        attempt_number: int,
        max_attempts: int,
        next_retry_at: datetime | None = None,
        error: str | None = None,
        correlation_id: UUID | None = None,
    ) -> AuditLog:
        """Log notification retry attempt.

        Args:
            notification_id: Notification ID
            attempt_number: Current attempt number
            max_attempts: Maximum attempts allowed
            next_retry_at: When next retry is scheduled
            error: Error that caused retry
            correlation_id: Correlation ID for tracing

        Returns:
            AuditLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        metadata = {
            "notification_id": str(notification_id),
            "attempt_number": attempt_number,
            "max_attempts": max_attempts,
            "next_retry_at": next_retry_at.isoformat() if next_retry_at else None,
            "error": error,
            "timestamp": datetime.now(UTC).isoformat(),
            "correlation_id": str(correlation_id),
        }

        audit_entry = AuditLog(
            event_type="NOTIFICATION_RETRY",
            entity_type="notification",
            entity_id=str(notification_id),
            actor="system",
            action="retry",
            metadata=metadata,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )

        self.session.add(audit_entry)
        await self.session.commit()

        logger.info(
            f"Logged retry attempt {attempt_number}/{max_attempts}",
            extra={
                "notification_id": str(notification_id),
                "correlation_id": str(correlation_id),
            },
        )

        return audit_entry

    async def log_batch_processing(
        self,
        batch_size: int,
        processed: int,
        succeeded: int,
        failed: int,
        duration_seconds: float,
        correlation_id: UUID | None = None,
    ) -> AuditLog:
        """Log batch notification processing.

        Args:
            batch_size: Size of batch
            processed: Number processed
            succeeded: Number succeeded
            failed: Number failed
            duration_seconds: Processing duration
            correlation_id: Correlation ID for tracing

        Returns:
            AuditLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        metadata = {
            "batch_size": batch_size,
            "processed": processed,
            "succeeded": succeeded,
            "failed": failed,
            "duration_seconds": round(duration_seconds, 2),
            "success_rate": round((succeeded / processed * 100) if processed > 0 else 0, 2),
            "timestamp": datetime.now(UTC).isoformat(),
            "correlation_id": str(correlation_id),
        }

        audit_entry = AuditLog(
            event_type="NOTIFICATION_BATCH_PROCESSED",
            entity_type="notification_batch",
            entity_id=str(correlation_id),
            actor="system",
            action="process_batch",
            metadata=metadata,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )

        self.session.add(audit_entry)
        await self.session.commit()

        logger.info(
            f"Logged batch processing: {succeeded}/{processed} succeeded",
            extra={
                "batch_size": batch_size,
                "success_rate": metadata["success_rate"],
                "correlation_id": str(correlation_id),
            },
        )

        return audit_entry

    async def get_notification_audit_trail(self, notification_id: UUID) -> list[AuditLog]:
        """Get complete audit trail for a notification.

        Args:
            notification_id: Notification ID

        Returns:
            List of audit entries
        """
        stmt = (
            select(AuditLog)
            .where(
                AuditLog.entity_type == "notification",
                AuditLog.entity_id == str(notification_id),
            )
            .order_by(AuditLog.created_at)
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_audit_summary(self, hours: int = 24) -> dict[str, Any]:
        """Get audit summary for notifications.

        Args:
            hours: Hours to look back

        Returns:
            Audit summary
        """
        since = datetime.now(UTC) - timedelta(hours=hours)

        # Get audit entries
        stmt = select(AuditLog).where(
            AuditLog.created_at >= since,
            AuditLog.entity_type.in_(
                ["notification", "notification_template", "notification_batch"]
            ),
        )

        result = await self.session.execute(stmt)
        audit_entries = result.scalars().all()

        # Summarize by event type
        event_counts = {}
        for entry in audit_entries:
            event_type = entry.event_type
            if event_type not in event_counts:
                event_counts[event_type] = 0
            event_counts[event_type] += 1

        return {
            "period_hours": hours,
            "total_events": len(audit_entries),
            "event_counts": event_counts,
            "notifications_sent": event_counts.get("NOTIFICATION_SENT", 0),
            "status_changes": event_counts.get("NOTIFICATION_STATUS_CHANGED", 0),
            "retries": event_counts.get("NOTIFICATION_RETRY", 0),
            "batches_processed": event_counts.get("NOTIFICATION_BATCH_PROCESSED", 0),
        }

    def _hash_content(self, content: str) -> str:
        """Hash content for storage.

        Args:
            content: Content to hash

        Returns:
            SHA256 hash
        """
        import hashlib

        return hashlib.sha256(content.encode()).hexdigest()
