"""Celery tasks for time-based lock evaluation and application."""

import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

from celery import Task
from celery.schedules import crontab
from celery.utils.log import get_task_logger
from redis import Redis, ConnectionPool
from redis.lock import Lock as RedisLock
from sqlalchemy.orm import Session

from api.core.database import SessionLocal
from api.core.idempotency import IdempotencyService
from api.services.locks.lock_evaluator import LockEvaluator, LockTransition
from api.services.locks.monitoring import LockMonitoringService
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

# Lock timeout and renewal settings
LOCK_TIMEOUT = 600  # 10 minutes
LOCK_RENEWAL_INTERVAL = 30  # Renew every 30 seconds


class LockSchedulerTask(Task):
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
    base=LockSchedulerTask,
    bind=True,
    name="scheduler.evaluate_lock_transitions",
    queue="locks",
    max_retries=3,
    default_retry_delay=60,
)
def evaluate_lock_transitions(
    self, evaluation_time: str | None = None, force: bool = False
) -> dict:
    """Evaluate all lock rules and apply necessary transitions.

    This task runs every 15 minutes via Celery beat to evaluate lock rules
    and apply state transitions as needed.

    Args:
        evaluation_time: ISO format time string to evaluate (defaults to now)
        force: Force evaluation even if recently run

    Returns:
        Dictionary with evaluation results
    """
    # Parse evaluation time
    if evaluation_time:
        eval_time = datetime.fromisoformat(evaluation_time)
        if eval_time.tzinfo is None:
            eval_time = eval_time.replace(tzinfo=UTC)
    else:
        eval_time = datetime.now(UTC)

    # Generate idempotency key for this evaluation window
    # Round to 15-minute window to ensure idempotency
    window_start = eval_time.replace(minute=(eval_time.minute // 15) * 15, second=0, microsecond=0)
    window_key = f"lock_eval_{window_start.isoformat()}"

    # Acquire distributed lock to prevent concurrent evaluations
    lock_key = "lock_scheduler:evaluate_transitions"
    lock = RedisLock(redis_client, lock_key, timeout=LOCK_TIMEOUT)

    try:
        # Try to acquire lock with blocking (wait up to 5 seconds)
        if not lock.acquire(blocking=True, blocking_timeout=5):
            logger.warning(
                "Could not acquire lock for transition evaluation, " "another instance is running"
            )
            return {
                "status": "skipped",
                "reason": "another_instance_running",
                "evaluation_time": eval_time.isoformat(),
            }

        # Check idempotency - have we already run for this window?
        if not force:
            idempotency_service = IdempotencyService(self.db)
            existing = idempotency_service.check_operation(
                idempotency_key=window_key,
                em_id="system",
                operation="lock_evaluation",
                scope="all_orders",
                timestamp_window=window_start,
            )

            if existing and existing.status == "completed":
                logger.info(
                    f"Lock evaluation already completed for window {window_start.isoformat()}"
                )
                return {
                    "status": "skipped",
                    "reason": "already_evaluated",
                    "window": window_start.isoformat(),
                    "evaluation_time": eval_time.isoformat(),
                }

            # Mark operation as in progress
            idempotency_service.record_operation(
                idempotency_key=window_key,
                em_id="system",
                operation="lock_evaluation",
                scope="all_orders",
                timestamp_window=window_start,
                status="in_progress",
            )

        # Create evaluation run ID for audit trail
        evaluation_run_id = uuid4()
        correlation_id = f"lock_eval_{evaluation_run_id}"

        logger.info(
            "Starting lock transition evaluation",
            extra={
                "evaluation_run_id": str(evaluation_run_id),
                "evaluation_time": eval_time.isoformat(),
                "window_start": window_start.isoformat(),
            },
        )

        # Evaluate all active orders
        evaluator = LockEvaluator(self.db)
        monitoring = LockMonitoringService(self.db)

        eval_start = datetime.now(UTC)
        transitions = evaluator.evaluate_all_active_orders(eval_time)
        eval_duration_ms = (datetime.now(UTC) - eval_start).total_seconds() * 1000

        # Record evaluation metrics (subtask 12)
        monitoring.record_evaluation_latency(str(evaluation_run_id), eval_duration_ms)

        # Group transitions by order for batch processing
        transition_tasks = evaluator.generate_transition_tasks(transitions)

        # Apply transitions
        successful_transitions = 0

        for order_em_id, order_transitions in transition_tasks.items():
            # Queue transition application for each order
            apply_order_transitions.delay(
                order_em_id=order_em_id,
                transitions=[_serialize_transition(t) for t in order_transitions],
                evaluation_run_id=str(evaluation_run_id),
                correlation_id=correlation_id,
            )
            successful_transitions += len(order_transitions)

        # Mark idempotency as completed
        if not force:
            idempotency_service.complete_operation(
                idempotency_key=window_key,
                result={
                    "transitions_queued": successful_transitions,
                    "evaluation_run_id": str(evaluation_run_id),
                },
            )

        # Record evaluation completed
        monitoring.record_evaluation_completed(str(evaluation_run_id))

        logger.info(
            "Lock evaluation completed",
            extra={
                "evaluation_run_id": str(evaluation_run_id),
                "transitions_queued": successful_transitions,
                "orders_affected": len(transition_tasks),
            },
        )

        return {
            "status": "success",
            "evaluation_run_id": str(evaluation_run_id),
            "evaluation_time": eval_time.isoformat(),
            "window_start": window_start.isoformat(),
            "transitions_queued": successful_transitions,
            "orders_affected": len(transition_tasks),
        }

    except Exception as e:
        logger.error(
            f"Error during lock evaluation: {e}",
            extra={
                "error": str(e),
                "evaluation_time": eval_time.isoformat(),
            },
        )

        # Mark idempotency as failed
        if not force:
            idempotency_service = IdempotencyService(self.db)
            idempotency_service.fail_operation(idempotency_key=window_key, error=str(e))

        # Retry the task with exponential backoff
        raise self.retry(exc=e)

    finally:
        # Always release the lock
        try:
            lock.release()
        except Exception:
            pass  # Lock may have expired


@celery_app.task(
    base=LockSchedulerTask,
    bind=True,
    name="scheduler.apply_order_transitions",
    queue="locks",
    max_retries=5,
    default_retry_delay=30,
)
def apply_order_transitions(
    self,
    order_em_id: int,
    transitions: list[dict],
    evaluation_run_id: str,
    correlation_id: str,
) -> dict:
    """Apply lock transitions for a specific order.

    Args:
        order_em_id: Order/EM identifier
        transitions: List of serialized transitions to apply
        evaluation_run_id: ID of the evaluation run
        correlation_id: Correlation ID for tracing

    Returns:
        Dictionary with application results
    """
    logger.info(
        f"Applying {len(transitions)} transitions for order {order_em_id}",
        extra={
            "order_em_id": order_em_id,
            "transition_count": len(transitions),
            "evaluation_run_id": evaluation_run_id,
        },
    )

    evaluator = LockEvaluator(self.db)
    monitoring = LockMonitoringService(self.db)
    successful = 0
    failed = 0

    for transition_data in transitions:
        try:
            # Deserialize transition
            transition = _deserialize_transition(transition_data)

            # Apply the transition
            evaluator.apply_transition(
                transition=transition,
                evaluation_run_id=UUID(evaluation_run_id),
                correlation_id=correlation_id,
            )
            successful += 1

            # Record success metric (subtask 13)
            monitoring.record_transition_result(
                order_em_id=order_em_id,
                folder_path=transition_data.get("folder_path"),
                success=True,
            )

            # Apply permissions to SharePoint via Graph API
            from worker.tasks.lock_application import apply_lock_state
            apply_lock_state.delay(
                order_em_id=order_em_id,
                folder_path=transition_data.get("folder_path"),
                new_state=transition_data.get("new_state"),
                new_permission=transition_data.get("new_permission"),
                lock_rule_id=transition_data.get("lock_rule_id"),
                evaluation_run_id=evaluation_run_id,
                correlation_id=correlation_id,
            )

        except Exception as e:
            logger.error(
                f"Failed to apply transition: {e}",
                extra={
                    "order_em_id": order_em_id,
                    "folder_path": transition_data.get("folder_path"),
                    "error": str(e),
                    "evaluation_run_id": evaluation_run_id,
                },
            )
            failed += 1

            # Record failure metric (subtask 13)
            monitoring.record_transition_result(
                order_em_id=order_em_id,
                folder_path=transition_data.get("folder_path"),
                success=False,
            )

    logger.info(
        f"Completed transition application for order {order_em_id}",
        extra={
            "order_em_id": order_em_id,
            "successful": successful,
            "failed": failed,
            "evaluation_run_id": evaluation_run_id,
        },
    )

    return {
        "order_em_id": order_em_id,
        "successful_transitions": successful,
        "failed_transitions": failed,
        "evaluation_run_id": evaluation_run_id,
    }


def _serialize_transition(transition: LockTransition) -> dict:
    """Serialize a LockTransition for task queue."""
    return {
        "order_em_id": transition.order_em_id,
        "folder_path": transition.folder_path,
        "current_state": transition.current_state,
        "new_state": transition.new_state,
        "current_permission": transition.current_permission,
        "new_permission": transition.new_permission,
        "lock_rule_id": str(transition.lock_rule_id) if transition.lock_rule_id else None,
        "reason": transition.reason,
    }


def _deserialize_transition(data: dict) -> LockTransition:
    """Deserialize a transition from task queue."""
    from uuid import UUID

    return LockTransition(
        order_em_id=data["order_em_id"],
        folder_path=data["folder_path"],
        current_state=data["current_state"],
        new_state=data["new_state"],
        current_permission=data["current_permission"],
        new_permission=data["new_permission"],
        lock_rule_id=UUID(data["lock_rule_id"]) if data["lock_rule_id"] else None,
        reason=data["reason"],
    )


# Celery beat schedule configuration
beat_schedule = {
    "evaluate-lock-transitions": {
        "task": "scheduler.evaluate_lock_transitions",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
        "options": {
            "queue": "locks",
            "expires": 600,  # Expire after 10 minutes if not executed
        },
    },
}
