"""RBAC (Role-Based Access Control) models for poolDRV."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.core.database import Base


class Role(Base):
    """Role definitions for the system."""

    __tablename__ = "role"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(Text)
    priority = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    permission_rules = relationship("PermissionRule", back_populates="role")
    permission_exceptions = relationship("PermissionException", back_populates="role")
    group_role_mappings = relationship("GroupRoleMapping", back_populates="role")


class Group(Base):
    """Azure AD group mappings."""

    __tablename__ = "group"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    azure_ad_group_id = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    memberships = relationship("Membership", back_populates="group")
    group_role_mappings = relationship("GroupRoleMapping", back_populates="group")


class GroupRoleMapping(Base):
    """Mapping between Azure AD groups and application roles."""

    __tablename__ = "group_role_mapping"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("group.id"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("role.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    created_by = Column(String(255))

    group = relationship("Group", back_populates="group_role_mappings")
    role = relationship("Role", back_populates="group_role_mappings")

    __table_args__ = (UniqueConstraint("group_id", "role_id"),)


class Membership(Base):
    """User-group relationships from Azure AD."""

    __tablename__ = "membership"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False)
    group_id = Column(UUID(as_uuid=True), ForeignKey("group.id"), nullable=False)
    user_principal_name = Column(String(255))
    display_name = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    group = relationship("Group", back_populates="memberships")

    __table_args__ = (UniqueConstraint("user_id", "group_id"),)


class PermissionRule(Base):
    """Matrix rules for role-folder type permission mappings."""

    __tablename__ = "permission_rule"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id = Column(UUID(as_uuid=True), ForeignKey("role.id"), nullable=False)
    folder_type = Column(String(50), nullable=False)
    permission_level = Column(String(20), nullable=False)
    applies_to_pattern = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    role = relationship("Role", back_populates="permission_rules")

    __table_args__ = (UniqueConstraint("role_id", "folder_type", "permission_level"),)


class PermissionException(Base):
    """Special case overrides for specific folders."""

    __tablename__ = "permission_exception"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_path = Column(Text, nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("role.id"), nullable=False)
    permission_override = Column(String(20), nullable=False)
    reason = Column(Text)
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    created_by = Column(String(255))

    role = relationship("Role", back_populates="permission_exceptions")


class PermissionAssignment(Base):
    """Desired permissions state for folders."""

    __tablename__ = "permission_assignment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_path = Column(Text, nullable=False)
    resource_path = Column(Text, nullable=False)  # SharePoint folder path
    resource_id = Column(String(255))  # SharePoint site ID
    resource_type = Column(String(50), default="sharepoint_folder")  # Resource type
    role_id = Column(UUID(as_uuid=True), ForeignKey("role.id"), nullable=False)
    granted_to_id = Column(String(255))  # User or group ID
    granted_to_type = Column(String(20))  # user or group
    permission_level = Column(String(20), nullable=False)
    permission_type = Column(String(20))  # Permission type for SharePoint
    inheritance_broken = Column(Boolean, default=False, nullable=False)
    requires_unique_permissions = Column(Boolean, default=False)
    source = Column(String(50))
    sharepoint_sync_status = Column(String(20))  # pending, syncing, synced, failed, needs_update
    last_sync_at = Column(DateTime(timezone=True))
    sync_error = Column(Text)
    is_locked = Column(Boolean, default=False)  # Whether folder is locked
    lock_applied_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    role = relationship("Role")

    __table_args__ = (UniqueConstraint("folder_path", "role_id"),)
