"""Permission inheritance system for folder hierarchies."""

from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session

from api.models.rbac import PermissionAssignment, Role
from api.schemas.rbac import EffectivePermission, PermissionLevel


class InheritanceService:
    """Service for managing permission inheritance in folder trees."""

    def __init__(self, db: Session):
        """Initialize inheritance service with database session."""
        self.db = db
        self._sensitive_folder_patterns = [
            "Pénzügyi",
            "PENZUGYI",
            "NEÜ-only",
            "VEGLEGES",
            "FINAL",
            "BIZALMAS",
            "CONFIDENTIAL",
        ]

    def should_break_inheritance(self, folder_path: str) -> bool:
        """Determine if inheritance should be broken for a folder."""
        # Check if any part of the path contains sensitive patterns
        for pattern in self._sensitive_folder_patterns:
            if pattern in folder_path:
                return True

        # Check for CEG_ folders at the end of path
        if "/CEG_" in folder_path:
            parts = folder_path.split("/")
            for i, part in enumerate(parts):
                if part.startswith("CEG_") and i == len(parts) - 1:
                    return True

        return False

    def get_parent_path(self, folder_path: str) -> str | None:
        """Get parent folder path from a given path."""
        if not folder_path or "/" not in folder_path:
            return None

        parts = folder_path.rsplit("/", 1)
        return parts[0] if parts[0] else None

    def get_inherited_permissions(self, folder_path: str) -> dict[UUID, set[PermissionLevel]]:
        """Get permissions inherited from parent folders."""
        inherited_permissions: dict[UUID, set[PermissionLevel]] = {}

        parent_path = self.get_parent_path(folder_path)
        if not parent_path:
            return inherited_permissions

        # Check if parent has broken inheritance
        parent_assignments = (
            self.db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == parent_path)
            .all()
        )

        # If any assignment at parent level has broken inheritance, stop inheritance chain
        parent_breaks_inheritance = any(
            assignment.inheritance_broken for assignment in parent_assignments
        )

        if parent_breaks_inheritance:
            # Only return permissions explicitly set at parent level
            for assignment in parent_assignments:
                if assignment.role_id not in inherited_permissions:
                    inherited_permissions[assignment.role_id] = set()
                inherited_permissions[assignment.role_id].add(
                    PermissionLevel(assignment.permission_level)
                )
            return inherited_permissions

        # Normal inheritance flow
        for assignment in parent_assignments:
            if assignment.role_id not in inherited_permissions:
                inherited_permissions[assignment.role_id] = set()

            inherited_permissions[assignment.role_id].add(
                PermissionLevel(assignment.permission_level)
            )

        # Recursively get grandparent permissions
        grandparent_perms = self.get_inherited_permissions(parent_path)
        for role_id, permissions in grandparent_perms.items():
            if role_id not in inherited_permissions:
                inherited_permissions[role_id] = set()
            inherited_permissions[role_id].update(permissions)

        return inherited_permissions

    def apply_inheritance(
        self,
        folder_path: str,
        calculated_permissions: list[EffectivePermission],
    ) -> list[EffectivePermission]:
        """Apply inheritance rules to calculated permissions."""
        if self.should_break_inheritance(folder_path):
            for perm in calculated_permissions:
                perm.inheritance_broken = True
            return calculated_permissions

        inherited = self.get_inherited_permissions(folder_path)

        existing_role_perms: dict[UUID, set[PermissionLevel]] = {}
        for perm in calculated_permissions:
            if perm.role_id not in existing_role_perms:
                existing_role_perms[perm.role_id] = set()
            existing_role_perms[perm.role_id].add(perm.permission_level)

        for role_id, inherited_perms in inherited.items():
            if role_id not in existing_role_perms:
                role = self.db.query(Role).filter(Role.id == role_id).first()
                if role:
                    for perm_level in inherited_perms:
                        calculated_permissions.append(
                            EffectivePermission(
                                folder_path=folder_path,
                                role_id=role_id,
                                role_name=role.name,
                                permission_level=perm_level,
                                source="inherited",
                                inheritance_broken=False,
                                exception_applied=False,
                            )
                        )
            else:
                for perm_level in inherited_perms:
                    if perm_level not in existing_role_perms[role_id]:
                        role = self.db.query(Role).filter(Role.id == role_id).first()
                        if role:
                            calculated_permissions.append(
                                EffectivePermission(
                                    folder_path=folder_path,
                                    role_id=role_id,
                                    role_name=role.name,
                                    permission_level=perm_level,
                                    source="inherited",
                                    inheritance_broken=False,
                                    exception_applied=False,
                                )
                            )

        return calculated_permissions

    def cascade_permissions(
        self, folder_path: str, role_id: UUID, permission_level: PermissionLevel
    ) -> list[str]:
        """Cascade permissions down the folder tree where inheritance is not broken."""
        affected_folders = []

        child_folders = self._get_child_folders(folder_path)

        for child_path in child_folders:
            if self.should_break_inheritance(child_path):
                continue

            existing = (
                self.db.query(PermissionAssignment)
                .filter(
                    and_(
                        PermissionAssignment.folder_path == child_path,
                        PermissionAssignment.role_id == role_id,
                    )
                )
                .first()
            )

            if existing and existing.inheritance_broken:
                continue

            if not existing:
                new_assignment = PermissionAssignment(
                    folder_path=child_path,
                    role_id=role_id,
                    permission_level=permission_level.value,
                    inheritance_broken=False,
                    source="cascaded",
                )
                self.db.add(new_assignment)
                affected_folders.append(child_path)
            elif existing.permission_level != permission_level.value:
                existing.permission_level = permission_level.value
                existing.source = "cascaded"
                affected_folders.append(child_path)

            sub_affected = self.cascade_permissions(child_path, role_id, permission_level)
            affected_folders.extend(sub_affected)

        return affected_folders

    def break_inheritance(self, folder_path: str, reason: str = "Manual override") -> bool:
        """Break inheritance for a specific folder."""
        assignments = (
            self.db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == folder_path)
            .all()
        )

        if not assignments:
            return False

        for assignment in assignments:
            assignment.inheritance_broken = True

        self.db.commit()

        return True

    def restore_inheritance(self, folder_path: str) -> bool:
        """Restore inheritance for a specific folder."""
        assignments = (
            self.db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == folder_path)
            .all()
        )

        if not assignments:
            return False

        for assignment in assignments:
            if assignment.source == "cascaded" or assignment.source == "inherited":
                self.db.delete(assignment)
            else:
                assignment.inheritance_broken = False

        self.db.commit()

        parent_path = self.get_parent_path(folder_path)
        if parent_path:
            parent_assignments = (
                self.db.query(PermissionAssignment)
                .filter(PermissionAssignment.folder_path == parent_path)
                .all()
            )

            for parent_assignment in parent_assignments:
                if not parent_assignment.inheritance_broken:
                    self.cascade_permissions(
                        parent_path,
                        parent_assignment.role_id,
                        PermissionLevel(parent_assignment.permission_level),
                    )

        return True

    def get_inheritance_chain(self, folder_path: str) -> list[dict]:
        """Get the complete inheritance chain for audit purposes."""
        chain = []
        current_path = folder_path

        while current_path:
            assignments = (
                self.db.query(PermissionAssignment)
                .filter(PermissionAssignment.folder_path == current_path)
                .all()
            )

            inheritance_broken = False
            for assignment in assignments:
                if assignment.inheritance_broken:
                    inheritance_broken = True
                    break

            chain.append(
                {
                    "folder_path": current_path,
                    "inheritance_broken": inheritance_broken,
                    "permission_count": len(assignments),
                }
            )

            if inheritance_broken:
                break

            current_path = self.get_parent_path(current_path)

        return chain

    def _get_child_folders(self, parent_path: str) -> list[str]:
        """Get child folder paths (stub - would integrate with SharePoint)."""
        return []
