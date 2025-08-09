from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from api.core.database import Base


class FolderTemplate(Base):
    __tablename__ = "folder_template"
    __table_args__ = (UniqueConstraint("name", "version_number", name="uq_template_name_version"),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    template_type = Column(String(50), nullable=False, default="standard")
    folder_structure = Column(JSON, nullable=False)
    permissions_template = Column(JSON)
    version = Column(Integer, nullable=False, default=1)  # Legacy field, keeping for compatibility
    version_number = Column(String(20), nullable=False, default="1.0.0")  # Semantic versioning
    status = Column(String(20), nullable=False, default="draft")  # draft|published
    parent_version_id = Column(UUID(as_uuid=True), ForeignKey("folder_template_version.id"))
    is_current = Column(Boolean, default=False, nullable=False)  # Is this the current version
    is_active = Column(Boolean, default=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("folder_template.id"))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    created_by = Column(String(255))
    updated_by = Column(String(255))


class FolderTemplateVersion(Base):
    __tablename__ = "folder_template_version"
    __table_args__ = (UniqueConstraint("template_id", "version", name="uq_template_version"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    template_id = Column(Integer, ForeignKey("folder_template.id"), nullable=False, index=True)
    version = Column(String(20), nullable=False)  # Semantic version (e.g., "1.0.0")
    content = Column(JSON, nullable=False)  # Full template snapshot
    author_id = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    change_description = Column(Text)
    parent_version_id = Column(UUID(as_uuid=True), ForeignKey("folder_template_version.id"))
    status = Column(String(20), nullable=False, default="published")  # published|archived
    folder_structure = Column(JSON, nullable=False)  # Snapshot of structure
    permissions_template = Column(JSON)  # Snapshot of permissions
