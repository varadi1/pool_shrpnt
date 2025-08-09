"""Scheduler task for T-window deadline notifications."""
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.core.database import get_db
from api.models.contract import OrderEm
from api.models.notification import NotificationHistory
from worker.tasks.notification_dispatcher import NotificationDispatcher

logger = logging.getLogger(__name__)


class DeadlineNotifier:
    """Handles deadline notification scheduling."""

    def __init__(self):
        """Initialize the deadline notifier."""
        self.dispatcher = NotificationDispatcher()
        self.notification_windows = {
            "T-3": timedelta(days=3),
            "T-1": timedelta(days=1),
            "T+0": timedelta(days=0),
        }

    async def check_and_send_deadline_notifications(self) -> dict[str, int]:
        """Check for upcoming deadlines and send notifications.
        
        Returns:
            Statistics of notifications sent
        """
        stats = {"checked": 0, "notified": 0, "skipped": 0}

        async for session in get_db():
            try:
                # Get all active lock rules with T values (deadlines)
                from api.models.lock import LockRule
                
                stmt = select(LockRule).where(
                    and_(
                        LockRule.t_value.isnot(None),
                        LockRule.is_active == True,
                    )
                ).options(selectinload(LockRule.order_em))
                result = await session.execute(stmt)
                lock_rules = result.scalars().all()

                stats["checked"] = len(lock_rules)

                for lock_rule in lock_rules:
                    if not lock_rule.order_em:
                        continue
                    notifications_sent = await self._check_lock_rule_deadlines(
                        session, lock_rule
                    )
                    if notifications_sent > 0:
                        stats["notified"] += notifications_sent
                    else:
                        stats["skipped"] += 1

                logger.info(
                    f"Deadline check completed: {stats['checked']} orders, "
                    f"{stats['notified']} notifications sent"
                )

            except Exception as e:
                logger.error(f"Error checking deadlines: {str(e)}")
                raise

        return stats

    async def _check_lock_rule_deadlines(
        self, session: AsyncSession, lock_rule: "LockRule"
    ) -> int:
        """Check deadlines for a specific lock rule.
        
        Args:
            session: Database session
            lock_rule: Lock rule to check
            
        Returns:
            Number of notifications sent
        """
        if not lock_rule.t_value:
            return 0

        order = lock_rule.order_em
        if not order:
            return 0

        notifications_sent = 0
        now = datetime.now(UTC)
        deadline = lock_rule.t_value

        # Check each notification window
        for window_name, time_before in self.notification_windows.items():
            notification_time = deadline - time_before

            # Check if we should send this notification now
            # We have a 1-hour window for sending each notification
            if notification_time <= now <= notification_time + timedelta(hours=1):
                # Check if we've already sent this notification
                if await self._already_notified(session, order.id, window_name):
                    logger.debug(
                        f"Already sent {window_name} notification for order {order.id}"
                    )
                    continue

                # Send the notification
                await self._send_deadline_notification(
                    session, order, window_name, deadline
                )
                notifications_sent += 1

        return notifications_sent

    async def _already_notified(
        self,
        session: AsyncSession,
        em_id: int,
        window_name: str,
    ) -> bool:
        """Check if notification was already sent for this window.
        
        Args:
            session: Database session
            em_id: Order ID
            window_name: Notification window (T-3, T-1, T+0)
            
        Returns:
            True if already notified
        """
        # Check in notification history
        since = datetime.now(UTC) - timedelta(hours=25)  # 25 hours to be safe
        dedup_key = f"deadline.{window_name.lower()}:{em_id}"

        stmt = select(NotificationHistory).where(
            and_(
                NotificationHistory.event_type == "deadline.reminder",
                NotificationHistory.dedup_key.like(f"%{dedup_key}%"),
                NotificationHistory.sent_at >= since,
            )
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        return existing is not None

    async def _send_deadline_notification(
        self,
        session: AsyncSession,
        order: OrderEm,
        window_name: str,
        deadline: datetime,
    ) -> None:
        """Send a deadline notification.
        
        Args:
            session: Database session
            order: Order with approaching deadline
            window_name: Notification window (T-3, T-1, T+0)
            deadline: The actual deadline datetime
        """
        event_id = uuid4()
        correlation_id = uuid4()

        logger.info(
            f"Sending {window_name} deadline notification for order {order.id}",
            extra={
                "correlation_id": str(correlation_id),
                "em_id": order.id,
                "window": window_name,
            }
        )

        # Prepare event data
        event_data = {
            "em_id": order.id,
            "deadline_type": window_name,
            "deadline_date": deadline.isoformat(),
            "event_id": event_id,
        }

        # Dispatch the notification event
        await self.dispatcher.dispatch_event(
            event_type="deadline.reminder",
            event_data=event_data,
            correlation_id=correlation_id,
        )

    async def schedule_notifications_for_date(
        self,
        target_date: datetime,
        dry_run: bool = False,
    ) -> list[dict[str, Any]]:
        """Preview/schedule notifications for a specific date.
        
        Args:
            target_date: Date to check notifications for
            dry_run: If True, only preview without sending
            
        Returns:
            List of notifications that would be/were sent
        """
        notifications = []

        async for session in get_db():
            from api.models.lock import LockRule
            
            # Find lock rules with deadlines around the target date
            for window_name, time_before in self.notification_windows.items():
                # Lock rules with deadline = target_date + time_before
                deadline_date = target_date + time_before

                stmt = select(LockRule).where(
                    and_(
                        LockRule.t_value >= deadline_date.replace(hour=0, minute=0),
                        LockRule.t_value < deadline_date.replace(hour=23, minute=59),
                        LockRule.is_active == True,
                    )
                ).options(selectinload(LockRule.order_em))
                result = await session.execute(stmt)
                lock_rules = result.scalars().all()

                for lock_rule in lock_rules:
                    if not lock_rule.order_em:
                        continue
                        
                    order = lock_rule.order_em
                    notification_info = {
                        "em_id": order.id,
                        "em_name": order.title,
                        "window": window_name,
                        "deadline": lock_rule.t_value.isoformat(),
                        "notification_time": (lock_rule.t_value - time_before).isoformat(),
                        "status": "pending" if dry_run else "scheduled",
                    }

                    if not dry_run:
                        # Actually schedule the notification
                        await self._send_deadline_notification(
                            session, order, window_name, lock_rule.t_value
                        )
                        notification_info["status"] = "sent"

                    notifications.append(notification_info)

        return notifications

    async def calculate_notification_times(
        self, em_id: int
    ) -> dict[str, datetime | None]:
        """Calculate T-window notification times for an order.
        
        Args:
            em_id: Order ID
            
        Returns:
            Dictionary of window names to notification times
        """
        times = {}

        async for session in get_db():
            from api.models.lock import LockRule
            
            # Get the first active lock rule for this order
            stmt = select(LockRule).where(
                and_(
                    LockRule.order_em_id == em_id,
                    LockRule.is_active == True,
                    LockRule.t_value.isnot(None),
                )
            )
            result = await session.execute(stmt)
            lock_rule = result.scalar_one_or_none()
            
            if not lock_rule or not lock_rule.t_value:
                return times

            for window_name, time_before in self.notification_windows.items():
                times[window_name] = lock_rule.t_value - time_before

        return times


# Scheduled task entry point
async def run_deadline_check() -> None:
    """Run deadline check as a scheduled task.
    
    This should be called by the scheduler every hour.
    """
    notifier = DeadlineNotifier()
    stats = await notifier.check_and_send_deadline_notifications()

    logger.info(
        f"Deadline check completed: {stats['notified']} notifications sent",
        extra=stats
    )


# Manual trigger for testing
async def test_deadline_notifications(
    em_id: int | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Test deadline notifications.
    
    Args:
        em_id: Specific order ID to test (None for all)
        dry_run: If True, only preview without sending
        
    Returns:
        Test results
    """
    notifier = DeadlineNotifier()

    if em_id:
        # Test specific order
        times = await notifier.calculate_notification_times(em_id)
        return {
            "em_id": em_id,
            "notification_times": {
                k: v.isoformat() if v else None
                for k, v in times.items()
            },
            "dry_run": dry_run,
        }
    else:
        # Test for today
        notifications = await notifier.schedule_notifications_for_date(
            datetime.now(UTC),
            dry_run=dry_run,
        )
        return {
            "date": datetime.now(UTC).date().isoformat(),
            "notifications": notifications,
            "dry_run": dry_run,
        }

