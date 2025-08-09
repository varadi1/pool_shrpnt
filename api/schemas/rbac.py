"""RBAC schemas for request/response validation."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class PermissionLevel(str, Enum):
    """Permission levels supported by the system."""

    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    MANAGE = "manage"


class FolderType(str, Enum):
    """Types of folders with different permission rules."""

    STANDARD = "standard"
    FINANCIAL = "financial"
    NEU_ONLY = "neu_only"
    FINAL = "final"
    PARTNER_SPECIFIC = "partner_specific"


class RoleName(str, Enum):
    """System role names."""

    NEU_ADMIN = "NEU_Admin"
    NEU_PM = "NEU_PM"
    PARTNER_ADMIN = "Partner_Admin"
    EXPERT = "Expert"
    NEU_QA = "NEU_QA"
    PENZUGYES = "Pénzügyes"


class RoleBase(BaseModel):
    """Base schema for roles."""

    name: RoleName
    description: str | None = None
    priority: int = Field(default=0, ge=0, le=100)


class RoleCreate(RoleBase):
    """Schema for creating a role."""

    pass


class RoleResponse(RoleBase):
    """Response schema for role."""

    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PermissionRuleBase(BaseModel):
    """Base schema for permission rules."""

    role_id: UUID
    folder_type: FolderType
    permission_level: PermissionLevel
    applies_to_pattern: str | None = None


class PermissionRuleCreate(PermissionRuleBase):
    """Schema for creating permission rule."""

    pass


class PermissionRuleResponse(PermissionRuleBase):
    """Response schema for permission rule."""

    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PermissionExceptionBase(BaseModel):
    """Base schema for permission exceptions."""

    folder_path: str
    role_id: UUID
    permission_override: PermissionLevel
    reason: str | None = None
    expires_at: datetime | None = None


class PermissionExceptionCreate(PermissionExceptionBase):
    """Schema for creating permission exception."""

    created_by: str


class PermissionExceptionResponse(PermissionExceptionBase):
    """Response schema for permission exception."""

    id: UUID
    created_at: datetime
    created_by: str | None = None

    class Config:
        from_attributes = True


class EffectivePermission(BaseModel):
    """Calculated effective permission for a role on a folder."""

    folder_path: str
    role_id: UUID
    role_name: RoleName
    permission_level: PermissionLevel
    source: str
    inheritance_broken: bool = False
    exception_applied: bool = False
    exception_reason: str | None = None


class PermissionCalculationRequest(BaseModel):
    """Request for calculating permissions."""

    folder_path: str
    user_id: str | None = None
    role_ids: list[UUID] | None = None
    include_inherited: bool = True


class PermissionCalculationResponse(BaseModel):
    """Response with calculated permissions."""

    folder_path: str
    effective_permissions: list[EffectivePermission]
    folder_type: FolderType
    inheritance_broken: bool
    calculation_timestamp: datetime


class PermissionDrift(BaseModel):
    """Mismatch between desired and actual permissions."""

    folder_path: str
    role_name: RoleName
    desired_permission: PermissionLevel | None
    actual_permission: PermissionLevel | None
    action_required: str
    detected_at: datetime


class ReconciliationReport(BaseModel):
    """Permission reconciliation report."""

    scan_id: UUID
    scanned_at: datetime
    total_folders: int
    folders_checked: int
    drifts_detected: int
    drifts: list[PermissionDrift]
    remediation_required: bool
