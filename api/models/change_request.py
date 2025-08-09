"""Change Request model for temporary CR-based unlocks."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from api.core.database import Base


class CRStatus(str, Enum):
    """Status of a change request."""

    ACTIVE = "active"  # CR is currently active
    EXPIRED = "expired"  # CR has expired (48h elapsed)
    CLOSED = "closed"  # CR was manually closed


class CRScope(str, Enum):
    """Scope of folders affected by CR."""

    EXPERTS = "experts"  # Szakértők folders
    DELIVERABLES = "deliverables"  # Eredménytermékek folders


class ChangeRequest(Base):
    """Change Request for temporary unlock of locked folder groups."""

    __tablename__ = "change_request"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    em_id = Column(Integer, ForeignKey("order_em.id", ondelete="CASCADE"), nullable=False)
    scope = Column(String(50), nullable=False)  # CRScope enum value
    reason = Column(Text, nullable=False)
    # TODO: Re-enable FK when user_account table is properly set up
    # created_by = Column(UUID(as_uuid=True), ForeignKey("user_account.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    # TODO: Re-enable FK when user_account table is properly set up
    # closed_by = Column(UUID(as_uuid=True), ForeignKey("user_account.id"), nullable=True)
    closed_by = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String(20), nullable=False, default=CRStatus.ACTIVE)
    audit_correlation_id = Column(UUID(as_uuid=True), nullable=True)
    duration_hours = Column(Integer, nullable=False, default=48)
    updated_at = Column(DateTime(timezone=True), onupdate=datetime.utcnow)

    # Relationships - commented out for now until all models are properly set up
    # order_em = relationship("OrderEm", backref="change_requests")
    # created_by_user = relationship("UserAccount", foreign_keys=[created_by],
    #                                   backref="created_crs")
    # closed_by_user = relationship("UserAccount", foreign_keys=[closed_by],
    #                                 backref="closed_crs")
    # lock_states = relationship("LockState", back_populates="change_request")
