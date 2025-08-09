"""Permission matrix engine for calculating effective permissions."""

import re
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from api.models.rbac import (
    Group,
    GroupRoleMapping,
    Membership,
    PermissionException,
    PermissionRule,
    Role,
)
from api.schemas.rbac import (
    EffectivePermission,
    FolderType,
    PermissionLevel,
    RoleName,
)


class PermissionEngine:
    """Engine for calculating effective permissions based on role matrix."""

    def __init__(self, db: Session):
        """Initialize permission engine with database session."""
        self.db = db
        self._folder_type_patterns = {
            FolderType.FINANCIAL: [r".*[Pp]énzügyi.*", r".*PENZUGYI.*"],
            FolderType.NEU_ONLY: [r"^NEÜ-.*", r".*NEÜ-only.*"],
            FolderType.FINAL: [r".*VEGLEGES.*", r".*FINAL.*"],
            FolderType.PARTNER_SPECIFIC: [r".*/CEG_\d{2}/.*"],
        }

    def classify_folder_type(self, folder_path: str) -> FolderType:
        """Classify folder type based on path patterns."""
        for folder_type, patterns in self._folder_type_patterns.items():
            for pattern in patterns:
                if re.match(pattern, folder_path):
                    return folder_type
        return FolderType.STANDARD

    def get_user_roles(self, user_id: str) -> list[Role]:
        """Get all roles assigned to a user through group memberships."""
        memberships = (
            self.db.query(Membership)
            .filter(Membership.user_id == user_id)
            .options(
                joinedload(Membership.group)
                .joinedload(Group.group_role_mappings)
                .joinedload(GroupRoleMapping.role)
            )
            .all()
        )

        roles = []
        seen_role_ids = set()
        for membership in memberships:
            for mapping in membership.group.group_role_mappings:
                if mapping.role.id not in seen_role_ids:
                    roles.append(mapping.role)
                    seen_role_ids.add(mapping.role.id)

        return sorted(roles, key=lambda r: r.priority, reverse=True)

    def get_base_permissions(self, role: Role, folder_type: FolderType) -> set[PermissionLevel]:
        """Get base permissions for a role on a folder type."""
        rules = (
            self.db.query(PermissionRule)
            .filter(
                and_(
                    PermissionRule.role_id == role.id,
                    PermissionRule.folder_type == folder_type.value,
                )
            )
            .all()
        )

        permissions = set()
        for rule in rules:
            permissions.add(PermissionLevel(rule.permission_level))

        return permissions

    def apply_segregation_rules(
        self, role: Role, folder_path: str, folder_type: FolderType
    ) -> set[PermissionLevel] | None:
        """Apply special segregation rules that override base permissions."""
        if folder_type == FolderType.FINANCIAL:
            if role.name != RoleName.PENZUGYES.value:
                return set()

        if folder_type == FolderType.NEU_ONLY:
            if not role.name.startswith("NEU_"):
                return set()

        if folder_type == FolderType.FINAL:
            return {PermissionLevel.READ}

        if folder_type == FolderType.PARTNER_SPECIFIC:
            match = re.match(r".*/CEG_(\d{2})/.*", folder_path)
            if match:
                if role.name == RoleName.PARTNER_ADMIN.value:
                    return None
                elif not role.name.startswith("NEU_"):
                    return set()

        return None

    def check_exceptions(self, role: Role, folder_path: str) -> tuple[PermissionLevel, str] | None:
        """Check if there are any permission exceptions for this role and folder."""
        now = datetime.utcnow()

        exception = (
            self.db.query(PermissionException)
            .filter(
                and_(
                    PermissionException.role_id == role.id,
                    PermissionException.folder_path == folder_path,
                    or_(
                        PermissionException.expires_at.is_(None),
                        PermissionException.expires_at > now,
                    ),
                )
            )
            .first()
        )

        if exception:
            return (
                PermissionLevel(exception.permission_override),
                exception.reason or "Exception applied",
            )

        return None

    def calculate_effective_permissions(
        self,
        folder_path: str,
        role_ids: list[UUID] | None = None,
        user_id: str | None = None,
    ) -> list[EffectivePermission]:
        """Calculate effective permissions for specified roles or user."""
        if not role_ids and not user_id:
            raise ValueError("Either role_ids or user_id must be provided")

        if user_id:
            roles = self.get_user_roles(user_id)
        else:
            roles = (
                self.db.query(Role)
                .filter(Role.id.in_(role_ids))
                .order_by(Role.priority.desc())
                .all()
            )

        folder_type = self.classify_folder_type(folder_path)
        effective_permissions = []

        for role in roles:
            exception_result = self.check_exceptions(role, folder_path)

            if exception_result:
                permission_level, reason = exception_result
                effective_permissions.append(
                    EffectivePermission(
                        folder_path=folder_path,
                        role_id=role.id,
                        role_name=RoleName(role.name),
                        permission_level=permission_level,
                        source="exception",
                        inheritance_broken=False,
                        exception_applied=True,
                        exception_reason=reason,
                    )
                )
                continue

            segregation_override = self.apply_segregation_rules(role, folder_path, folder_type)

            if segregation_override is not None:
                if not segregation_override:
                    continue

                for perm in segregation_override:
                    effective_permissions.append(
                        EffectivePermission(
                            folder_path=folder_path,
                            role_id=role.id,
                            role_name=RoleName(role.name),
                            permission_level=perm,
                            source="segregation_rule",
                            inheritance_broken=True,
                            exception_applied=False,
                        )
                    )
                continue

            base_permissions = self.get_base_permissions(role, folder_type)

            for perm in base_permissions:
                effective_permissions.append(
                    EffectivePermission(
                        folder_path=folder_path,
                        role_id=role.id,
                        role_name=RoleName(role.name),
                        permission_level=perm,
                        source="base_rule",
                        inheritance_broken=False,
                        exception_applied=False,
                    )
                )

        return effective_permissions

    def resolve_permission_conflicts(
        self, permissions: list[EffectivePermission]
    ) -> dict[UUID, PermissionLevel]:
        """Resolve conflicts when multiple permissions exist for same role."""
        role_permissions: dict[UUID, list[EffectivePermission]] = {}

        for perm in permissions:
            if perm.role_id not in role_permissions:
                role_permissions[perm.role_id] = []
            role_permissions[perm.role_id].append(perm)

        resolved = {}
        permission_hierarchy = {
            PermissionLevel.MANAGE: 4,
            PermissionLevel.DELETE: 3,
            PermissionLevel.WRITE: 2,
            PermissionLevel.READ: 1,
        }

        for role_id, role_perms in role_permissions.items():
            highest_level = PermissionLevel.READ
            highest_score = 0

            for perm in role_perms:
                score = permission_hierarchy.get(perm.permission_level, 0)
                if score > highest_score:
                    highest_score = score
                    highest_level = perm.permission_level

            resolved[role_id] = highest_level

        return resolved
