"""State reconciliation service for lock system."""

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from api.core.logging import get_logger
from api.models.lock import LockState, LockTransitionLog
from api.services.locks.monitoring import LockMonitoringService
from api.services.sharepoint.permission_service import SharePointPermissionService

logger = get_logger(__name__)


class StateReconciliationService:
    """Service to reconcile lock states between database and SharePoint (Task 3 - AC: 8)."""

    def __init__(self, db: Session):
        """Initialize reconciliation service.

        Args:
            db: Database session
        """
        self.db = db
        self.monitoring_service = LockMonitoringService(db)
        self.permission_service = SharePointPermissionService(db)

    async def reconcile_lock_state(
        self,
        order_em_id: int,
        evaluation_run_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Compare database state with SharePoint and correct drift (Task 3 - subtask 2).

        Args:
            order_em_id: Order/EM identifier
            evaluation_run_id: Optional evaluation run ID for tracking

        Returns:
            Reconciliation results
        """
        start_time = datetime.now(UTC)
        results = {
            "order_em_id": order_em_id,
            "timestamp": start_time.isoformat(),
            "status": "success",
            "drift_detected": False,
            "corrections_applied": [],
            "errors": [],
        }

        try:
            # Get current lock state from database
            lock_state = (
                self.db.query(LockState)
                .filter(
                    LockState.order_em_id == order_em_id,
                    LockState.is_active,
                )
                .first()
            )

            if not lock_state:
                results["status"] = "skipped"
                results["message"] = "No active lock state found"
                return results

            # Get SharePoint permissions
            # graph_client = await get_graph_client()  # TODO: Implement graph client
            graph_client = None  # Placeholder

            # Parse folder path to get site/drive/folder IDs
            folder_info = await self._parse_folder_path(lock_state.folder_path)
            if not folder_info:
                results["status"] = "error"
                results["errors"].append("Failed to parse folder path")
                return results

            # Get current SharePoint permissions
            sp_permissions = await self._get_sharepoint_permissions(
                graph_client,
                folder_info["site_id"],
                folder_info["drive_id"],
                folder_info["folder_id"],
            )

            # Compare with expected state
            expected_permission = self._map_lock_to_permission(lock_state.permission_level)
            current_permission = self._extract_permission_level(sp_permissions)

            if current_permission != expected_permission:
                results["drift_detected"] = True
                results["drift_details"] = {
                    "expected": expected_permission,
                    "actual": current_permission,
                    "folder_path": lock_state.folder_path,
                }

                # Correct the drift (Task 3 - subtask 3)
                correction_result = await self._apply_permission_correction(
                    graph_client,
                    folder_info,
                    expected_permission,
                    lock_state,
                )

                if correction_result["success"]:
                    results["corrections_applied"].append(
                        {
                            "folder_path": lock_state.folder_path,
                            "previous_permission": current_permission,
                            "new_permission": expected_permission,
                            "applied_at": datetime.now(UTC).isoformat(),
                        }
                    )

                    # Log the correction
                    self._log_reconciliation(
                        order_em_id,
                        lock_state.folder_path,
                        current_permission,
                        expected_permission,
                        evaluation_run_id,
                        success=True,
                    )
                else:
                    results["status"] = "partial"
                    results["errors"].append(correction_result["error"])

                    # Log the failure
                    self._log_reconciliation(
                        order_em_id,
                        lock_state.folder_path,
                        current_permission,
                        expected_permission,
                        evaluation_run_id,
                        success=False,
                        error=correction_result["error"],
                    )

            # Record metrics
            duration_ms = (datetime.now(UTC) - start_time).total_seconds() * 1000
            self.monitoring_service.record_transition_result(
                order_em_id,
                lock_state.folder_path,
                success=results["status"] != "error",
                duration_ms=duration_ms,
            )

        except Exception as e:
            logger.error(
                f"Reconciliation failed for EM {order_em_id}: {str(e)}",
                extra={
                    "order_em_id": order_em_id,
                    "error": str(e),
                    "evaluation_run_id": str(evaluation_run_id) if evaluation_run_id else None,
                },
            )
            results["status"] = "error"
            results["errors"].append(str(e))

        return results

    async def run_bulk_reconciliation(
        self,
        em_ids: list[int] | None = None,
        after_failure: bool = False,
    ) -> dict[str, Any]:
        """Run reconciliation for multiple EMs (Task 3 - subtask 4).

        Args:
            em_ids: Optional list of EM IDs to reconcile. If None, reconcile all active.
            after_failure: Whether this is a recovery run after failures

        Returns:
            Bulk reconciliation results
        """
        start_time = datetime.now(UTC)

        # Get EMs to reconcile
        if em_ids:
            lock_states = (
                self.db.query(LockState)
                .filter(
                    LockState.order_em_id.in_(em_ids),
                    LockState.is_active,
                )
                .all()
            )
        else:
            # Get all active lock states
            lock_states = self.db.query(LockState).filter(LockState.is_active).all()

        total_count = len(lock_states)
        results = {
            "timestamp": start_time.isoformat(),
            "total_ems": total_count,
            "reconciled": 0,
            "drift_found": 0,
            "corrections_applied": 0,
            "errors": 0,
            "after_failure": after_failure,
            "details": [],
        }

        # Process in batches to avoid overwhelming the system
        batch_size = 10
        for i in range(0, total_count, batch_size):
            batch = lock_states[i : i + batch_size]

            # Process batch concurrently
            tasks = [self.reconcile_lock_state(ls.order_em_id) for ls in batch]

            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in batch_results:
                if isinstance(result, Exception):
                    results["errors"] += 1
                    results["details"].append(
                        {
                            "error": str(result),
                            "status": "exception",
                        }
                    )
                else:
                    results["reconciled"] += 1
                    if result.get("drift_detected"):
                        results["drift_found"] += 1
                    if result.get("corrections_applied"):
                        results["corrections_applied"] += len(result["corrections_applied"])

                    if result["status"] != "success":
                        results["errors"] += 1

                    results["details"].append(result)

        # Calculate execution time
        duration_seconds = (datetime.now(UTC) - start_time).total_seconds()
        results["duration_seconds"] = duration_seconds

        # Log summary
        logger.info(
            f"Bulk reconciliation completed: {results['reconciled']}/{total_count} EMs, "
            f"{results['drift_found']} drift detected, "
            f"{results['corrections_applied']} corrections applied",
            extra=results,
        )

        return results

    async def generate_reconciliation_report(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> dict[str, Any]:
        """Generate reconciliation report (Task 3 - subtask 5).

        Args:
            start_date: Start date for report period
            end_date: End date for report period

        Returns:
            Reconciliation report data
        """
        if not end_date:
            end_date = datetime.now(UTC)
        if not start_date:
            from datetime import timedelta

            start_date = end_date - timedelta(days=7)

        # Query transition logs for reconciliation events
        reconciliation_logs = (
            self.db.query(LockTransitionLog)
            .filter(
                LockTransitionLog.transitioned_at >= start_date,
                LockTransitionLog.transitioned_at <= end_date,
                LockTransitionLog.transition_reason.like("%reconciliation%"),
            )
            .all()
        )

        # Aggregate data
        report = {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "summary": {
                "total_reconciliations": len(reconciliation_logs),
                "successful": sum(1 for log in reconciliation_logs if log.success),
                "failed": sum(1 for log in reconciliation_logs if not log.success),
            },
            "by_em": {},
            "drift_patterns": {},
            "common_errors": {},
        }

        # Group by EM
        for log in reconciliation_logs:
            em_id = str(log.order_em_id)
            if em_id not in report["by_em"]:
                report["by_em"][em_id] = {
                    "total": 0,
                    "successful": 0,
                    "failed": 0,
                    "folders": set(),
                }

            report["by_em"][em_id]["total"] += 1
            if log.success:
                report["by_em"][em_id]["successful"] += 1
            else:
                report["by_em"][em_id]["failed"] += 1
            report["by_em"][em_id]["folders"].add(log.folder_path)

        # Convert sets to lists for JSON serialization
        for em_id in report["by_em"]:
            report["by_em"][em_id]["folders"] = list(report["by_em"][em_id]["folders"])

        # Identify drift patterns
        drift_transitions = {}
        for log in reconciliation_logs:
            if log.previous_state and log.new_state and log.previous_state != log.new_state:
                transition = f"{log.previous_permission} -> {log.new_permission}"
                if transition not in drift_transitions:
                    drift_transitions[transition] = 0
                drift_transitions[transition] += 1

        report["drift_patterns"] = drift_transitions

        # Common errors
        error_counts = {}
        for log in reconciliation_logs:
            if not log.success and log.error_message:
                error_type = self._categorize_error(log.error_message)
                if error_type not in error_counts:
                    error_counts[error_type] = 0
                error_counts[error_type] += 1

        report["common_errors"] = error_counts

        return report

    async def handle_manual_changes(
        self,
        folder_path: str,
        detected_permission: str,
        expected_permission: str,
    ) -> dict[str, Any]:
        """Handle manual SharePoint changes detected during reconciliation (Task 3 - subtask 6).

        Args:
            folder_path: Path to the folder
            detected_permission: Permission level detected in SharePoint
            expected_permission: Expected permission level from lock state

        Returns:
            Handling result
        """
        result = {
            "folder_path": folder_path,
            "action": "none",
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Check if this is a legitimate manual override
        lock_state = (
            self.db.query(LockState)
            .filter(
                LockState.folder_path == folder_path,
                LockState.is_active.is_(True),
            )
            .first()
        )

        if lock_state and lock_state.is_manual_override:
            # This is an expected manual override, don't correct it
            result["action"] = "preserved"
            result["reason"] = "Manual override is active"
            logger.info(
                f"Preserving manual override for {folder_path}",
                extra={
                    "folder_path": folder_path,
                    "manual_permission": detected_permission,
                },
            )
        else:
            # Unexpected manual change, need to correct
            result["action"] = "corrected"
            result["reason"] = "Unauthorized manual change detected"

            # Create alert for manual change
            self.monitoring_service._send_alert(
                "Unauthorized SharePoint Permission Change",
                f"Manual change detected on {folder_path}: "
                f"Expected {expected_permission}, found {detected_permission}",
            )

            # Log the incident
            logger.warning(
                f"Unauthorized manual change detected on {folder_path}",
                extra={
                    "folder_path": folder_path,
                    "expected": expected_permission,
                    "detected": detected_permission,
                },
            )

        return result

    async def _parse_folder_path(self, folder_path: str) -> dict[str, str] | None:
        """Parse folder path to extract SharePoint identifiers.

        Args:
            folder_path: Full folder path

        Returns:
            Dictionary with site_id, drive_id, folder_id or None if parsing fails
        """
        # This would typically parse the path or look up IDs from a mapping table
        # For now, returning mock data structure
        # In production, this would integrate with SharePoint service

        # Example implementation would be:
        # parts = folder_path.split('/')
        # site_name = parts[0]
        # library_name = parts[1]
        # folder_path_remaining = '/'.join(parts[2:])

        # Then query SharePoint to get IDs
        # This is a simplified version
        return {
            "site_id": "mock-site-id",
            "drive_id": "mock-drive-id",
            "folder_id": "mock-folder-id",
        }

    async def _get_sharepoint_permissions(
        self,
        graph_client: Any,
        site_id: str,
        drive_id: str,
        folder_id: str,
    ) -> dict[str, Any]:
        """Get current permissions from SharePoint.

        Args:
            graph_client: Microsoft Graph client
            site_id: SharePoint site ID
            drive_id: Document library drive ID
            folder_id: Folder item ID

        Returns:
            Current permissions data
        """
        try:
            # Get folder permissions via Graph API
            permissions = await (
                graph_client.sites[site_id].drives[drive_id].items[folder_id].permissions.get()
            )
            return permissions
        except Exception as e:
            logger.error(f"Failed to get SharePoint permissions: {str(e)}")
            raise

    def _map_lock_to_permission(self, lock_permission: str) -> str:
        """Map lock permission level to SharePoint permission.

        Args:
            lock_permission: Lock permission level

        Returns:
            SharePoint permission string
        """
        mapping = {
            "full": "write",
            "write": "write",
            "read": "read",
        }
        return mapping.get(lock_permission, "read")

    def _extract_permission_level(self, sp_permissions: dict[str, Any]) -> str:
        """Extract effective permission level from SharePoint response.

        Args:
            sp_permissions: SharePoint permissions response

        Returns:
            Effective permission level
        """
        # Parse SharePoint permissions response
        # This would analyze the roles and grants to determine effective permission
        # Simplified version:
        if "value" in sp_permissions:
            for permission in sp_permissions["value"]:
                if "roles" in permission:
                    if "write" in permission["roles"]:
                        return "write"
                    elif "read" in permission["roles"]:
                        return "read"
        return "none"

    async def _apply_permission_correction(
        self,
        graph_client: Any,
        folder_info: dict[str, str],
        expected_permission: str,
        lock_state: LockState,
    ) -> dict[str, Any]:
        """Apply permission correction to SharePoint.

        Args:
            graph_client: Microsoft Graph client
            folder_info: Folder identifiers
            expected_permission: Expected permission level
            lock_state: Current lock state

        Returns:
            Correction result
        """
        try:
            # Apply the correct permissions via Graph API
            await self.permission_service.apply_lock_permissions(
                site_id=folder_info["site_id"],
                drive_id=folder_info["drive_id"],
                folder_id=folder_info["folder_id"],
                permission_level=expected_permission,
            )

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _log_reconciliation(
        self,
        order_em_id: int,
        folder_path: str,
        previous_permission: str,
        new_permission: str,
        evaluation_run_id: UUID | None,
        success: bool,
        error: str | None = None,
    ) -> None:
        """Log reconciliation event.

        Args:
            order_em_id: Order/EM identifier
            folder_path: Folder path
            previous_permission: Previous permission level
            new_permission: New permission level
            evaluation_run_id: Evaluation run ID
            success: Whether reconciliation succeeded
            error: Error message if failed
        """
        log_entry = LockTransitionLog(
            order_em_id=order_em_id,
            folder_path=folder_path,
            previous_permission=previous_permission,
            new_permission=new_permission,
            transition_reason="State reconciliation - drift correction",
            evaluation_run_id=evaluation_run_id,
            success=success,
            error_message=error,
            transitioned_at=datetime.now(UTC),
        )

        self.db.add(log_entry)
        self.db.commit()

    def _categorize_error(self, error_message: str) -> str:
        """Categorize error message for reporting.

        Args:
            error_message: Error message text

        Returns:
            Error category
        """
        if "throttl" in error_message.lower() or "429" in error_message:
            return "rate_limit"
        elif (
            "permission" in error_message.lower()
            or "401" in error_message
            or "403" in error_message
        ):
            return "permission_denied"
        elif "timeout" in error_message.lower():
            return "timeout"
        elif "not found" in error_message.lower() or "404" in error_message:
            return "not_found"
        else:
            return "other"
