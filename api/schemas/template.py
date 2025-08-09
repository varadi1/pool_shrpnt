from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FolderTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    template_type: str = Field(default="standard", max_length=50)
    folder_structure: dict[str, Any]
    permissions_template: dict[str, Any] | None = None
    parent_id: int | None = None


class FolderTemplateCreate(FolderTemplateBase):
    pass


class FolderTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    template_type: str | None = Field(None, max_length=50)
    folder_structure: dict[str, Any] | None = None
    permissions_template: dict[str, Any] | None = None
    parent_id: int | None = None
    is_active: bool | None = None


class FolderTemplateResponse(FolderTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int  # Legacy field
    version_number: str = Field(default="1.0.0", pattern=r"^\d+\.\d+\.\d+$")
    status: str = Field(default="draft", pattern="^(draft|published)$")
    parent_version_id: UUID | None = None
    is_current: bool = False
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
    updated_by: str | None = None


class FolderTemplateList(BaseModel):
    templates: list[FolderTemplateResponse]
    total: int
    page: int
    page_size: int
