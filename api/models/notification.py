"""Notification system models."""
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.orm import relationship

from api.core.database import Base


class NotificationTemplate(Base):
    """Notification template model for different message types."""

    __tablename__ = "notification_template"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)
    template_key = Column(String(50), unique=True, nullable=False)
    channel = Column(String(20), nullable=False)  # 'email', 'teams', 'both'
    subject_template = Column(Text)  # Email subject with {{variables}}
    body_template = Column(Text, nullable=False)  # Message body with {{variables}}
    teams_card_template = Column(JSON)  # Adaptive card JSON for Teams
    locale = Column(String(10), server_default="hu-HU")
    active = Column(Boolean, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))

    # Relationships
    queue_items = relationship("NotificationQueue", back_populates="template")


class NotificationQueue(Base):
    """Queue for pending notifications."""

    __tablename__ = "notification_queue"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)
    template_id = Column(
        PostgresUUID(as_uuid=True), ForeignKey("notification_template.id"), nullable=False
    )
    recipient_email = Column(String(255))
    recipient_teams_id = Column(String(255))
    recipient_role = Column(String(50))
    channel = Column(String(20), nullable=False)  # 'email', 'teams', 'both'
    variables = Column(JSON)  # Template variables
    priority = Column(Integer, server_default="5")
    scheduled_for = Column(DateTime(timezone=True))
    status = Column(
        String(20), server_default="pending"
    )  # 'pending', 'processing', 'sent', 'failed'
    retry_count = Column(Integer, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))

    # Relationships
    template = relationship("NotificationTemplate", back_populates="queue_items")


class NotificationHistory(Base):
    """History for de-duplication tracking."""

    __tablename__ = "notification_history"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type = Column(String(50), nullable=False)
    event_id = Column(PostgresUUID(as_uuid=True))
    recipient_id = Column(PostgresUUID(as_uuid=True))
    channel = Column(String(20), nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    dedup_key = Column(String(255), nullable=False)  # For de-duplication
    content_hash = Column(String(64))  # For audit


class NotificationLog(Base):
    """Log for tracking delivery status."""

    __tablename__ = "notification_log"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)
    notification_type = Column(String(50), nullable=False)
    recipient_email = Column(String(255))
    recipient_teams_id = Column(String(255))
    channel = Column(String(20), nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    delivered_at = Column(DateTime(timezone=True))
    delivery_status = Column(
        String(20), server_default="pending"
    )  # 'pending', 'sent', 'delivered', 'failed'
    retry_count = Column(Integer, server_default="0")
    error_message = Column(Text)
    related_entity_id = Column(PostgresUUID(as_uuid=True))
    correlation_id = Column(PostgresUUID(as_uuid=True))
