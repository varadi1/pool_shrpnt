from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, Column, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import synonym

from api.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_user", "user_id", "timestamp"),
        Index("ix_audit_log_correlation", "correlation_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    # Use timezone-aware column but services store naive UTC; SQLAlchemy will persist fine
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user_id = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=False)

    # Store correlation ID internally as string, expose property for UUID compatibility
    _correlation_id = Column("correlation_id", String(100), nullable=True)

    ip_address = Column(String(45))
    user_agent = Column(String(500))

    # Optional event categorization (used by notification and telemetry services)
    event_type = Column(String(100))
    actor = Column(String(255))

    # State tracking
    before_state = Column(JSON)
    after_state = Column(JSON)
    changes = Column(JSON)

    # Additional context
    success = Column(String(10), nullable=False, default="true")  # true/false/partial
    error_message = Column(Text)
    duration_ms = Column(Integer)
    extra_metadata = Column(JSON)

    # Generic structured data payloads used by different subsystems
    details = Column(JSON)
    metadata_json = Column("metadata", JSON)

    # Correlation ID property that returns UUID if parsable, otherwise raw string
    def _get_correlation_id(self):
        value = getattr(self, "_correlation_id")
        if not value:
            return value
        try:
            return UUID(value)
        except Exception:
            return value

    def _set_correlation_id(self, value):
        try:
            if isinstance(value, UUID):
                setattr(self, "_correlation_id", str(value))
                return
        except Exception:
            pass
        setattr(self, "_correlation_id", str(value) if value is not None else None)

    correlation_id = synonym(
        "_correlation_id",
        descriptor=property(_get_correlation_id, _set_correlation_id),
    )

    # Safe accessor for metadata JSON (avoid reserved attribute name)
    @property
    def metadata_dict(self):
        return self.metadata_json
