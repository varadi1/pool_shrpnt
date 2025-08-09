"""Guest user management models for poolDRV."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.core.database import Base


class GuestStatus(str, Enum):
    """Status of guest user invitation."""

    PENDING = "pending"
    INVITED = "invited"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"
    PURGED = "purged"  # Added for lifecycle management


class GuestUser(Base):
    """Guest user model for Azure AD B2B users."""

    __tablename__ = "guest_user"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255))
    azure_ad_id = Column(String(255), unique=True, index=True)  # Set after invitation accepted
    partner_company_id = Column(Integer, ForeignKey("partner_company.id"), nullable=False)
    status = Column(SQLEnum(GuestStatus), nullable=False, default=GuestStatus.PENDING)
    invited_at = Column(DateTime(timezone=True))
    accepted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    created_by = Column(String(255))  # User who invited the guest
    
    # Lifecycle fields
    expires_at = Column(DateTime(timezone=True))  # When guest access expires
    extended_count = Column(Integer, default=0)  # Number of times access was extended
    last_extended_at = Column(DateTime(timezone=True))  # Last extension timestamp
    revoked_at = Column(DateTime(timezone=True))  # When access was revoked
    revoked_by = Column(String(255))  # User who revoked access
    revocation_reason = Column(Text)  # Reason for revocation

    # Relationships
    partner_company = relationship("PartnerCompany", backref="guest_users")
    invitations = relationship(
        "GuestInvitation", back_populates="guest_user", cascade="all, delete-orphan"
    )
    group_assignments = relationship(
        "GuestGroupAssignment", back_populates="guest_user", cascade="all, delete-orphan"
    )


class GuestInvitation(Base):
    """Track individual invitation attempts for a guest user."""

    __tablename__ = "guest_invitation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    guest_user_id = Column(UUID(as_uuid=True), ForeignKey("guest_user.id"), nullable=False)
    invitation_id = Column(String(255), unique=True, index=True)  # Azure AD invitation ID
    sent_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(50), nullable=False, default="pending")  # pending, accepted, expired
    redeem_url = Column(Text)  # Azure AD invitation redeem URL
    error_details = Column(Text)  # Store error details if invitation fails
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    guest_user = relationship("GuestUser", back_populates="invitations")


class GuestGroupAssignment(Base):
    """Track Azure AD group assignments for guest users."""

    __tablename__ = "guest_group_assignment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    guest_user_id = Column(UUID(as_uuid=True), ForeignKey("guest_user.id"), nullable=False)
    group_id = Column(UUID(as_uuid=True), ForeignKey("group.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    assigned_by = Column(String(255), nullable=False)  # User who assigned the guest to group
    removed_at = Column(DateTime(timezone=True))  # Track when guest was removed from group
    removed_by = Column(String(255))

    # Relationships
    guest_user = relationship("GuestUser", back_populates="group_assignments")
    group = relationship("Group", backref="guest_assignments")


class GuestExtension(Base):
    """Track guest access extensions with justification."""

    __tablename__ = "guest_extension"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    guest_user_id = Column(UUID(as_uuid=True), ForeignKey("guest_user.id"), nullable=False)
    extended_by = Column(String(255), nullable=False)  # User who extended access
    extended_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    previous_expiry_date = Column(DateTime(timezone=True), nullable=False)
    new_expiry_date = Column(DateTime(timezone=True), nullable=False)
    justification = Column(Text, nullable=False)  # Reason for extension
    
    # Relationships
    guest_user = relationship("GuestUser", backref="extensions")


class GuestLifecyclePolicy(Base):
    """Define lifecycle policies per partner company."""

    __tablename__ = "guest_lifecycle_policy"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    partner_company_id = Column(Integer, ForeignKey("partner_company.id"), unique=True, nullable=False)
    default_expiry_days = Column(Integer, nullable=False, default=90)  # Default guest expiry in days
    max_extensions = Column(Integer, nullable=False, default=3)  # Maximum number of extensions allowed
    extension_period_days = Column(Integer, nullable=False, default=90)  # Days per extension
    auto_expire_enabled = Column(Boolean, default=True)  # Whether to auto-expire guests
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    
    # Relationships
    partner_company = relationship("PartnerCompany", backref="lifecycle_policy")
