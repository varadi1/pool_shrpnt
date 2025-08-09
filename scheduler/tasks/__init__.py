"""Scheduler tasks package."""

from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(name="scheduler.evaluate_lock_transitions")
def evaluate_lock_transitions():
    """Evaluate and apply lock state transitions every 15 minutes."""
    logger.info("Starting lock transition evaluation...")
    # This will be implemented by the actual lock evaluator
    from scheduler.tasks.lock_evaluator import LockEvaluator
    evaluator = LockEvaluator()
    return evaluator.evaluate_all_locks()

# Import guest status checker task
from scheduler.tasks.guest_status_checker import check_guest_status

# Export tasks
__all__ = ["evaluate_lock_transitions", "check_guest_status"]