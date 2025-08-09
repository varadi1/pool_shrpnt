from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class JobStatus(BaseModel):
    job_id: str
    status: str = Field(..., pattern="^(pending|in_progress|completed|failed|cancelled)$")
    phase: str | None = Field(
        None,
        pattern="^(validating|creating_team|creating_folders|applying_permissions|completed|failed)$",
    )
    progress: int = Field(ge=0, le=100, default=0)
    message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    estimated_completion: datetime | None = None
    error: str | None = None
    details: dict[str, Any] | None = None
    correlation_id: str


class JobResult(BaseModel):
    job_id: str
    status: str
    result: dict[str, Any] | None = None
    error: str | None = None
    completed_at: datetime
    duration_seconds: float
    correlation_id: str
