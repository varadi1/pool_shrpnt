from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TemplateVersionBase(BaseModel):
    """Base schema for template versions."""

    version: str = Field(
        ..., pattern=r"^\d+\.\d+\.\d+$", description="Semantic version (e.g., 1.0.0)"
    )
    change_description: str | None = None
    folder_structure: dict[str, Any]
    permissions_template: dict[str, Any] | None = None


class TemplateVersionResponse(TemplateVersionBase):
    """Response schema for template version."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_id: int
    content: dict[str, Any]
    author_id: str
    created_at: datetime
    parent_version_id: UUID | None = None
    status: str


class TemplateVersionList(BaseModel):
    """List of template versions."""

    versions: list[TemplateVersionResponse]
    total: int
    page: int
    page_size: int


class TemplatePublishRequest(BaseModel):
    """Request to publish a template."""

    change_description: str | None = Field(
        None, description="Description of changes in this version"
    )
    version_type: str = Field(
        "patch", pattern="^(major|minor|patch)$", description="Type of version increment"
    )


class TemplateRollbackRequest(BaseModel):
    """Request to rollback a template."""

    target_version: str = Field(
        ..., pattern=r"^\d+\.\d+\.\d+$", description="Version to rollback to"
    )
    rollback_reason: str = Field(..., min_length=1, description="Reason for rollback")


class TemplateDiffRequest(BaseModel):
    """Request to get diff between versions."""

    from_version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    to_version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    output_format: str = Field("json", pattern="^(json|text)$")


class TemplateDiffResponse(BaseModel):
    """Response for template diff."""

    from_version: str
    to_version: str
    folder_structure: dict[str, Any]
    permissions: dict[str, Any]
    metadata: dict[str, Any]
    summary: dict[str, int]


class TemplateRollbackValidation(BaseModel):
    """Validation result for rollback."""

    valid: bool
    reason: str | None = None
    warning: str | None = None
    provisioned_ems: int | None = None
