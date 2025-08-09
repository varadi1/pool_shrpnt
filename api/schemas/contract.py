from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, ValidationInfo, field_validator


class ContractBase(BaseModel):
    contract_number: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    start_date: datetime
    end_date: datetime | None = None
    total_value: Decimal | None = Field(None, ge=0)

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, v: datetime | None, info: ValidationInfo) -> datetime | None:
        if v and info.data.get("start_date") and v <= info.data["start_date"]:
            raise ValueError("end_date must be after start_date")
        return v


class ContractCreate(ContractBase):
    status: str = Field(default="active", pattern="^(active|inactive|expired)$")


class ContractUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    end_date: datetime | None = None
    status: str | None = Field(None, pattern="^(active|inactive|expired)$")
    total_value: Decimal | None = Field(None, ge=0)


class Contract(ContractBase):
    id: int
    status: str
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
    updated_by: str | None = None

    class Config:
        from_attributes = True


class ContractList(BaseModel):
    items: list[Contract]
    total: int
    page: int
    page_size: int
    total_pages: int
