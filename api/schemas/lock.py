"""Pydantic schemas for lock management."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class LockRuleCreate(BaseModel):
    """Schema for creating a lock rule."""

    rule_name: str = Field(..., description="Name for the lock rule")
    t_value: datetime = Field(..., description="T+0 reference date")
    window_type: str = Field(..., description="Type of lock window")
    start_offset: int = Field(..., description="Days relative to T (can be negative)")
    end_offset: int = Field(..., description="Days relative to T")
    permission_level: str = Field(..., description="Permission level for the window")
    created_by: str = Field(..., description="User creating the rule")


class LockRuleUpdate(BaseModel):
    """Schema for updating a lock rule."""

    rule_name: str | None = None
    t_value: datetime | None = None
    window_type: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    permission_level: str | None = None
    is_active: bool | None = None


class LockRuleResponse(BaseModel):
    """Response schema for lock rule."""

    id: UUID
    order_em_id: int
    rule_name: str
    t_value: datetime
    window_type: str
    start_offset: int
    end_offset: int
    permission_level: str
    is_active: bool
    created_by: str
    created_at: datetime
    updated_at: datetime | None

    class Config:
        from_attributes = True


class LockStateResponse(BaseModel):
    """Response schema for lock state."""

    id: UUID
    order_em_id: int
    folder_path: str
    current_state: str
    permission_level: str
    locked_until: datetime | None
    locked_at: datetime | None
    locked_by_rule_id: UUID | None
    is_manual_override: bool
    override_reason: str | None
    created_at: datetime
    updated_at: datetime | None

    class Config:
        from_attributes = True


class ManualLockRequest(BaseModel):
    """Request schema for manual lock."""

    folder_path: str = Field(..., description="SharePoint folder path")
    folder_id: UUID = Field(..., description="Folder identifier")
    reason: str = Field(..., description="Reason for locking")
    expires_in_hours: int | None = Field(None, description="Optional expiration time in hours")


class LockResponse(BaseModel):
    """Response schema for lock."""

    lock_id: UUID
    folder_id: UUID
    folder_path: str
    lock_type: str
    locked_by: UUID
    locked_at: datetime
    lock_reason: str
    expires_at: datetime | None
    is_active: bool

    class Config:
        from_attributes = True


class ManualOverrideRequest(BaseModel):
    """Request schema for manual override."""

    order_em_id: int = Field(..., description="Order/EM identifier")
    folder_path: str = Field(..., description="Path to the folder")
    override_state: str = Field(..., description="Override lock state")
    override_permission: str = Field(..., description="Override permission level")
    override_reason: str = Field(..., description="Reason for override")
    override_by: str = Field(..., description="User applying override")


class HourlyMetric(BaseModel):
    """Hourly metric data."""

    hour: str
    success: int
    failure: int


class LockStateDistribution(BaseModel):
    """Lock state distribution."""

    state: str
    count: int


class LatencyMetrics(BaseModel):
    """Latency metrics."""

    avg_ms: float
    max_ms: float
    min_ms: float
    sample_size: int


class CurrentHourMetrics(BaseModel):
    """Current hour metrics."""

    success_count: int
    failure_count: int
    success_rate: float
    avg_duration_ms: float


class MetricsResponse(BaseModel):
    """Response schema for metrics."""

    timestamp: str
    current_hour: CurrentHourMetrics
    hourly_trend: list[HourlyMetric]
    lock_state_distribution: list[LockStateDistribution]
    active_rules: int
    recent_failures: list[dict[str, Any]]
    evaluation_latency: LatencyMetrics | None = None
    health_status: dict[str, Any] | None = None


class ManualLockOperationRequest(BaseModel):
    """Request schema for manual lock operations."""

    em_id: int = Field(..., description="Order/EM identifier", alias="emId")
    scope: str = Field(..., description="Folder scope: 'experts' or 'deliverables'")
    action: str = Field(..., description="Action: 'lock' or 'unlock'")
    reason: str = Field(..., min_length=10, description="Reason for the action (min 10 chars)")

    class Config:
        populate_by_name = True


class ManualLockOperationResponse(BaseModel):
    """Response schema for manual lock operations."""

    success: bool
    correlation_id: str = Field(..., alias="correlationId")
    applied_at: str = Field(..., alias="appliedAt")
    message: str
    affected_folders: list[dict[str, Any]] = Field(..., alias="affectedFolders")

    class Config:
        populate_by_name = True


class LockStateStatusResponse(BaseModel):
    """Response schema for lock state status."""

    em_id: int = Field(..., alias="emId")
    scope: str
    states: list[dict[str, Any]]

    class Config:
        populate_by_name = True
