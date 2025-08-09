"""SharePoint permission application service.

Applies calculated RBAC permissions to SharePoint folders via Microsoft Graph API.
Handles breaking inheritance, setting permissions, and idempotent operations.
"""

import asyncio
import logging
from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.errors import GraphAPIError, PermissionApplicationError
from api.core.idempotency import check_idempotency, mark_operation_complete
from api.core.retry import exponential_backoff_with_jitter
from api.integrations.graph.retry_adapter import GraphRetryAdapter
from api.models.audit import AuditLog
from api.models.rbac import PermissionAssignment
from api.services.auth.graph_auth import get_graph_token
from api.services.telemetry.graph_metrics import get_metrics_collector

logger = logging.getLogger(__name__)


class PermissionSyncStatus(str, Enum):
    """SharePoint sync status for permission assignments."""

    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    FAILED = "failed"
    NEEDS_UPDATE = "needs_update"


class PermissionAction(str, Enum):
    """Permission modification actions."""

    GRANT = "grant"
    REVOKE = "revoke"
    UPDATE = "update"


class SharePointPermissionService:
    """Service for managing SharePoint permissions via Graph API."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.metrics_collector = get_metrics_collector(db_session)
        self.graph_adapter = GraphRetryAdapter(metrics_collector=self.metrics_collector)
        self._token_cache = {}

    async def apply_permissions(
        self,
        folder_path: str,
        site_id: str,
        permissions: list[dict[str, Any]],
        correlation_id: str,
        break_inheritance: bool = False,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Apply permissions to a SharePoint folder.

        Args:
            folder_path: Path to the folder relative to site root
            site_id: SharePoint site ID
            permissions: List of permission assignments
            correlation_id: Request correlation ID for tracing
            break_inheritance: Whether to break inheritance from parent

        Returns:
            Result dict with applied permissions and status
        """
        idempotency_key = f"{site_id}:{folder_path}:{datetime.utcnow().strftime('%Y%m%d%H')}"

        if await check_idempotency(self.db, idempotency_key, "permission_apply"):
            logger.info(f"Permission application already processed for {folder_path}")
            return {"status": "already_applied", "folder_path": folder_path}

        try:
            token = await self._get_graph_token()

            drive_item_id = await self._get_drive_item_id(site_id, folder_path, token)

            if break_inheritance:
                await self._break_inheritance(site_id, drive_item_id, token, correlation_id)

            current_permissions = await self._get_current_permissions(site_id, drive_item_id, token)

            actions_needed = self._calculate_permission_changes(current_permissions, permissions)

            results = []
            for action in actions_needed:
                result = await self._apply_permission_action(
                    site_id, drive_item_id, action, token, correlation_id
                )
                results.append(result)

            await self._update_sync_status(folder_path, site_id, PermissionSyncStatus.SYNCED)

            await self._audit_permission_change(
                folder_path, site_id, actions_needed, correlation_id, user_id
            )

            await mark_operation_complete(self.db, idempotency_key, "permission_apply")

            return {
                "status": "success",
                "folder_path": folder_path,
                "actions_applied": len(actions_needed),
                "results": results,
            }

        except Exception as e:
            logger.error(f"Failed to apply permissions to {folder_path}: {str(e)}")
            await self._update_sync_status(
                folder_path, site_id, PermissionSyncStatus.FAILED, str(e)
            )
            raise PermissionApplicationError(f"Permission application failed: {str(e)}")

    async def _get_graph_token(self) -> str:
        """Get or refresh Graph API token."""
        if (
            "token" not in self._token_cache
            or self._token_cache.get("expires", 0) < datetime.utcnow().timestamp()
        ):
            token_data = await get_graph_token()
            self._token_cache = {
                "token": token_data["access_token"],
                "expires": datetime.utcnow().timestamp() + token_data.get("expires_in", 3600),
            }
        return self._token_cache["token"]

    async def _get_drive_item_id(self, site_id: str, folder_path: str, token: str) -> str:
        """Get SharePoint drive item ID for a folder path."""
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        path_segments = folder_path.strip("/").split("/")
        current_id = "root"

        for segment in path_segments:
            if not segment:
                continue

            url = f"{settings.GRAPH_API_BASE}/sites/{site_id}/drive/items/{current_id}/children"

            response = await self.graph_adapter.get(url, headers=headers)

            if response.status_code != 200:
                raise GraphAPIError(f"Failed to get folder: {response.status_code}")

            items = response.json().get("value", [])
            folder = next(
                (item for item in items if item["name"] == segment and "folder" in item), None
            )

            if not folder:
                raise PermissionApplicationError(f"Folder not found: {segment} in {folder_path}")

            current_id = folder["id"]

        return current_id

    async def _break_inheritance(
        self, site_id: str, item_id: str, token: str, correlation_id: str
    ) -> None:
        """Break permission inheritance for a SharePoint item."""
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-correlation-id": correlation_id,
        }

        url = f"{settings.GRAPH_API_BASE}/sites/{site_id}/drive/items/{item_id}/permissions"

        body = {"breakInheritance": {"copyFromParent": False, "clearSubscopes": True}}

        response = await self.graph_adapter.post(url, json=body, headers=headers)

        if response.status_code not in (200, 201, 204):
            raise GraphAPIError(f"Failed to break inheritance: {response.status_code}")

        logger.info(f"Broke inheritance for item {item_id}")

    async def _get_current_permissions(
        self, site_id: str, item_id: str, token: str
    ) -> list[dict[str, Any]]:
        """Get current permissions for a SharePoint item."""
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        url = f"{settings.GRAPH_API_BASE}/sites/{site_id}/drive/items/{item_id}/permissions"

        response = await self.graph_adapter.get(url, headers=headers)

        if response.status_code != 200:
            raise GraphAPIError(f"Failed to get permissions: {response.status_code}")

        return response.json().get("value", [])

    def _calculate_permission_changes(
        self, current: list[dict[str, Any]], desired: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Calculate required permission changes."""
        actions = []

        current_by_principal = {self._get_principal_key(perm): perm for perm in current}

        desired_by_principal = {self._get_principal_key(perm): perm for perm in desired}

        for principal_key, desired_perm in desired_by_principal.items():
            if principal_key not in current_by_principal:
                actions.append({"action": PermissionAction.GRANT, "permission": desired_perm})
            elif not self._permissions_equal(current_by_principal[principal_key], desired_perm):
                actions.append(
                    {
                        "action": PermissionAction.UPDATE,
                        "permission": desired_perm,
                        "current_id": current_by_principal[principal_key].get("id"),
                    }
                )

        for principal_key, current_perm in current_by_principal.items():
            if principal_key not in desired_by_principal:
                actions.append(
                    {"action": PermissionAction.REVOKE, "permission_id": current_perm.get("id")}
                )

        return actions

    def _get_principal_key(self, permission: dict[str, Any]) -> str:
        """Get unique key for a permission principal."""
        if "grantedTo" in permission:
            if "user" in permission["grantedTo"]:
                return f"user:{permission['grantedTo']['user']['id']}"
            elif "group" in permission["grantedTo"]:
                return f"group:{permission['grantedTo']['group']['id']}"
        elif "grantedToIdentities" in permission:
            ids = [identity.get("id", "") for identity in permission["grantedToIdentities"]]
            return f"identities:{','.join(sorted(ids))}"
        return f"unknown:{permission.get('id', '')}"

    def _permissions_equal(self, perm1: dict[str, Any], perm2: dict[str, Any]) -> bool:
        """Check if two permissions are functionally equal."""
        roles1 = set(perm1.get("roles", []))
        roles2 = set(perm2.get("roles", []))
        return roles1 == roles2

    async def _apply_permission_action(
        self, site_id: str, item_id: str, action: dict[str, Any], token: str, correlation_id: str
    ) -> dict[str, Any]:
        """Apply a single permission action."""
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-correlation-id": correlation_id,
        }

        if action["action"] == PermissionAction.GRANT:
            return await self._grant_permission(site_id, item_id, action["permission"], headers)
        elif action["action"] == PermissionAction.UPDATE:
            return await self._update_permission(
                site_id, item_id, action["current_id"], action["permission"], headers
            )
        elif action["action"] == PermissionAction.REVOKE:
            return await self._revoke_permission(site_id, item_id, action["permission_id"], headers)
        else:
            raise ValueError(f"Unknown action: {action['action']}")

    async def _grant_permission(
        self, site_id: str, item_id: str, permission: dict[str, Any], headers: dict[str, str]
    ) -> dict[str, Any]:
        """Grant new permission."""
        url = f"{settings.GRAPH_API_BASE}/sites/{site_id}/drive/items/{item_id}/invite"

        body = {
            "recipients": permission.get("recipients", []),
            "roles": permission.get("roles", ["read"]),
            "requireSignIn": True,
            "sendInvitation": False,
        }

        response = await self.graph_adapter.post(url, json=body, headers=headers)

        if response.status_code not in (200, 201):
            raise GraphAPIError(f"Failed to grant permission: {response.status_code}")

        return {"action": "granted", "status": "success", "permission": permission}

    async def _update_permission(
        self,
        site_id: str,
        item_id: str,
        permission_id: str,
        permission: dict[str, Any],
        headers: dict[str, str],
    ) -> dict[str, Any]:
        """Update existing permission."""
        url = (
            f"{settings.GRAPH_API_BASE}/sites/{site_id}/drive/items/{item_id}"
            f"/permissions/{permission_id}"
        )

        body = {"roles": permission.get("roles", ["read"])}

        response = await self.graph_adapter.patch(url, json=body, headers=headers)

        if response.status_code not in (200, 204):
            raise GraphAPIError(f"Failed to update permission: {response.status_code}")

        return {"action": "updated", "status": "success", "permission_id": permission_id}

    async def _revoke_permission(
        self, site_id: str, item_id: str, permission_id: str, headers: dict[str, str]
    ) -> dict[str, Any]:
        """Revoke permission."""
        url = (
            f"{settings.GRAPH_API_BASE}/sites/{site_id}/drive/items/{item_id}"
            f"/permissions/{permission_id}"
        )

        response = await self.graph_adapter.delete(url, headers=headers)

        if response.status_code not in (200, 204):
            raise GraphAPIError(f"Failed to revoke permission: {response.status_code}")

        return {"action": "revoked", "status": "success", "permission_id": permission_id}

    async def _update_sync_status(
        self,
        folder_path: str,
        site_id: str,
        status: PermissionSyncStatus,
        error: str | None = None,
    ) -> None:
        """Update sync status in database."""
        stmt = (
            update(PermissionAssignment)
            .where(
                PermissionAssignment.resource_path == folder_path,
                PermissionAssignment.resource_type == "sharepoint_folder",
            )
            .values(
                sharepoint_sync_status=status.value,
                last_sync_at=datetime.utcnow(),
                sync_error=error,
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def _audit_permission_change(
        self,
        folder_path: str,
        site_id: str,
        actions: list[dict[str, Any]],
        correlation_id: str,
        user_id: str | None = None,
    ) -> None:
        """Audit permission changes."""
        audit_entry = AuditLog(
            action="sharepoint_permission_change",
            entity_type="sharepoint_folder",
            entity_id=folder_path,
            user_id=user_id or "system",
            correlation_id=correlation_id,
            extra_metadata={
                "site_id": site_id,
                "actions_count": len(actions),
                "actions": [
                    {
                        "type": str(action["action"]),
                        "principal": action.get("permission", {}).get("grantedTo"),
                    }
                    for action in actions
                ],
            },
            timestamp=datetime.utcnow(),
        )
        self.db.add(audit_entry)
        await self.db.commit()


class SharePointBulkPermissionProcessor:
    """Processor for bulk SharePoint permission operations."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.permission_service = SharePointPermissionService(db_session)
        self._batch_size = settings.GRAPH_BATCH_SIZE or 20
        self._max_concurrent = settings.MAX_CONCURRENT_GRAPH_REQUESTS or 5

    async def process_bulk_permissions(
        self, permission_sets: list[dict[str, Any]], correlation_id: str
    ) -> dict[str, Any]:
        """Process multiple permission sets in bulk.

        Args:
            permission_sets: List of permission configurations
            correlation_id: Request correlation ID

        Returns:
            Bulk processing results
        """
        total = len(permission_sets)
        processed = 0
        failed = 0
        results = []

        semaphore = asyncio.Semaphore(self._max_concurrent)

        async def process_with_limit(perm_set):
            async with semaphore:
                return await self._process_single_permission_set(perm_set, correlation_id)

        for i in range(0, total, self._batch_size):
            batch = permission_sets[i : i + self._batch_size]

            batch_tasks = [process_with_limit(perm_set) for perm_set in batch]

            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

            for result in batch_results:
                if isinstance(result, Exception):
                    failed += 1
                    results.append({"status": "failed", "error": str(result)})
                else:
                    processed += 1
                    results.append(result)

            await self._update_progress(correlation_id, processed, total)

            if i + self._batch_size < total:
                await asyncio.sleep(1)

        return {"total": total, "processed": processed, "failed": failed, "results": results}

    async def _process_single_permission_set(
        self, perm_set: dict[str, Any], correlation_id: str
    ) -> dict[str, Any]:
        """Process a single permission set with retry."""
        max_retries = 3

        for attempt in range(max_retries):
            try:
                result = await self.permission_service.apply_permissions(
                    folder_path=perm_set["folder_path"],
                    site_id=perm_set["site_id"],
                    permissions=perm_set["permissions"],
                    correlation_id=correlation_id,
                    break_inheritance=perm_set.get("break_inheritance", False),
                )
                return result
            except GraphAPIError as e:
                if "429" in str(e) and attempt < max_retries - 1:
                    wait_time = exponential_backoff_with_jitter(attempt)
                    await asyncio.sleep(wait_time)
                else:
                    raise

    async def _update_progress(self, correlation_id: str, processed: int, total: int) -> None:
        """Update bulk operation progress."""
        logger.info(
            f"Bulk permission progress: {processed}/{total} " f"(correlation_id: {correlation_id})"
        )
