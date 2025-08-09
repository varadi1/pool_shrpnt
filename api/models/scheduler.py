"""Scheduler run tracking model."""

from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from api.core.database import Base


class SchedulerRun(Base):
    """Track scheduler execution runs for monitoring and auditing."""

    __tablename__ = "scheduler_run"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    run_type = Column(String(50), nullable=False)  # 'lock_evaluation'
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    ems_processed = Column(Integer)
    ems_failed = Column(Integer)
    status = Column(String(20), nullable=False)  # 'running', 'completed', 'failed'
    error_message = Column(Text)
    lock_id = Column(String(100))  # distributed lock identifier
    worker_id = Column(String(100))
