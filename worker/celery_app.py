"""Celery application configuration for poolDRV workers."""

from celery import Celery
from celery.schedules import crontab

from api.core.config import settings

# Create Celery app
app = Celery(
    "pooldrv_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "worker.tasks.provisioning",
        "worker.tasks.lock_cleanup",
        "worker.tasks.permission_sync",
        "worker.tasks.reconciliation",
    ],
)

# Celery configuration
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Task execution settings
    task_soft_time_limit=300,  # 5 minutes soft limit
    task_time_limit=600,  # 10 minutes hard limit
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    # Rate limiting for Graph API calls
    task_annotations={
        "worker.tasks.permission_sync.*": {
            "rate_limit": "100/m",  # Max 100 Graph API calls per minute
        },
    },
)

# Beat schedule for periodic tasks
app.conf.beat_schedule = {
    # Lock cleanup - runs every hour
    "cleanup-expired-locks-hourly": {
        "task": "worker.tasks.lock_cleanup.cleanup_expired_locks",
        "schedule": settings.lock_cleanup_interval_seconds,
        "options": {
            "expires": settings.lock_cleanup_interval_seconds / 2,
            "priority": 5,
        },
    },
    # Lock cleanup - daily safety run at 2 AM
    "cleanup-expired-locks-daily": {
        "task": "worker.tasks.lock_cleanup.cleanup_expired_locks",
        "schedule": crontab(hour=2, minute=0),
        "options": {
            "priority": 3,
        },
    },
    # Permission reconciliation - runs every 6 hours
    "reconcile-permissions": {
        "task": "worker.tasks.reconciliation.reconcile_all_permissions",
        "schedule": crontab(minute=0, hour="*/6"),
        "options": {
            "priority": 4,
        },
    },
    # Lock evaluation - runs every 5 minutes
    "evaluate-lock-transitions": {
        "task": "worker.tasks.lock_scheduler.evaluate_lock_transitions",
        "schedule": 300,  # 5 minutes
        "options": {
            "expires": 240,  # Expire after 4 minutes if not run
            "priority": 6,
        },
    },
}

# Task routing
app.conf.task_routes = {
    "worker.tasks.provisioning.*": {"queue": "provisioning"},
    "worker.tasks.lock_cleanup.*": {"queue": "maintenance"},
    "worker.tasks.permission_sync.*": {"queue": "permissions"},
    "worker.tasks.reconciliation.*": {"queue": "permissions"},
    "worker.tasks.lock_scheduler.*": {"queue": "locks"},
}

if __name__ == "__main__":
    app.start()
