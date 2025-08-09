from datetime import datetime

from sqlalchemy import Column, DateTime, Index, Integer, String, Text

from api.core.database import Base


class IdempotentOperation(Base):
    __tablename__ = "idempotent_operation"

    id = Column(Integer, primary_key=True, index=True)
    idempotency_key = Column(String(255), unique=True, nullable=False, index=True)
    em_id = Column(String(50), nullable=False)
    operation = Column(String(50), nullable=False)
    scope = Column(String(255), nullable=False)
    timestamp_window = Column(DateTime(timezone=True), nullable=False)
    result = Column(Text)
    status = Column(String(50), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "ix_idempotent_operation_composite", "em_id", "operation", "scope", "timestamp_window"
        ),
    )
