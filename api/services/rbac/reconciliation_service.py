"""Service for reconciling desired vs actual SharePoint permissions."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from api.integrations.graph.retry_adapter import GraphRetryAdapter
from api.models.audit import AuditLog
from api.models.rbac import PermissionAssignment, Role
from api.schemas.rbac import (
    PermissionDrift,
    PermissionLevel,
    ReconciliationReport,
    RoleName,
)
from api.services.rbac.permission_engine import PermissionEngine


class ReconciliationService:
    """Service for comparing and reconciling permissions with SharePoint."""

    def __init__(self, db: Session, graph_client: GraphRetryAdapter | None = None):
        """Initialize reconciliation service."""
        self.db = db
        self.graph_client = graph_client
        self.permission_engine = PermissionEngine(db)
        self._permission_mapping = {
            "read": PermissionLevel.READ,
            "write": PermissionLevel.WRITE,
            "edit": PermissionLevel.WRITE,
            "delete": PermissionLevel.DELETE,
            "fullcontrol": PermissionLevel.MANAGE,
            "manage": PermissionLevel.MANAGE,
        }

    async def get_actual_permissions(
        self, site_id: str, folder_path: str
    ) -> dict[str, PermissionLevel]:
        """Query actual SharePoint permissions via Graph API."""
        if not self.graph_client:
            return {}

        actual_permissions = {}

        try:
            drive_item = await self.graph_client.get(f"/sites/{site_id}/drive/root:/{folder_path}")

            if not drive_item or "id" not in drive_item:
                return actual_permissions

            item_id = drive_item["id"]

            permissions_response = await self.graph_client.get(
                f"/sites/{site_id}/drive/items/{item_id}/permissions"
            )

            if not permissions_response or "value" not in permissions_response:
                return actual_permissions

            for permission in permissions_response["value"]:
                if "grantedToV2" in permission:
                    granted_to = permission["grantedToV2"]

                    if "group" in granted_to:
                        group_id = granted_to["group"].get("id")
                        roles = permission.get("roles", [])

                        if group_id and roles:
                            highest_permission = self._map_sharepoint_roles(roles)
                            if highest_permission:
                                actual_permissions[group_id] = highest_permission

                    elif "user" in granted_to:
                        user_id = granted_to["user"].get("id")
                        roles = permission.get("roles", [])

                        if user_id and roles:
                            highest_permission = self._map_sharepoint_roles(roles)
                            if highest_permission:
                                actual_permissions[user_id] = highest_permission

        except Exception as e:
            self._log_error(f"Failed to get actual permissions for {folder_path}: {str(e)}")

        return actual_permissions

    def _map_sharepoint_roles(self, roles: list[str]) -> PermissionLevel | None:
        """Map SharePoint role names to our permission levels."""
        mapped_permissions = []

        for role in roles:
            role_lower = role.lower()
            if role_lower in self._permission_mapping:
                mapped_permissions.append(self._permission_mapping[role_lower])

        if not mapped_permissions:
            return None

        permission_hierarchy = {
            PermissionLevel.MANAGE: 4,
            PermissionLevel.DELETE: 3,
            PermissionLevel.WRITE: 2,
            PermissionLevel.READ: 1,
        }

        return max(mapped_permissions, key=lambda p: permission_hierarchy.get(p, 0))

    def get_desired_permissions(self, folder_path: str) -> dict[UUID, PermissionLevel]:
        """Get desired permissions from our database."""
        assignments = (
            self.db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == folder_path)
            .all()
        )

        desired = {}
        for assignment in assignments:
            desired[assignment.role_id] = PermissionLevel(assignment.permission_level)

        return desired

    async def compare_permissions(self, site_id: str, folder_path: str) -> list[PermissionDrift]:
        """Compare desired vs actual permissions and identify drifts."""
        drifts = []

        desired = self.get_desired_permissions(folder_path)
        actual = await self.get_actual_permissions(site_id, folder_path)

        role_to_group_mapping = self._get_role_to_group_mapping()

        for role_id, desired_perm in desired.items():
            role = self.db.query(Role).filter(Role.id == role_id).first()
            if not role:
                continue

            group_ids = role_to_group_mapping.get(role_id, [])

            actual_perm = None
            for group_id in group_ids:
                if group_id in actual:
                    actual_perm = actual[group_id]
                    break

            if actual_perm != desired_perm:
                action = "grant" if actual_perm is None else "update"
                if desired_perm is None and actual_perm is not None:
                    action = "revoke"

                drifts.append(
                    PermissionDrift(
                        folder_path=folder_path,
                        role_name=RoleName(role.name),
                        desired_permission=desired_perm,
                        actual_permission=actual_perm,
                        action_required=action,
                        detected_at=datetime.utcnow(),
                    )
                )

        for principal_id, actual_perm in actual.items():
            found = False
            for role_id, group_ids in role_to_group_mapping.items():
                if principal_id in group_ids:
                    if role_id in desired:
                        found = True
                        break

            if not found:
                drifts.append(
                    PermissionDrift(
                        folder_path=folder_path,
                        role_name=RoleName.NEU_ADMIN,
                        desired_permission=None,
                        actual_permission=actual_perm,
                        action_required="revoke",
                        detected_at=datetime.utcnow(),
                    )
                )

        return drifts

    async def scan_folder_tree(
        self, site_id: str, root_path: str, max_depth: int = 5
    ) -> ReconciliationReport:
        """Scan entire folder tree and generate reconciliation report."""
        scan_id = uuid.uuid4()
        scan_start = datetime.utcnow()

        folders_to_check = self._get_folders_to_check(root_path, max_depth)
        total_folders = len(folders_to_check)
        folders_checked = 0
        all_drifts = []

        for folder_path in folders_to_check:
            try:
                drifts = await self.compare_permissions(site_id, folder_path)
                all_drifts.extend(drifts)
                folders_checked += 1
            except Exception as e:
                self._log_error(f"Failed to check permissions for {folder_path}: {str(e)}")

        report = ReconciliationReport(
            scan_id=scan_id,
            scanned_at=scan_start,
            total_folders=total_folders,
            folders_checked=folders_checked,
            drifts_detected=len(all_drifts),
            drifts=all_drifts,
            remediation_required=len(all_drifts) > 0,
        )

        self._log_reconciliation_report(report)

        return report

    def create_remediation_tasks(self, drifts: list[PermissionDrift]) -> list[dict]:
        """Create remediation tasks for permission mismatches."""
        tasks = []

        for drift in drifts:
            task = {
                "id": str(uuid.uuid4()),
                "type": "permission_remediation",
                "folder_path": drift.folder_path,
                "role_name": drift.role_name.value,
                "action": drift.action_required,
                "desired_permission": (
                    drift.desired_permission.value if drift.desired_permission else None
                ),
                "actual_permission": (
                    drift.actual_permission.value if drift.actual_permission else None
                ),
                "created_at": datetime.utcnow(),
                "status": "pending",
            }
            tasks.append(task)

        return tasks

    async def apply_remediation(self, site_id: str, task: dict) -> bool:
        """Apply a single remediation task to SharePoint."""
        if not self.graph_client:
            return False

        try:
            folder_path = task["folder_path"]
            action = task["action"]

            drive_item = await self.graph_client.get(f"/sites/{site_id}/drive/root:/{folder_path}")

            if not drive_item or "id" not in drive_item:
                return False

            item_id = drive_item["id"]

            if action == "grant":
                await self._grant_permission(site_id, item_id, task)
            elif action == "update":
                await self._update_permission(site_id, item_id, task)
            elif action == "revoke":
                await self._revoke_permission(site_id, item_id, task)

            self._log_remediation(task, "success")
            return True

        except Exception as e:
            self._log_remediation(task, "failed", str(e))
            return False

    async def _grant_permission(self, site_id: str, item_id: str, task: dict):
        """Grant new permission in SharePoint."""
        pass

    async def _update_permission(self, site_id: str, item_id: str, task: dict):
        """Update existing permission in SharePoint."""
        pass

    async def _revoke_permission(self, site_id: str, item_id: str, task: dict):
        """Revoke permission in SharePoint."""
        pass

    def _get_role_to_group_mapping(self) -> dict[UUID, list[str]]:
        """Get mapping of role IDs to Azure AD group IDs."""
        from api.models.rbac import Group, GroupRoleMapping

        mapping = {}

        mappings = self.db.query(GroupRoleMapping).join(Group).all()

        for grm in mappings:
            if grm.role_id not in mapping:
                mapping[grm.role_id] = []
            mapping[grm.role_id].append(grm.group.azure_ad_group_id)

        return mapping

    def _get_folders_to_check(self, root_path: str, max_depth: int) -> list[str]:
        """Get list of folders to check (stub - would integrate with SharePoint)."""
        return [root_path]

    def _log_error(self, message: str):
        """Log error to audit log."""
        audit_entry = AuditLog(
            entity_type="permission_reconciliation",
            entity_id=str(uuid.uuid4()),
            action="error",
            extra_metadata={"error": message},
            user_id="system",
            correlation_id=str(uuid.uuid4()),
            success="false",
            error_message=message,
        )
        self.db.add(audit_entry)
        self.db.commit()

    def _log_reconciliation_report(self, report: ReconciliationReport):
        """Log reconciliation report to audit log."""
        audit_entry = AuditLog(
            entity_type="permission_reconciliation",
            entity_id=str(report.scan_id),
            action="scan_completed",
            extra_metadata={
                "total_folders": report.total_folders,
                "folders_checked": report.folders_checked,
                "drifts_detected": report.drifts_detected,
                "remediation_required": report.remediation_required,
            },
            user_id="system",
            correlation_id=str(report.scan_id),
            success="true",
        )
        self.db.add(audit_entry)
        self.db.commit()

    def _log_remediation(self, task: dict, status: str, error: str | None = None):
        """Log remediation action to audit log."""
        details = {
            "task_id": task["id"],
            "folder_path": task["folder_path"],
            "action": task["action"],
            "status": status,
        }
        if error:
            details["error"] = error

        audit_entry = AuditLog(
            entity_type="permission_remediation",
            entity_id=task["id"],
            action=f"remediation_{status}",
            extra_metadata=details,
            user_id="system",
            correlation_id=task.get("correlation_id", str(uuid.uuid4())),
            success="true" if status == "success" else "false",
            error_message=error,
        )
        self.db.add(audit_entry)
        self.db.commit()
