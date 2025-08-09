import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import redis.asyncio as redis
from redis.exceptions import LockError, RedisError

logger = logging.getLogger(__name__)


class DistributedLock:
    def __init__(
        self,
        redis_client: redis.Redis,
        name: str,
        timeout: int = 600,  # 10 minutes default
        blocking_timeout: float = 0,
        auto_renewal_interval: int = 30,
    ):
        self.redis_client = redis_client
        self.name = f"lock:{name}"
        self.timeout = timeout
        self.blocking_timeout = blocking_timeout
        self.auto_renewal_interval = auto_renewal_interval
        self.token = str(uuid.uuid4())
        self.lock = None
        self._renewal_task = None
        self._acquired_at = None

    async def acquire(self) -> bool:
        try:
            self.lock = self.redis_client.lock(
                self.name,
                timeout=self.timeout,
                blocking_timeout=self.blocking_timeout,
                token=self.token,
            )

            acquired = await self.lock.acquire()

            if acquired:
                self._acquired_at = datetime.now(UTC)
                logger.info(
                    "Lock acquired",
                    extra={
                        "lock_name": self.name,
                        "lock_token": self.token,
                        "timeout": self.timeout,
                        "acquired_at": self._acquired_at.isoformat(),
                    },
                )

                # Start auto-renewal task
                if self.auto_renewal_interval > 0:
                    self._renewal_task = asyncio.create_task(self._auto_renew())

                return True

            logger.warning(
                "Failed to acquire lock", extra={"lock_name": self.name, "lock_token": self.token}
            )
            return False

        except RedisError as e:
            logger.error(
                f"Redis error acquiring lock: {e}",
                extra={"lock_name": self.name, "lock_token": self.token},
            )
            return False

    async def release(self):
        if self._renewal_task:
            self._renewal_task.cancel()
            try:
                await self._renewal_task
            except asyncio.CancelledError:
                pass
            self._renewal_task = None

        if self.lock:
            try:
                await self.lock.release()

                duration = None
                if self._acquired_at:
                    duration = (datetime.now(UTC) - self._acquired_at).total_seconds()

                logger.info(
                    "Lock released",
                    extra={
                        "lock_name": self.name,
                        "lock_token": self.token,
                        "held_duration_seconds": duration,
                    },
                )
            except LockError as e:
                logger.warning(
                    f"Error releasing lock (may have expired): {e}",
                    extra={"lock_name": self.name, "lock_token": self.token},
                )
            except RedisError as e:
                logger.error(
                    f"Redis error releasing lock: {e}",
                    extra={"lock_name": self.name, "lock_token": self.token},
                )
            finally:
                self.lock = None
                self._acquired_at = None

    async def _auto_renew(self):
        while True:
            try:
                await asyncio.sleep(self.auto_renewal_interval)
                if self.lock:
                    await self.lock.extend(self.timeout)
                    logger.debug(
                        "Lock renewed",
                        extra={
                            "lock_name": self.name,
                            "lock_token": self.token,
                            "new_timeout": self.timeout,
                        },
                    )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(
                    f"Error renewing lock: {e}",
                    extra={"lock_name": self.name, "lock_token": self.token},
                )
                break

    async def is_locked(self) -> bool:
        try:
            return await self.redis_client.exists(self.name) > 0
        except RedisError as e:
            logger.error(f"Redis error checking lock status: {e}", extra={"lock_name": self.name})
            return False

    async def get_owner(self) -> str | None:
        try:
            owner = await self.redis_client.get(self.name)
            return owner.decode() if owner else None
        except RedisError as e:
            logger.error(f"Redis error getting lock owner: {e}", extra={"lock_name": self.name})
            return None

    async def break_stale_lock(self, max_age_seconds: int = 3600) -> bool:
        try:
            ttl = await self.redis_client.ttl(self.name)

            # If no TTL is set or lock is very old, force break it
            if ttl == -1 or ttl > max_age_seconds:
                logger.warning(
                    "Breaking stale lock",
                    extra={
                        "lock_name": self.name,
                        "ttl": ttl,
                        "max_age_seconds": max_age_seconds,
                    },
                )
                await self.redis_client.delete(self.name)
                return True

            return False
        except RedisError as e:
            logger.error(f"Redis error breaking stale lock: {e}", extra={"lock_name": self.name})
            return False


@asynccontextmanager
async def distributed_lock(
    redis_client: redis.Redis,
    name: str,
    timeout: int = 600,
    blocking_timeout: float = 0,
    auto_renewal_interval: int = 30,
    break_stale_after: int | None = None,
):
    lock = DistributedLock(
        redis_client,
        name,
        timeout,
        blocking_timeout,
        auto_renewal_interval,
    )

    # Optionally break stale locks
    if break_stale_after:
        await lock.break_stale_lock(break_stale_after)

    acquired = await lock.acquire()

    if not acquired:
        raise LockError(f"Could not acquire lock: {name}")

    try:
        yield lock
    finally:
        await lock.release()


async def acquire_scheduler_lock(
    redis_client: redis.Redis,
    scheduler_name: str,
    worker_id: str,
    timeout: int = 600,
) -> DistributedLock | None:
    lock_name = f"scheduler:{scheduler_name}"

    lock = DistributedLock(
        redis_client,
        lock_name,
        timeout=timeout,
        blocking_timeout=0,  # Don't block, return immediately
        auto_renewal_interval=30,
    )

    # Check for stale locks (locks older than 2x the timeout)
    await lock.break_stale_lock(max_age_seconds=timeout * 2)

    if await lock.acquire():
        logger.info(
            f"Scheduler lock acquired for {scheduler_name}",
            extra={
                "scheduler_name": scheduler_name,
                "worker_id": worker_id,
                "lock_token": lock.token,
            },
        )
        return lock

    logger.info(
        f"Another instance is already running {scheduler_name}",
        extra={"scheduler_name": scheduler_name, "worker_id": worker_id},
    )
    return None
