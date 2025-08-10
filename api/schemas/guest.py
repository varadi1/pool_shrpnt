"""Pydantic schemas for guest user management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from api.models.guest import GuestStatus


class GuestInviteRequest(BaseModel):
    """Request model for inviting a guest user."""

    email: EmailStr = Field(..., description="Guest user email address")
    partner_company_id: int = Field(..., description="Partner company ID")
    display_name: str | None = Field(None, description="Guest display name")
    role: str = Field("partner_viewer", description="Guest role for group assignment")
    send_notification: bool = Field(True, description="Whether to send invitation email")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        """Validate guest role."""
        allowed_roles = ["partner_expert", "partner_admin", "partner_viewer", "neu_pm"]
        if v not in allowed_roles:
            raise ValueError(f"Role must be one of: {', '.join(allowed_roles)}")
        return v


class GuestGroupUpdateRequest(BaseModel):
    """Request model for updating guest group assignments."""

    group_ids: list[UUID] = Field(..., description="List of group IDs to assign")


class GuestSearchParams(BaseModel):
    """Query parameters for searching guests."""

    email: str | None = Field(None, description="Email pattern to search")
    partner_company_id: int | None = Field(None, description="Filter by partner company")
    status: GuestStatus | None = Field(None, description="Filter by status")
    include_expired: bool = Field(False, description="Include expired invitations")


class GuestInvitationInfo(BaseModel):
    """Information about a guest invitation."""

    id: UUID
    invitation_id: str | None
    sent_at: datetime
    expires_at: datetime
    status: str
    redeem_url: str | None


class GuestGroupInfo(BaseModel):
    """Information about a guest group assignment."""

    group_id: UUID
    display_name: str
    assigned_at: datetime
    assigned_by: str


class GuestResponse(BaseModel):
    """Response model for guest user details."""

    id: UUID
    email: str
    display_name: str | None
    azure_ad_id: str | None
    partner_company_id: int
    partner_company_name: str | None
    status: GuestStatus
    invited_at: datetime | None
    accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    created_by: str | None
    invitations: list[GuestInvitationInfo] = []
    groups: list[GuestGroupInfo] = []

    class Config:
        from_attributes = True


class GuestListResponse(BaseModel):
    """Response model for listing guest users."""

    guests: list[GuestResponse]
    total: int
    page: int = 1
    page_size: int = 20


class GuestStatusResponse(BaseModel):
    """Response model for guest invitation status."""

    email: str
    status: str
    guest_status: GuestStatus
    invitation_id: str | None
    expires_at: datetime | None
    message: str


class GuestRevocationRequest(BaseModel):
    """Request model for revoking a guest user."""

    reason: str = Field(..., min_length=1, max_length=500, description="Reason for revocation")


class BulkRevocationRequest(BaseModel):
    """Request model for bulk guest revocation."""

    guest_ids: list[UUID] = Field(..., min_items=1, description="List of guest IDs to revoke")
    reason: str = Field(..., min_length=1, max_length=500, description="Reason for revocation")


class BulkRevocationResponse(BaseModel):
    """Response model for bulk revocation operation."""

    total: int
    succeeded: list[dict]
    failed: list[dict]
    correlation_id: str


class RevokedGuestResponse(BaseModel):
    """Response model for revoked guest details."""

    id: UUID
    email: str
    display_name: str | None
    partner_company_id: int
    partner_company_name: str | None
    status: GuestStatus
    revoked_at: datetime | None
    revoked_by: str | None
    revocation_reason: str | None
    created_at: datetime
    expires_at: datetime | None

    class Config:
        from_attributes = True


class RevokedGuestsListResponse(BaseModel):
    """Response model for listing revoked guests."""

    guests: list[RevokedGuestResponse]
    total: int
    page: int = 1
    page_size: int = 20


class GuestExtensionRequest(BaseModel):
    """Request model for extending guest access."""

    justification: str = Field(
        ..., min_length=1, max_length=1000, description="Justification for extension"
    )
    extension_days: int | None = Field(
        None, ge=1, le=365, description="Days to extend (uses policy default if not specified)"
    )


class GuestExtensionResponse(BaseModel):
    """Response model for guest extension."""

    id: UUID
    email: str
    display_name: str | None
    previous_expiry_date: datetime
    new_expiry_date: datetime
    extension_count: int
    max_extensions: int
    justification: str
    extended_by: str
    extended_at: datetime

    class Config:
        from_attributes = True


class ExpiringGuestResponse(BaseModel):
    """Response model for expiring guest details."""

    id: UUID
    email: str
    display_name: str | None
    partner_company_id: int
    partner_company_name: str | None
    expires_at: datetime
    days_until_expiry: int
    extended_count: int
    can_extend: bool
    created_by: str | None

    class Config:
        from_attributes = True


class ExpiringGuestsListResponse(BaseModel):
    """Response model for listing expiring guests."""

    guests: list[ExpiringGuestResponse]
    total: int
    page: int = 1
    page_size: int = 20


class ExtensionHistoryItem(BaseModel):
    """Response model for extension history item."""

    id: UUID
    extended_by: str
    extended_at: datetime
    previous_expiry_date: datetime
    new_expiry_date: datetime
    justification: str

    class Config:
        from_attributes = True


class ExtensionHistoryResponse(BaseModel):
    """Response model for guest extension history."""

    guest_id: UUID
    guest_email: str
    extensions: list[ExtensionHistoryItem]
    total_extensions: int


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    message: str
    correlation_id: str | None
    details: dict | None = None
