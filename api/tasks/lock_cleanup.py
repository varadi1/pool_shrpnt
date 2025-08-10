"""Background task for cleaning up expired locks.

Automatically removes expired locks and restores calculated permissions.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from api.core.config import settings
from api.core.database import AsyncSessionLocal
from api.models.audit import AuditLog
from api.models.lock import LockState
from api.services.rbac.lock_service import LockService

logger = logging.getLogger(__name__)


class ExpiredLockCleanupTask:
    """Task for cleaning up expired locks."""

    def __init__(self, db_session: AsyncSession | None = None):
        self.db = db_session
        self.lock_service = None
        self._cleanup_interval = settings.LOCK_CLEANUP_INTERVAL_SECONDS or 3600  # Default 1 hour
        self._batch_size = settings.LOCK_CLEANUP_BATCH_SIZE or 50
        self._running = False

    async def initialize(self):
        """Initialize the task with database session if not provided."""
        if not self.db:
            # Always use asyncpg driver for PostgreSQL
            engine = create_async_engine(
                settings.database_url.replace("postgresql://", "postgresql+asyncpg://")
            )
            async with engine.begin() as conn:
                self.db = AsyncSession(conn)

        self.lock_service = LockService(self.db)

    async def cleanup_expired_locks(self) -> dict[str, Any]:
        """Clean up all expired locks.

        Returns:
            Cleanup results including count of cleaned locks
        """
        logger.info("Starting expired lock cleanup")

        now = datetime.now(UTC)

        # Find expired locks
        stmt = (
            select(LockState)
            .where(
                and_(
                    LockState.is_active,
                    LockState.expires_at.isnot(None),
                    LockState.expires_at < now,
                )
            )
            .limit(self._batch_size)
        )

        result = await self.db.execute(stmt)
        expired_locks = result.scalars().all()

        cleaned_count = 0
        errors = []

        for lock in expired_locks:
            try:
                await self._cleanup_single_lock(lock)
                cleaned_count += 1
            except Exception as e:
                logger.error(
                    f"Failed to cleanup expired lock {lock.id}: {e}",
                    extra={"lock_id": str(lock.id), "error": str(e)},
                )
                errors.append(
                    {"lock_id": str(lock.id), "folder_path": lock.folder_path, "error": str(e)}
                )

        # Log cleanup results
        if cleaned_count > 0:
            await self._audit_cleanup(cleaned_count, errors)

        logger.info(
            f"Expired lock cleanup completed: {cleaned_count} locks cleaned",
            extra={"cleaned": cleaned_count, "errors": len(errors)},
        )

        return {
            "cleaned_count": cleaned_count,
            "total_found": len(expired_locks),
            "errors": errors,
            "timestamp": now.isoformat(),
        }

    async def _cleanup_single_lock(self, lock: LockState) -> None:
        """Clean up a single expired lock.

        Args:
            lock: The expired lock to clean up
        """
        # Mark lock as inactive
        lock.is_active = False
        lock.removed_at = datetime.now(UTC)
        lock.removed_by = None  # System removal
        lock.removal_reason = "Expired"

        # Restore calculated permissions
        await self.lock_service._restore_calculated_permissions(lock.folder_id, lock.folder_path)

        await self.db.flush()

        logger.info(
            f"Cleaned up expired lock for {lock.folder_path}",
            extra={
                "lock_id": str(lock.id),
                "folder_path": lock.folder_path,
                "expired_at": lock.expires_at.isoformat() if lock.expires_at else None,
            },
        )

    async def _audit_cleanup(self, cleaned_count: int, errors: list[dict]) -> None:
        """Create audit log for cleanup operation.

        Args:
            cleaned_count: Number of locks cleaned
            errors: List of errors encountered
        """
        audit_entry = AuditLog(
            action="expired_lock_cleanup",
            entity_type="lock_cleanup_task",
            entity_id="system",
            user_id="system",
            correlation_id="lock_cleanup",
            details={
                "cleaned_count": cleaned_count,
                "error_count": len(errors),
                "errors": errors[:10],  # Limit error details
            },
            timestamp=datetime.now(UTC),
        )
        self.db.add(audit_entry)
        await self.db.flush()

    async def run_continuous(self) -> None:
        """Run cleanup task continuously at configured interval."""
        self._running = True
        logger.info(f"Starting continuous lock cleanup with interval {self._cleanup_interval}s")

        while self._running:
            try:
                await self.cleanup_expired_locks()
            except Exception as e:
                logger.error(f"Lock cleanup cycle failed: {e}")

            # Wait for next cycle
            await asyncio.sleep(self._cleanup_interval)

    def stop(self) -> None:
        """Stop the continuous cleanup task."""
        self._running = False
        logger.info("Stopping lock cleanup task")


# Celery task wrapper for scheduled execution
async def cleanup_expired_locks_task():
    """Celery task for cleaning up expired locks."""
    async with AsyncSessionLocal() as db:
        task = ExpiredLockCleanupTask(db)
        await task.initialize()
        return await task.cleanup_expired_locks()


# Command-line execution
if __name__ == "__main__":

    async def main():
        task = ExpiredLockCleanupTask()
        await task.initialize()
        result = await task.cleanup_expired_locks()
        print(f"Cleanup completed: {result}")

    asyncio.run(main())
