"""Permission reconciliation report service for SharePoint permissions."""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from api.core.errors import ValidationError as BusinessRuleError
from api.integrations.graph.retry_adapter import GraphRetryAdapter
from api.models.rbac import PermissionAssignment
from api.schemas.rbac import PermissionLevel
from api.services.auth.graph_auth import GraphAuthService
from api.services.rbac.permission_engine import PermissionEngine

logger = logging.getLogger(__name__)


class ReconciliationReportService:
    """Service for generating permission reconciliation reports."""

    def __init__(self, graph_auth: GraphAuthService):
        """Initialize reconciliation report service.

        Args:
            graph_auth: Graph authentication service
        """
        self.graph_auth = graph_auth
        self.graph_adapter = GraphRetryAdapter()

    async def generate_reconciliation_report(
        self,
        db: Session,
        order_em_id: UUID,
        include_recommendations: bool = True,
    ) -> dict[str, Any]:
        """Generate a reconciliation report comparing desired vs actual permissions.

        Args:
            db: Database session
            order_em_id: Order EM identifier
            include_recommendations: Whether to include remediation recommendations

        Returns:
            Reconciliation report with differences and recommendations
        """
        logger.info(f"Generating reconciliation report for order_em_id: {order_em_id}")

        try:
            # Get calculated permissions from our system
            permission_engine = PermissionEngine()
            calculated_permissions = await self._get_calculated_permissions(
                db, order_em_id, permission_engine
            )

            # Get actual permissions from SharePoint
            actual_permissions = await self._query_sharepoint_permissions(order_em_id)

            # Compare and find differences
            differences = self._compare_permissions(calculated_permissions, actual_permissions)

            # Identify unauthorized changes
            unauthorized_changes = self._identify_unauthorized_changes(
                differences, calculated_permissions
            )

            # Generate report
            report = {
                "order_em_id": str(order_em_id),
                "generated_at": datetime.utcnow().isoformat(),
                "summary": {
                    "total_folders": len(calculated_permissions),
                    "matching_folders": len([d for d in differences if d["status"] == "matching"]),
                    "mismatched_folders": len(
                        [d for d in differences if d["status"] == "mismatched"]
                    ),
                    "missing_in_sharepoint": len(
                        [d for d in differences if d["status"] == "missing_in_sharepoint"]
                    ),
                    "unauthorized_in_sharepoint": len(
                        [d for d in differences if d["status"] == "unauthorized_in_sharepoint"]
                    ),
                    "total_unauthorized_changes": len(unauthorized_changes),
                },
                "differences": differences,
                "unauthorized_changes": unauthorized_changes,
            }

            # Add remediation recommendations if requested
            if include_recommendations:
                report["recommendations"] = self._generate_recommendations(
                    differences, unauthorized_changes
                )

            logger.info(
                f"Reconciliation report generated: "
                f"{report['summary']['mismatched_folders']} mismatches found"
            )
            return report

        except Exception as e:
            logger.error(f"Failed to generate reconciliation report: {str(e)}")
            raise BusinessRuleError(f"Reconciliation report generation failed: {str(e)}")

    async def _get_calculated_permissions(
        self,
        db: Session,
        order_em_id: UUID,
        permission_engine: PermissionEngine,
    ) -> dict[str, set[tuple[str, str]]]:
        """Get calculated permissions from our system.

        Args:
            db: Database session
            order_em_id: Order EM identifier
            permission_engine: Permission calculation engine

        Returns:
            Dictionary of folder paths to permission sets
        """
        # Get all permission assignments for this order
        assignments = (
            db.query(PermissionAssignment)
            .filter(PermissionAssignment.order_em_id == order_em_id)
            .filter(PermissionAssignment.is_active)
            .all()
        )

        # Group by folder
        permissions_by_folder = {}
        for assignment in assignments:
            folder_path = assignment.resource_path
            if folder_path not in permissions_by_folder:
                permissions_by_folder[folder_path] = set()

            # Get user email and permission level
            if assignment.granted_to_type == "user":
                user_email = assignment.granted_to_id
                permission_level = assignment.permission_level
                permissions_by_folder[folder_path].add((user_email, permission_level))

        return permissions_by_folder

    async def _query_sharepoint_permissions(
        self, order_em_id: UUID
    ) -> dict[str, set[tuple[str, str]]]:
        """Query current permissions from SharePoint.

        Args:
            order_em_id: Order EM identifier

        Returns:
            Dictionary of folder paths to actual permission sets
        """
        logger.info(f"Querying SharePoint permissions for order_em_id: {order_em_id}")

        try:
            token = await self.graph_auth.get_app_token()
            headers = {"Authorization": f"Bearer {token}"}

            # Get the SharePoint site and document library
            # This would need the actual site URL and library name from the order
            site_url = f"sites/EM_{order_em_id}"  # Simplified for example

            # Query all folders and their permissions
            permissions_by_folder = {}

            # Get document library structure
            folders_url = f"{site_url}/drive/root/children"
            folders_response = await self.graph_adapter.execute_with_retry(
                "GET", folders_url, headers=headers
            )

            if folders_response and folders_response.get("value"):
                for folder in folders_response["value"]:
                    if folder.get("folder"):  # It's a folder
                        folder_path = folder.get("name")
                        folder_id = folder.get("id")

                        # Get permissions for this folder
                        permissions_url = f"{site_url}/drive/items/{folder_id}/permissions"
                        perms_response = await self.graph_adapter.execute_with_retry(
                            "GET", permissions_url, headers=headers
                        )

                        if perms_response and perms_response.get("value"):
                            folder_permissions = set()
                            for perm in perms_response["value"]:
                                # Extract user and permission level
                                if perm.get("grantedTo"):
                                    user = perm["grantedTo"].get("user", {})
                                    email = user.get("email", "")
                                    roles = perm.get("roles", [])

                                    # Map SharePoint roles to our permission levels
                                    permission_level = (
                                        self._map_sharepoint_role_to_permission_level(roles)
                                    )
                                    if email and permission_level:
                                        folder_permissions.add((email, permission_level))

                            permissions_by_folder[folder_path] = folder_permissions

            return permissions_by_folder

        except Exception as e:
            logger.error(f"Failed to query SharePoint permissions: {str(e)}")
            return {}

    def _map_sharepoint_role_to_permission_level(self, roles: list[str]) -> str:
        """Map SharePoint roles to our permission levels.

        Args:
            roles: SharePoint roles

        Returns:
            Permission level string
        """
        if "write" in roles or "owner" in roles:
            return PermissionLevel.WRITE
        elif "read" in roles:
            return PermissionLevel.READ
        else:
            return ""

    def _compare_permissions(
        self,
        calculated: dict[str, set[tuple[str, str]]],
        actual: dict[str, set[tuple[str, str]]],
    ) -> list[dict[str, Any]]:
        """Compare calculated vs actual permissions.

        Args:
            calculated: Calculated permissions
            actual: Actual SharePoint permissions

        Returns:
            List of differences
        """
        differences = []
        all_folders = set(calculated.keys()) | set(actual.keys())

        for folder in all_folders:
            calc_perms = calculated.get(folder, set())
            actual_perms = actual.get(folder, set())

            if folder not in actual:
                # Folder missing in SharePoint
                differences.append(
                    {
                        "folder": folder,
                        "status": "missing_in_sharepoint",
                        "calculated": list(calc_perms),
                        "actual": [],
                        "missing_permissions": list(calc_perms),
                        "extra_permissions": [],
                    }
                )
            elif folder not in calculated:
                # Unauthorized folder in SharePoint
                differences.append(
                    {
                        "folder": folder,
                        "status": "unauthorized_in_sharepoint",
                        "calculated": [],
                        "actual": list(actual_perms),
                        "missing_permissions": [],
                        "extra_permissions": list(actual_perms),
                    }
                )
            elif calc_perms != actual_perms:
                # Permissions mismatch
                missing = calc_perms - actual_perms
                extra = actual_perms - calc_perms
                differences.append(
                    {
                        "folder": folder,
                        "status": "mismatched",
                        "calculated": list(calc_perms),
                        "actual": list(actual_perms),
                        "missing_permissions": list(missing),
                        "extra_permissions": list(extra),
                    }
                )
            else:
                # Permissions match
                differences.append(
                    {
                        "folder": folder,
                        "status": "matching",
                        "calculated": list(calc_perms),
                        "actual": list(actual_perms),
                        "missing_permissions": [],
                        "extra_permissions": [],
                    }
                )

        return differences

    def _identify_unauthorized_changes(
        self,
        differences: list[dict[str, Any]],
        calculated_permissions: dict[str, set[tuple[str, str]]],
    ) -> list[dict[str, Any]]:
        """Identify unauthorized permission changes.

        Args:
            differences: Permission differences
            calculated_permissions: Expected permissions

        Returns:
            List of unauthorized changes
        """
        unauthorized = []

        for diff in differences:
            if diff["status"] in ["unauthorized_in_sharepoint", "mismatched"]:
                # Check for extra permissions not in our system
                for user, perm_level in diff.get("extra_permissions", []):
                    unauthorized.append(
                        {
                            "folder": diff["folder"],
                            "type": "unauthorized_permission",
                            "user": user,
                            "permission": perm_level,
                            "severity": "high" if perm_level == PermissionLevel.WRITE else "medium",
                            "description": (
                                f"User {user} has {perm_level} permission "
                                "not authorized by system"
                            ),
                        }
                    )

                # Check for missing required permissions
                for user, perm_level in diff.get("missing_permissions", []):
                    unauthorized.append(
                        {
                            "folder": diff["folder"],
                            "type": "missing_permission",
                            "user": user,
                            "permission": perm_level,
                            "severity": "high",
                            "description": f"User {user} missing required {perm_level} permission",
                        }
                    )

        return unauthorized

    def _generate_recommendations(
        self,
        differences: list[dict[str, Any]],
        unauthorized_changes: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Generate remediation recommendations.

        Args:
            differences: Permission differences
            unauthorized_changes: Unauthorized changes

        Returns:
            List of recommendations
        """
        recommendations = []

        # Group unauthorized changes by severity
        high_severity = [u for u in unauthorized_changes if u["severity"] == "high"]
        medium_severity = [u for u in unauthorized_changes if u["severity"] == "medium"]

        if high_severity:
            recommendations.append(
                {
                    "priority": "immediate",
                    "action": "remove_unauthorized_permissions",
                    "description": (
                        f"Remove {len(high_severity)} high-severity " "unauthorized permissions"
                    ),
                    "affected_folders": list(set(u["folder"] for u in high_severity)),
                    "impact": "critical",
                }
            )

        # Recommend fixing missing permissions
        missing_perms = [d for d in differences if d["status"] == "missing_in_sharepoint"]
        if missing_perms:
            recommendations.append(
                {
                    "priority": "high",
                    "action": "apply_missing_permissions",
                    "description": (
                        f"Apply permissions to {len(missing_perms)} folders "
                        "missing in SharePoint"
                    ),
                    "affected_folders": [d["folder"] for d in missing_perms],
                    "impact": "high",
                }
            )

        # Recommend fixing mismatched permissions
        mismatched = [d for d in differences if d["status"] == "mismatched"]
        if mismatched:
            recommendations.append(
                {
                    "priority": "normal",
                    "action": "sync_permissions",
                    "description": (
                        f"Synchronize permissions for {len(mismatched)} " "folders with mismatches"
                    ),
                    "affected_folders": [d["folder"] for d in mismatched],
                    "impact": "medium",
                }
            )

        if medium_severity:
            recommendations.append(
                {
                    "priority": "normal",
                    "action": "review_permissions",
                    "description": (
                        f"Review {len(medium_severity)} medium-severity " "permission discrepancies"
                    ),
                    "affected_folders": list(set(u["folder"] for u in medium_severity)),
                    "impact": "medium",
                }
            )

        # Sort by priority
        priority_order = {"immediate": 0, "high": 1, "normal": 2, "low": 3}
        recommendations.sort(key=lambda r: priority_order.get(r["priority"], 99))

        return recommendations

    async def get_permission_drift_summary(
        self, db: Session, order_em_id: UUID | None = None
    ) -> dict[str, Any]:
        """Get a summary of permission drift across orders.

        Args:
            db: Database session
            order_em_id: Optional specific order to check

        Returns:
            Summary of permission drift
        """
        logger.info("Generating permission drift summary")

        # Get all active permission assignments
        query = db.query(PermissionAssignment).filter(PermissionAssignment.is_active)

        if order_em_id:
            query = query.filter(PermissionAssignment.order_em_id == order_em_id)

        assignments = query.all()

        # Group by sync status
        total = len(assignments)
        synced = len([a for a in assignments if a.sharepoint_sync_status == "synced"])
        pending = len([a for a in assignments if a.sharepoint_sync_status in ["pending", None]])
        failed = len([a for a in assignments if a.sharepoint_sync_status == "failed"])

        summary = {
            "total_assignments": total,
            "synced": synced,
            "pending": pending,
            "failed": failed,
            "sync_percentage": (synced / total * 100) if total > 0 else 0,
            "last_check": datetime.utcnow().isoformat(),
        }

        if order_em_id:
            summary["order_em_id"] = str(order_em_id)

        return summary
