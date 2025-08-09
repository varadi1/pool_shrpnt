"""Celery task for checking and processing expired Change Requests."""

import os
from datetime import UTC, datetime
from uuid import uuid4

from celery import Task
from celery.schedules import crontab
from celery.utils.log import get_task_logger
from redis import Redis, ConnectionPool
from redis.lock import Lock as RedisLock
from sqlalchemy.orm import Session

from api.core.database import SessionLocal
from api.services.locks.cr_service import CRService
from worker.app import celery_app

logger = get_task_logger(__name__)

# Redis configuration from environment variables
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_SCHEDULER_DB", "1"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

# Create connection pool for better performance
redis_pool = ConnectionPool(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD,
    decode_responses=True,
)

# Redis client for distributed locking
redis_client = Redis(connection_pool=redis_pool)

# Lock timeout for CR expiry checking
LOCK_TIMEOUT = 300  # 5 minutes


class CRExpiryTask(Task):
    """Base task class with database session management."""

    _db: Session | None = None

    @property
    def db(self) -> Session:
        """Get or create database session."""
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Clean up database session after task completion."""
        if self._db is not None:
            self._db.close()
            self._db = None


@celery_app.task(
    base=CRExpiryTask,
    bind=True,
    name="scheduler.check_cr_expiry",
    queue="locks",
    max_retries=3,
    default_retry_delay=60,
)
async def check_cr_expiry(self, force: bool = False) -> dict:
    """Check for expired Change Requests and automatically re-lock folders.
    
    This task runs every 15 minutes to check for expired CRs and process them.
    When a CR expires, the affected folders are automatically re-locked unless
    there are other active CRs for the same scope.
    
    Args:
        force: Force execution even if recently run
        
    Returns:
        Dictionary with execution results
    """
    start_time = datetime.now(UTC)
    correlation_id = uuid4()
    
    # Acquire distributed lock to prevent concurrent execution
    lock_key = "cr_expiry_checker:lock"
    lock = RedisLock(redis_client, lock_key, timeout=LOCK_TIMEOUT)
    
    try:
        # Try to acquire lock with blocking (wait up to 5 seconds)
        if not lock.acquire(blocking=True, blocking_timeout=5):
            logger.warning(
                "Could not acquire lock for CR expiry check, another instance is running"
            )
            return {
                "status": "skipped",
                "reason": "another_instance_running",
                "timestamp": start_time.isoformat(),
            }
        
        logger.info(
            "Starting CR expiry check",
            extra={
                "correlation_id": str(correlation_id),
                "timestamp": start_time.isoformat(),
            },
        )
        
        # Process expired CRs
        cr_service = CRService(self.db)
        expired_crs = await cr_service.expire_crs(correlation_id=correlation_id)
        
        # Calculate execution time
        execution_time_ms = (datetime.now(UTC) - start_time).total_seconds() * 1000
        
        if expired_crs:
            logger.info(
                f"Processed {len(expired_crs)} expired CRs",
                extra={
                    "expired_count": len(expired_crs),
                    "cr_ids": [str(cr.id) for cr in expired_crs],
                    "correlation_id": str(correlation_id),
                    "execution_time_ms": execution_time_ms,
                },
            )
            
            # Queue permission updates for each expired CR
            # Note: In production, this would trigger SharePoint permission updates
            # via worker.tasks.lock_application.apply_lock_state
            # For MVP, we log the action but don't queue the task
            for cr in expired_crs:
                # Determine affected folders based on CR scope
                folder_patterns = _get_folder_patterns_for_scope(cr.scope)
                
                logger.info(
                    f"Would queue permission updates for {len(folder_patterns)} folders "
                    f"for expired CR {cr.id}",
                    extra={
                        "cr_id": str(cr.id),
                        "em_id": cr.em_id,
                        "scope": cr.scope,
                        "folder_count": len(folder_patterns),
                        "correlation_id": str(correlation_id),
                    },
                )
        else:
            logger.debug(
                "No expired CRs found",
                extra={
                    "correlation_id": str(correlation_id),
                    "execution_time_ms": execution_time_ms,
                },
            )
        
        return {
            "status": "success",
            "expired_count": len(expired_crs),
            "cr_ids": [str(cr.id) for cr in expired_crs],
            "correlation_id": str(correlation_id),
            "execution_time_ms": execution_time_ms,
            "timestamp": start_time.isoformat(),
        }
    
    except Exception as e:
        logger.error(
            f"Error during CR expiry check: {e}",
            extra={
                "error": str(e),
                "correlation_id": str(correlation_id),
                "timestamp": start_time.isoformat(),
            },
        )
        
        # Retry the task with exponential backoff
        raise self.retry(exc=e)
    
    finally:
        # Always release the lock
        try:
            lock.release()
        except Exception:
            pass  # Lock may have expired


def _get_folder_patterns_for_scope(scope: str) -> list[str]:
    """Get folder patterns for a CR scope.
    
    Args:
        scope: 'experts' or 'deliverables'
        
    Returns:
        List of folder path patterns
    """
    if scope == "experts":
        return [
            "2. Szakértők",
            "Szakértők",
            "experts"
        ]
    elif scope == "deliverables":
        return [
            "3. Eredménytermékek",
            "Eredménytermékek",
            "deliverables"
        ]
    else:
        return []


# Celery beat schedule configuration
beat_schedule = {
    "check-cr-expiry": {
        "task": "scheduler.check_cr_expiry",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
        "options": {
            "queue": "locks",
            "expires": 600,  # Expire after 10 minutes if not executed
        },
    },
}