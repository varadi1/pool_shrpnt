import json
import uuid
from datetime import datetime, timedelta
from typing import Any

import redis.asyncio as redis
from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.logging import get_logger
from api.services.orders import OrderService

logger = get_logger(__name__)

# Create a Celery instance for sending tasks
celery_app = Celery(
    "pooldrv_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)


class ProvisioningService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.order_service = OrderService(session)
        self.redis_client: redis.Redis | None = None

    async def _get_redis(self) -> redis.Redis:
        if not self.redis_client:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL, encoding="utf-8", decode_responses=True
            )
        return self.redis_client

    async def trigger_provisioning(
        self,
        order_id: int,
        template_id: int | None,
        priority: str,
        correlation_id: str,
        user_id: str,
    ) -> str:
        """Trigger async provisioning workflow"""
        # Validate order can be provisioned
        can_provision, message = await self.order_service.can_provision_order(order_id)
        if not can_provision:
            raise ValueError(message)

        # Generate job ID
        job_id = str(uuid.uuid4())

        # Store initial job status in Redis
        redis_client = await self._get_redis()
        job_key = f"job:{job_id}"
        job_data = {
            "job_id": job_id,
            "order_id": order_id,
            "status": "pending",
            "phase": "validating",
            "progress": 0,
            "message": "Provisioning job created",
            "correlation_id": correlation_id,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "template_id": template_id,
        }
        await redis_client.hset(job_key, mapping=job_data)
        await redis_client.expire(job_key, 86400)  # 24 hour TTL

        # Update order status
        await self.order_service.start_provisioning(order_id, job_id)

        # Queue the provisioning task
        task = celery_app.send_task(
            "worker.tasks.provisioning.provision_order",
            kwargs={
                "order_id": order_id,
                "job_id": job_id,
                "template_id": template_id,
                "correlation_id": correlation_id,
                "user_id": user_id,
            },
            queue="provisioning",
            priority={"low": 0, "normal": 5, "high": 9}.get(priority, 5),
        )

        # Store Celery task ID
        await redis_client.hset(job_key, "celery_task_id", task.id)

        logger.info(
            f"Provisioning triggered for order {order_id} with job {job_id}",
            extra={"correlation_id": correlation_id},
        )

        return job_id

    async def get_job_status(self, job_id: str) -> dict[str, Any] | None:
        """Get current status of a provisioning job"""
        redis_client = await self._get_redis()
        job_key = f"job:{job_id}"

        job_data = await redis_client.hgetall(job_key)
        if not job_data:
            return None

        # Parse numeric fields
        if "progress" in job_data:
            job_data["progress"] = int(job_data["progress"])
        if "order_id" in job_data:
            job_data["order_id"] = int(job_data["order_id"])

        # Parse datetime fields
        for field in ["created_at", "started_at", "completed_at", "estimated_completion"]:
            if field in job_data and job_data[field]:
                job_data[field] = job_data[field]

        # Add details if available
        details_key = f"job:{job_id}:details"
        details = await redis_client.get(details_key)
        if details:
            job_data["details"] = json.loads(details)

        return job_data

    async def update_job_status(
        self,
        job_id: str,
        status: str | None = None,
        phase: str | None = None,
        progress: int | None = None,
        message: str | None = None,
        error: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> bool:
        """Update job status in Redis"""
        redis_client = await self._get_redis()
        job_key = f"job:{job_id}"

        # Check if job exists
        if not await redis_client.exists(job_key):
            return False

        updates = {}
        if status:
            updates["status"] = status
        if phase:
            updates["phase"] = phase
        if progress is not None:
            updates["progress"] = str(progress)
        if message:
            updates["message"] = message
        if error:
            updates["error"] = error

        # Handle status transitions
        if status == "in_progress" and "started_at" not in await redis_client.hkeys(job_key):
            updates["started_at"] = datetime.utcnow().isoformat()
            # Estimate completion based on phase
            phase_durations = {
                "validating": 30,
                "creating_team": 120,
                "creating_folders": 180,
                "applying_permissions": 120,
            }
            estimated_seconds = phase_durations.get(phase or "validating", 300)
            updates["estimated_completion"] = (
                datetime.utcnow() + timedelta(seconds=estimated_seconds)
            ).isoformat()

        if status in ["completed", "failed", "cancelled"]:
            updates["completed_at"] = datetime.utcnow().isoformat()

        if updates:
            await redis_client.hset(job_key, mapping=updates)

        # Store details separately if provided
        if details:
            details_key = f"job:{job_id}:details"
            await redis_client.set(details_key, json.dumps(details), ex=86400)

        return True

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a provisioning job"""
        redis_client = await self._get_redis()
        job_key = f"job:{job_id}"

        job_data = await redis_client.hgetall(job_key)
        if not job_data:
            return False

        if job_data.get("status") in ["completed", "failed", "cancelled"]:
            return False  # Can't cancel finished job

        # Revoke Celery task if it exists
        if "celery_task_id" in job_data:
            celery_app.control.revoke(job_data["celery_task_id"], terminate=True)

        # Update job status
        await self.update_job_status(job_id, status="cancelled", message="Job cancelled by user")

        # Update order status if needed
        if "order_id" in job_data:
            await self.order_service.fail_provisioning(
                int(job_data["order_id"]), "Provisioning cancelled by user"
            )

        logger.info(f"Job {job_id} cancelled")
        return True

    async def cleanup_old_jobs(self, days: int = 7) -> int:
        """Clean up old job data from Redis"""
        redis_client = await self._get_redis()
        cursor = 0
        deleted = 0
        cutoff = datetime.utcnow() - timedelta(days=days)

        while True:
            cursor, keys = await redis_client.scan(cursor, match="job:*", count=100)
            for key in keys:
                if ":details" in key:
                    continue

                job_data = await redis_client.hget(key, "created_at")
                if job_data:
                    created_at = datetime.fromisoformat(job_data)
                    if created_at < cutoff:
                        await redis_client.delete(key)
                        await redis_client.delete(f"{key}:details")
                        deleted += 1

            if cursor == 0:
                break

        logger.info(f"Cleaned up {deleted} old jobs")
        return deleted
