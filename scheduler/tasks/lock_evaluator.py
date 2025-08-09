import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import redis.asyncio as redis
from celery import Task
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from api.core.config import settings
from api.core.database import Base
from api.models.contract import OrderEm
from api.models.lock import LockRule
from api.services.locks.state_transition_service import StateTransitionService
from api.utils.distributed_lock import acquire_scheduler_lock
from scheduler.app import app

logger = logging.getLogger(__name__)

# Create async engine for the scheduler
engine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class SchedulerRun:
    def __init__(self, run_type: str, worker_id: str):
        self.id = uuid.uuid4()
        self.run_type = run_type
        self.worker_id = worker_id
        self.started_at = datetime.now(timezone.utc)
        self.completed_at = None
        self.ems_processed = 0
        self.ems_failed = 0
        self.status = "running"
        self.error_message = None
        self.lock_id = None

    async def save(self, db: AsyncSession):
        from sqlalchemy import text
        
        query = text("""
            INSERT INTO scheduler_run 
            (id, run_type, started_at, completed_at, ems_processed, 
             ems_failed, status, error_message, lock_id, worker_id)
            VALUES 
            (:id, :run_type, :started_at, :completed_at, :ems_processed,
             :ems_failed, :status, :error_message, :lock_id, :worker_id)
            ON CONFLICT (id) DO UPDATE SET
                completed_at = :completed_at,
                ems_processed = :ems_processed,
                ems_failed = :ems_failed,
                status = :status,
                error_message = :error_message
        """)
        
        await db.execute(
            query,
            {
                "id": self.id,
                "run_type": self.run_type,
                "started_at": self.started_at,
                "completed_at": self.completed_at,
                "ems_processed": self.ems_processed,
                "ems_failed": self.ems_failed,
                "status": self.status,
                "error_message": self.error_message,
                "lock_id": self.lock_id,
                "worker_id": self.worker_id,
            }
        )
        await db.commit()


class LockEvaluatorTask(Task):
    name = "scheduler.tasks.lock_evaluator"
    
    def __init__(self):
        super().__init__()
        self.redis_client = None
        self.batch_size = 50
        self.max_workers = 10
    
    async def get_redis_client(self) -> redis.Redis:
        if not self.redis_client:
            self.redis_client = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self.redis_client
    
    async def get_active_ems_with_rules(
        self,
        db: AsyncSession,
    ) -> List[int]:
        query = select(OrderEm.id).join(
            LockRule,
            and_(
                LockRule.order_em_id == OrderEm.id,
                LockRule.is_active == True,
            )
        ).where(
            OrderEm.status.in_(["active", "provisioned"])
        ).distinct()
        
        result = await db.execute(query)
        return [row[0] for row in result.fetchall()]
    
    async def process_em_batch(
        self,
        em_ids: List[int],
        db: AsyncSession,
    ) -> tuple[int, int]:
        service = StateTransitionService(db)
        
        # Evaluate lock states for this batch
        transitions = await service.evaluate_lock_states(em_ids)
        
        # Apply the transitions
        success_count, failure_count = await service.apply_transitions(transitions)
        
        logger.info(
            f"Processed batch of {len(em_ids)} EMs",
            extra={
                "em_count": len(em_ids),
                "transitions": len(transitions),
                "success": success_count,
                "failed": failure_count,
            }
        )
        
        return success_count, failure_count
    
    async def run_evaluation(self, worker_id: str) -> dict:
        redis_client = await self.get_redis_client()
        
        # Try to acquire distributed lock
        lock = await acquire_scheduler_lock(
            redis_client,
            "lock_evaluation",
            worker_id,
            timeout=600,  # 10 minutes
        )
        
        if not lock:
            logger.info("Another worker is already running lock evaluation")
            return {
                "status": "skipped",
                "reason": "Another worker already running",
            }
        
        scheduler_run = SchedulerRun("lock_evaluation", worker_id)
        scheduler_run.lock_id = lock.token
        
        try:
            async with AsyncSessionLocal() as db:
                # Save initial run record
                await scheduler_run.save(db)
                
                # Get all active EMs with lock rules
                em_ids = await self.get_active_ems_with_rules(db)
                
                logger.info(
                    f"Starting lock evaluation for {len(em_ids)} EMs",
                    extra={"total_ems": len(em_ids), "worker_id": worker_id}
                )
                
                if not em_ids:
                    scheduler_run.status = "completed"
                    scheduler_run.completed_at = datetime.now(timezone.utc)
                    await scheduler_run.save(db)
                    return {
                        "status": "completed",
                        "ems_processed": 0,
                        "message": "No EMs with active lock rules",
                    }
                
                # Process EMs in batches
                total_processed = 0
                total_failed = 0
                
                for i in range(0, len(em_ids), self.batch_size):
                    batch = em_ids[i:i + self.batch_size]
                    
                    try:
                        success, failed = await self.process_em_batch(batch, db)
                        total_processed += success
                        total_failed += failed
                    except Exception as e:
                        logger.error(
                            f"Error processing batch: {e}",
                            extra={
                                "batch_start": i,
                                "batch_size": len(batch),
                                "error": str(e),
                            }
                        )
                        total_failed += len(batch)
                
                # Update final run record
                scheduler_run.ems_processed = total_processed
                scheduler_run.ems_failed = total_failed
                scheduler_run.status = "completed"
                scheduler_run.completed_at = datetime.now(timezone.utc)
                await scheduler_run.save(db)
                
                logger.info(
                    "Lock evaluation completed",
                    extra={
                        "total_ems": len(em_ids),
                        "processed": total_processed,
                        "failed": total_failed,
                        "duration_seconds": (
                            scheduler_run.completed_at - scheduler_run.started_at
                        ).total_seconds(),
                    }
                )
                
                return {
                    "status": "completed",
                    "ems_processed": total_processed,
                    "ems_failed": total_failed,
                    "total_ems": len(em_ids),
                    "duration_seconds": (
                        scheduler_run.completed_at - scheduler_run.started_at
                    ).total_seconds(),
                }
                
        except Exception as e:
            logger.error(
                f"Lock evaluation failed: {e}",
                extra={"worker_id": worker_id, "error": str(e)}
            )
            
            # Update run record with error
            async with AsyncSessionLocal() as db:
                scheduler_run.status = "failed"
                scheduler_run.error_message = str(e)
                scheduler_run.completed_at = datetime.now(timezone.utc)
                await scheduler_run.save(db)
            
            return {
                "status": "failed",
                "error": str(e),
            }
        finally:
            # Always release the lock
            if lock:
                await lock.release()
            
            # Close Redis connection
            if self.redis_client:
                await self.redis_client.close()


@app.task(
    bind=True,
    name="lock_evaluator",
    max_retries=3,
    default_retry_delay=60,
)
def evaluate_locks(self) -> dict:
    worker_id = f"{self.request.hostname}_{self.request.id}"
    
    logger.info(
        f"Starting lock evaluation task",
        extra={"worker_id": worker_id, "task_id": self.request.id}
    )
    
    # Create new event loop for this task
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        task = LockEvaluatorTask()
        result = loop.run_until_complete(task.run_evaluation(worker_id))
        return result
    finally:
        loop.close()


# Celery beat schedule configuration
from celery.schedules import crontab

app.conf.beat_schedule = {
    "evaluate-locks-every-15-minutes": {
        "task": "lock_evaluator",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
        "options": {
            "expires": 600,  # Expire after 10 minutes if not executed
        },
    },
}