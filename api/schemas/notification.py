"""Pydantic schemas for notification endpoints."""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class NotificationTestRequest(BaseModel):
    """Request model for test notifications."""

    template_key: str = Field(..., description="Template to use for test")
    recipient_email: EmailStr | None = Field(None, description="Email recipient")
    recipient_teams_id: str | None = Field(None, description="Teams recipient ID")
    variables: dict[str, Any] | None = Field(default_factory=dict, description="Template variables")

    class Config:
        json_schema_extra = {
            "example": {
                "template_key": "test.notification",
                "recipient_email": "test@example.com",
                "variables": {"message": "Test message"},
            }
        }


class TemplateUpdateRequest(BaseModel):
    """Request model for template updates."""

    subject_template: str | None = Field(None, description="Email subject template")
    body_template: str | None = Field(None, description="Message body template")
    teams_card_template: dict[str, Any] | None = Field(None, description="Teams adaptive card")
    active: bool | None = Field(None, description="Whether template is active")

    class Config:
        json_schema_extra = {
            "example": {
                "subject_template": "{{em_name}} - Deadline Reminder",
                "body_template": "Your deadline is {{deadline}}",
                "active": True,
            }
        }


class NotificationWebhookRequest(BaseModel):
    """Request model for delivery webhooks."""

    source: str = Field(..., description="Webhook source (graph/teams)")
    data: dict[str, Any] = Field(..., description="Webhook payload")
    signature: str | None = Field(None, description="Webhook signature for validation")

    class Config:
        json_schema_extra = {
            "example": {
                "source": "graph",
                "data": {
                    "messageId": "123e4567-e89b-12d3-a456-426614174000",
                    "status": "delivered",
                },
            }
        }


class DeliveryMetricsResponse(BaseModel):
    """Response model for delivery metrics."""

    period_hours: int
    overall_metrics: dict[str, Any]
    channel_metrics: dict[str, dict[str, Any]] | None
    performance_metrics: dict[str, Any]
    failure_analysis: dict[str, Any]

    class Config:
        json_schema_extra = {
            "example": {
                "period_hours": 24,
                "overall_metrics": {
                    "total_notifications": 100,
                    "delivered": 98,
                    "failed": 2,
                    "success_rate": 98.0,
                    "sla_met": True,
                },
                "channel_metrics": {
                    "email": {"success_rate": 99.0},
                    "teams": {"success_rate": 97.0},
                },
                "performance_metrics": {
                    "avg_delivery_time_seconds": 2.5,
                    "p95_delivery_time_seconds": 5.0,
                },
                "failure_analysis": {
                    "total_failures": 2,
                    "most_common_error": "timeout",
                },
            }
        }


class NotificationQueueResponse(BaseModel):
    """Response model for notification queue status."""

    id: UUID
    template_key: str
    recipient: str
    channel: str
    status: str
    priority: int
    retry_count: int
    scheduled_for: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationTemplateResponse(BaseModel):
    """Response model for notification templates."""

    id: UUID
    template_key: str
    channel: str
    subject_template: str | None
    body_template: str
    teams_card_template: dict[str, Any] | None
    locale: str
    active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuditTrailEntry(BaseModel):
    """Response model for audit trail entries."""

    event_type: str
    action: str
    actor: str
    metadata: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class SLAMetricsResponse(BaseModel):
    """Response model for SLA metrics."""

    sla_threshold: float
    current_period_hours: int
    overall_sla_met: bool
    overall_success_rate: float
    time_windows: dict[str, dict[str, Any]]
    alert_triggered: bool

    class Config:
        json_schema_extra = {
            "example": {
                "sla_threshold": 98.0,
                "current_period_hours": 24,
                "overall_sla_met": True,
                "overall_success_rate": 98.5,
                "time_windows": {
                    "1h": {"success_rate": 100.0, "sla_met": True},
                    "4h": {"success_rate": 99.0, "sla_met": True},
                    "24h": {"success_rate": 98.5, "sla_met": True},
                },
                "alert_triggered": False,
            }
        }
