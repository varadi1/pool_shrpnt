from celery import Celery
from celery.schedules import crontab
import os

# Get configuration from environment
CELERY_BROKER_URL = os.getenv("POOLDRV_CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.getenv("POOLDRV_CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

celery_app = app = Celery(
    "pooldrv_worker",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=[
        "worker.tasks.provisioning",
        "worker.tasks.notification_dispatcher",
        "scheduler.tasks",
    ],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3300,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    task_routes={
        "worker.tasks.provisioning.*": {"queue": "provisioning"},
        "worker.tasks.locks.*": {"queue": "locks"},
        "scheduler.tasks.lock_scheduler.*": {"queue": "locks"},
        "scheduler.*": {"queue": "locks"},
        "worker.tasks.notifications.*": {"queue": "notifications"},
        "worker.tasks.reports.*": {"queue": "reports"},
    },
    task_default_retry_delay=60,
    task_max_retries=3,
    task_default_queue="default",
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "evaluate-lock-transitions": {
            "task": "scheduler.evaluate_lock_transitions",
            "schedule": crontab(minute="*/15"),  # Every 15 minutes
            "options": {
                "queue": "locks",
                "expires": 600,  # Expire after 10 minutes if not executed
            },
        },
    },
)

if __name__ == "__main__":
    app.start()
