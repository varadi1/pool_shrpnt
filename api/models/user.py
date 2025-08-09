"""User account model for poolDRV."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from api.core.database import Base


class UserAccount(Base):
    """User account from Azure AD."""

    __tablename__ = "user_account"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    azure_ad_id = Column(String(255), unique=True, nullable=False)  # Azure AD object ID
    user_principal_name = Column(String(255), unique=True, nullable=False)  # UPN/email
    display_name = Column(String(255), nullable=False)
    email = Column(String(255))
    department = Column(String(255))
    job_title = Column(String(255))
    is_active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=datetime.utcnow)
