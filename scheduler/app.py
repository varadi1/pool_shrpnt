import os
from celery import Celery
from celery.schedules import crontab

# Set default Django settings module for Celery
os.environ.setdefault("POOLDRV_ENV", "development")

# Create Celery app
app = Celery("pooldrv_scheduler")

# Configure Celery
app.conf.update(
    broker_url=os.getenv("POOLDRV_REDIS_URL", "redis://localhost:6379/0"),
    result_backend=os.getenv("POOLDRV_REDIS_URL", "redis://localhost:6379/0"),
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes hard limit
    task_soft_time_limit=540,  # 9 minutes soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    broker_connection_retry_on_startup=True,
)

# Autodiscover tasks
app.autodiscover_tasks(["scheduler.tasks"])

# Beat schedule will be configured in individual task modules