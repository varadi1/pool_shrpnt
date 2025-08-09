from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class OrderEmBase(BaseModel):
    em_number: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    contract_id: int
    partner_company_id: int
    year: int = Field(..., ge=2020, le=2100)
    part: str = Field(..., pattern="^[ABC]$")

    @field_validator("part")
    @classmethod
    def validate_part(cls, v: str) -> str:
        if v not in ["A", "B", "C"]:
            raise ValueError("part must be A, B, or C")
        return v


class OrderEmCreate(OrderEmBase):
    pass


class OrderEmUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    lock_status: str | None = Field(None, pattern="^(unlocked|locked)$")


class OrderEm(OrderEmBase):
    id: int
    team_name: str | None = None
    site_url: str | None = None
    provisioning_status: str
    provisioned_at: datetime | None = None
    lock_status: str
    locked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
    updated_by: str | None = None

    class Config:
        from_attributes = True


class OrderEmList(BaseModel):
    items: list[OrderEm]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProvisionRequest(BaseModel):
    template_id: int | None = None
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")


class ProvisionResponse(BaseModel):
    job_id: str
    status: str
    message: str
    correlation_id: str
