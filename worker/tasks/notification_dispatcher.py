"""Event-driven notification dispatcher for lock lifecycle events."""
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_db
from api.models.contract import OrderEm
from api.services.notifications.notification_service import NotificationService

logger = logging.getLogger(__name__)


class NotificationDispatcher:
    """Dispatches notifications based on events."""

    def __init__(self):
        """Initialize the notification dispatcher."""
        self.event_handlers = {
            "lock.state.changed": self._handle_lock_state_changed,
            "lock.cr.opened": self._handle_cr_opened,
            "lock.cr.closed": self._handle_cr_closed,
            "provision.succeeded": self._handle_provision_succeeded,
            "provision.failed": self._handle_provision_failed,
            "deadline.reminder": self._handle_deadline_reminder,
        }

    async def dispatch_event(
        self,
        event_type: str,
        event_data: dict[str, Any],
        correlation_id: UUID | None = None,
    ) -> None:
        """Dispatch notification based on event type.
        
        Args:
            event_type: Type of event
            event_data: Event payload
            correlation_id: Correlation ID for tracing
        """
        if not correlation_id:
            correlation_id = uuid4()

        logger.info(
            f"Dispatching notification for event: {event_type}",
            extra={
                "correlation_id": str(correlation_id),
                "event_type": event_type,
            }
        )

        handler = self.event_handlers.get(event_type)
        if not handler:
            logger.warning(f"No handler for event type: {event_type}")
            return

        async for session in get_db():
            try:
                await handler(session, event_data, correlation_id)
            except Exception as e:
                logger.error(
                    f"Error handling event {event_type}: {str(e)}",
                    extra={
                        "correlation_id": str(correlation_id),
                        "event_type": event_type,
                        "error": str(e),
                    }
                )
                raise

    async def _handle_lock_state_changed(
        self,
        session: AsyncSession,
        event_data: dict[str, Any],
        correlation_id: UUID,
    ) -> None:
        """Handle lock state change event."""
        em_id = event_data.get("em_id")
        lock_state = event_data.get("lock_state")
        previous_state = event_data.get("previous_state")
        actor = event_data.get("actor")
        reason = event_data.get("reason")
        affected_folders = event_data.get("affected_folders", [])

        # Get order/EM details
        order = await session.get(OrderEm, em_id)
        if not order:
            logger.error(f"Order not found: {em_id}")
            return

        # Determine template key based on state transition
        template_key = self._get_lock_template_key(previous_state, lock_state)
        if not template_key:
            logger.warning(f"No template for transition: {previous_state} -> {lock_state}")
            return

        # Prepare template variables
        variables = {
            "em_name": order.name,
            "lock_state": lock_state,
            "previous_state": previous_state,
            "actor": actor or "System",
            "reason": reason or "N/A",
            "affected_folders": ", ".join(affected_folders) if affected_folders else "All",
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Resolve recipients
        notification_service = NotificationService(session)
        recipients = await notification_service.resolve_recipients(
            roles=["NEU_PM", "PARTNER_ADMIN", "PARTNER_EXPERT"],
            em_id=em_id,
            partner_id=order.partner_company_id if order else None,
        )

        # Queue notifications
        await notification_service.queue_notification(
            template_key=template_key,
            recipients=recipients,
            variables=variables,
            priority=2,  # High priority for state changes
            event_type="lock.state.changed",
            event_id=event_data.get("event_id"),
        )

    async def _handle_cr_opened(
        self,
        session: AsyncSession,
        event_data: dict[str, Any],
        correlation_id: UUID,
    ) -> None:
        """Handle CR opened event."""
        em_id = event_data.get("em_id")
        cr_id = event_data.get("cr_id")
        requestor = event_data.get("requestor")
        reason = event_data.get("reason")

        # Get order details
        order = await session.get(OrderEm, em_id)
        if not order:
            logger.error(f"Order not found: {em_id}")
            return

        # Prepare template variables
        variables = {
            "em_name": order.name,
            "cr_id": cr_id,
            "requestor": requestor,
            "reason": reason or "Change request opened",
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Resolve recipients
        notification_service = NotificationService(session)
        recipients = await notification_service.resolve_recipients(
            roles=["NEU_PM", "PARTNER_ADMIN"],
            em_id=em_id,
            partner_id=order.partner_company_id if order else None,
        )

        # Queue notifications
        await notification_service.queue_notification(
            template_key="lock.cr.opened",
            recipients=recipients,
            variables=variables,
            priority=2,
            event_type="lock.cr.opened",
            event_id=event_data.get("event_id"),
        )

    async def _handle_cr_closed(
        self,
        session: AsyncSession,
        event_data: dict[str, Any],
        correlation_id: UUID,
    ) -> None:
        """Handle CR closed event."""
        em_id = event_data.get("em_id")
        cr_id = event_data.get("cr_id")
        status = event_data.get("status")  # approved/rejected
        approver = event_data.get("approver")

        # Get order details
        order = await session.get(OrderEm, em_id)
        if not order:
            logger.error(f"Order not found: {em_id}")
            return

        # Prepare template variables
        variables = {
            "em_name": order.name,
            "cr_id": cr_id,
            "status": status,
            "approver": approver,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Resolve recipients
        notification_service = NotificationService(session)
        recipients = await notification_service.resolve_recipients(
            roles=["NEU_PM", "PARTNER_ADMIN", "PARTNER_EXPERT"],
            em_id=em_id,
            partner_id=order.partner_company_id if order else None,
        )

        # Queue notifications
        await notification_service.queue_notification(
            template_key=f"lock.cr.{status}",
            recipients=recipients,
            variables=variables,
            priority=2,
            event_type="lock.cr.closed",
            event_id=event_data.get("event_id"),
        )

    async def _handle_provision_succeeded(
        self,
        session: AsyncSession,
        event_data: dict[str, Any],
        correlation_id: UUID,
    ) -> None:
        """Handle provision success event."""
        em_id = event_data.get("em_id")
        provision_type = event_data.get("provision_type")

        # Get order details
        order = await session.get(OrderEm, em_id)
        if not order:
            logger.error(f"Order not found: {em_id}")
            return

        # Prepare template variables
        variables = {
            "em_name": order.name,
            "provision_type": provision_type,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Resolve recipients
        notification_service = NotificationService(session)
        recipients = await notification_service.resolve_recipients(
            roles=["NEU_PM", "PARTNER_ADMIN"],
            em_id=em_id,
            partner_id=order.partner_company_id if order else None,
        )

        # Queue notifications
        await notification_service.queue_notification(
            template_key="provision.succeeded",
            recipients=recipients,
            variables=variables,
            priority=3,
            event_type="provision.succeeded",
            event_id=event_data.get("event_id"),
        )

    async def _handle_provision_failed(
        self,
        session: AsyncSession,
        event_data: dict[str, Any],
        correlation_id: UUID,
    ) -> None:
        """Handle provision failure event."""
        em_id = event_data.get("em_id")
        provision_type = event_data.get("provision_type")
        error_message = event_data.get("error_message")

        # Get order details
        order = await session.get(OrderEm, em_id)
        if not order:
            logger.error(f"Order not found: {em_id}")
            return

        # Prepare template variables
        variables = {
            "em_name": order.name,
            "provision_type": provision_type,
            "error_message": error_message or "Unknown error",
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Resolve recipients (critical - bypass dedup)
        notification_service = NotificationService(session)
        recipients = await notification_service.resolve_recipients(
            roles=["NEU_PM", "PARTNER_ADMIN"],
            em_id=em_id,
            partner_id=order.partner_company_id if order else None,
        )

        # Queue notifications with bypass for critical failure
        await notification_service.queue_notification(
            template_key="provision.failed",
            recipients=recipients,
            variables=variables,
            priority=1,  # Highest priority for failures
            event_type="provision.failed",
            event_id=event_data.get("event_id"),
            bypass_dedup=True,  # Critical notification
        )

    async def _handle_deadline_reminder(
        self,
        session: AsyncSession,
        event_data: dict[str, Any],
        correlation_id: UUID,
    ) -> None:
        """Handle deadline reminder event."""
        em_id = event_data.get("em_id")
        deadline_type = event_data.get("deadline_type")  # T-3, T-1, T+0
        deadline_date = event_data.get("deadline_date")

        # Get order details
        order = await session.get(OrderEm, em_id)
        if not order:
            logger.error(f"Order not found: {em_id}")
            return

        # Prepare template variables
        variables = {
            "em_name": order.name,
            "deadline": deadline_date,
            "deadline_type": deadline_type,
            "days_remaining": self._calculate_days_remaining(deadline_date),
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Resolve recipients
        notification_service = NotificationService(session)
        recipients = await notification_service.resolve_recipients(
            roles=["NEU_PM", "PARTNER_ADMIN", "PARTNER_EXPERT"],
            em_id=em_id,
            partner_id=order.partner_company_id if order else None,
        )

        # Queue notifications
        await notification_service.queue_notification(
            template_key=f"deadline.{deadline_type.lower()}",
            recipients=recipients,
            variables=variables,
            priority=2,
            event_type="deadline.reminder",
            event_id=event_data.get("event_id"),
        )

    def _get_lock_template_key(
        self, previous_state: str | None, new_state: str
    ) -> str | None:
        """Get template key for lock state transition."""
        transitions = {
            ("unlocked", "locked"): "lock.applied",
            ("locked", "unlocked"): "lock.released",
            ("unlocked", "schedule_lock"): "lock.scheduled",
            ("schedule_lock", "locked"): "lock.auto_applied",
            ("locked", "cr_pending"): "lock.cr_pending",
            ("cr_pending", "unlocked"): "lock.cr_approved",
            ("cr_pending", "locked"): "lock.cr_rejected",
        }

        key = (previous_state, new_state) if previous_state else (None, new_state)
        return transitions.get(key)

    def _calculate_days_remaining(self, deadline_date: str) -> int:
        """Calculate days remaining until deadline."""
        try:
            deadline = datetime.fromisoformat(deadline_date.replace('Z', '+00:00'))
            now = datetime.now(UTC)
            delta = deadline - now
            return delta.days
        except Exception:
            return 0


# Task entry point for workers
async def process_notification_event(
    event_type: str,
    event_data: dict[str, Any],
    correlation_id: UUID | None = None,
) -> None:
    """Process notification event from queue.
    
    Args:
        event_type: Type of event
        event_data: Event payload
        correlation_id: Correlation ID for tracing
    """
    dispatcher = NotificationDispatcher()
    await dispatcher.dispatch_event(event_type, event_data, correlation_id)
