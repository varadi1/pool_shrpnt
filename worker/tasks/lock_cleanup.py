"""Celery task for automatic expired lock cleanup.

Runs periodically to clean up expired locks and restore permissions.
"""

import asyncio
import logging

from celery import shared_task
from celery.schedules import crontab

from api.core.config import settings
from api.core.database import AsyncSessionLocal
from api.tasks.lock_cleanup import ExpiredLockCleanupTask

logger = logging.getLogger(__name__)


@shared_task(name="worker.tasks.lock_cleanup.cleanup_expired_locks")
def cleanup_expired_locks():
    """Celery task that runs the async cleanup task."""
    logger.info("Starting scheduled lock cleanup task")

    async def run_cleanup():
        async with AsyncSessionLocal() as db:
            cleanup_task = ExpiredLockCleanupTask(db)
            return await cleanup_task.cleanup_expired_locks()

    # Run the async task in the event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(run_cleanup())
        logger.info(
            f"Lock cleanup completed: {result['cleaned_count']} locks cleaned", extra=result
        )
        return result
    except Exception as e:
        logger.error(f"Lock cleanup task failed: {e}")
        raise
    finally:
        loop.close()


# Celery beat schedule configuration
CELERYBEAT_SCHEDULE = {
    "cleanup-expired-locks": {
        "task": "worker.tasks.lock_cleanup.cleanup_expired_locks",
        "schedule": settings.lock_cleanup_interval_seconds,  # Run based on settings
        "options": {
            "expires": settings.lock_cleanup_interval_seconds / 2,  # Expire if not run in time
        },
    },
    "cleanup-expired-locks-daily": {
        "task": "worker.tasks.lock_cleanup.cleanup_expired_locks",
        "schedule": crontab(hour=2, minute=0),  # Also run daily at 2 AM
        "options": {
            "priority": 5,  # Medium priority
        },
    },
}
