from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Index, Integer, String, Text

from api.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_user", "user_id", "timestamp"),
        Index("ix_audit_log_correlation", "correlation_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    user_id = Column(String(255), nullable=False)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=False)
    correlation_id = Column(String(100), nullable=False)
    ip_address = Column(String(45))
    user_agent = Column(String(500))

    # State tracking
    before_state = Column(JSON)
    after_state = Column(JSON)
    changes = Column(JSON)

    # Additional context
    success = Column(String(10), nullable=False, default="true")  # true/false/partial
    error_message = Column(Text)
    duration_ms = Column(Integer)
    extra_metadata = Column(JSON)
