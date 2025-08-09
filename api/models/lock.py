"""Lock rule and state models for time-based access control."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.core.database import Base


class LockWindowType(str, Enum):
    """Types of lock time windows."""

    PRE_RELEASE = "pre_release"  # T-3 to T-1
    ACTIVE = "active"  # T+0 to T+7
    LIMITED = "limited"  # Transitional state
    LOCKED = "locked"  # T+8 onwards


class LockType(str, Enum):
    """Types of locks."""

    MANUAL = "manual"  # Manual lock by PM
    AUTOMATIC = "automatic"  # Automatic time-based lock


class PermissionLevel(str, Enum):
    """Permission levels for lock states."""

    FULL = "full"  # Read, write, delete
    WRITE = "write"  # Read and write only
    READ = "read"  # Read only


class LockRule(Base):
    """Time-based lock rule configuration for an order/EM."""

    __tablename__ = "lock_rule"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    order_em_id = Column(Integer, ForeignKey("order_em.id"), nullable=False)
    rule_name = Column(String(100), nullable=False)
    t_value = Column(DateTime(timezone=True), nullable=False)  # T+0 reference date
    window_type = Column(String(50), nullable=False)  # LockWindowType enum value
    start_offset = Column(Integer, nullable=False)  # Days relative to T (can be negative)
    end_offset = Column(Integer, nullable=False)  # Days relative to T
    permission_level = Column(String(20), nullable=False)  # PermissionLevel enum value
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(String(255), nullable=False)  # User identifier from Azure AD
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=datetime.utcnow)

    # Relationships
    order_em = relationship("OrderEm", back_populates="lock_rules")
    transitions = relationship("LockTransitionLog", back_populates="lock_rule")


class LockState(Base):
    """Current lock state for a folder or resource."""

    __tablename__ = "lock_state"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    order_em_id = Column(
        Integer, ForeignKey("order_em.id"), nullable=True
    )  # Optional for manual locks
    folder_id = Column(UUID(as_uuid=True), nullable=False)
    folder_path = Column(Text, nullable=False)
    current_state = Column(String(50))  # LockWindowType value (optional for manual)
    permission_level = Column(String(20))  # PermissionLevel value (optional for manual)
    locked_until = Column(DateTime(timezone=True))  # When lock expires (if applicable)
    locked_at = Column(DateTime(timezone=True))  # When lock was applied
    locked_by = Column(UUID(as_uuid=True))  # User who locked (for manual locks)
    locked_by_rule_id = Column(UUID(as_uuid=True), ForeignKey("lock_rule.id"))
    lock_type = Column(String(20), nullable=False, default="automatic")  # LockType enum
    lock_reason = Column(Text)  # Reason for manual lock
    expires_at = Column(DateTime(timezone=True))  # Expiration for manual locks
    is_active = Column(Boolean, default=True, nullable=False)
    is_manual_override = Column(Boolean, default=False, nullable=False)
    override_reason = Column(Text)
    removed_at = Column(DateTime(timezone=True))  # When lock was removed
    removed_by = Column(UUID(as_uuid=True))  # User who removed lock
    removal_reason = Column(Text)  # Reason for removal
    last_extended_at = Column(DateTime(timezone=True))  # Last extension time
    last_extended_by = Column(UUID(as_uuid=True))  # User who last extended
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=datetime.utcnow)

    # CR-specific fields
    cr_id = Column(UUID(as_uuid=True), ForeignKey("change_request.id", ondelete="SET NULL"))
    cr_expires_at = Column(DateTime(timezone=True))  # When CR expires
    cr_reason = Column(Text)  # CR reason copied for quick reference

    # Relationships
    order_em = relationship("OrderEm", back_populates="lock_states")
    locked_by_rule = relationship("LockRule")
    # change_request = relationship("ChangeRequest", back_populates="lock_states")


class LockTransitionLog(Base):
    """Audit log of lock state transitions."""

    __tablename__ = "lock_transition_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lock_rule_id = Column(UUID(as_uuid=True), ForeignKey("lock_rule.id"))
    order_em_id = Column(Integer, ForeignKey("order_em.id"), nullable=False)
    folder_path = Column(Text, nullable=False)
    previous_state = Column(String(50))  # LockWindowType value
    new_state = Column(String(50), nullable=False)  # LockWindowType value
    previous_permission = Column(String(20))  # PermissionLevel value
    new_permission = Column(String(20), nullable=False)  # PermissionLevel value
    transition_reason = Column(Text)
    transitioned_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    evaluation_run_id = Column(UUID(as_uuid=True))  # Links transitions in same evaluation
    success = Column(Boolean, nullable=False)
    error_message = Column(Text)
    correlation_id = Column(String(100))

    # Relationships
    lock_rule = relationship("LockRule", back_populates="transitions")
    order_em = relationship("OrderEm")


class LockRuleTemplate(Base):
    """Pre-configured lock rule templates for common patterns."""

    __tablename__ = "lock_rule_template"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    template_name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    rules_config = Column(Text, nullable=False)  # JSON configuration
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=datetime.utcnow)
