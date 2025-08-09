"""Celery tasks for applying lock state transitions to SharePoint."""

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from celery import Task
from celery.utils.log import get_task_logger
from sqlalchemy.orm import Session

from api.core.database import SessionLocal
from api.core.logging import get_logger
from api.models.lock import (
    LockState,
    LockTransitionLog,
    PermissionLevel,
)
from api.services.sharepoint.sharepoint_service import SharePointService
from worker.app import celery_app

logger = get_task_logger(__name__)
audit_logger = get_logger("audit.locks")


class TransitionConflictStrategy(str, Enum):
    """Strategies for handling lock state transition conflicts."""

    RETRY = "retry"  # Retry the transition
    SKIP = "skip"  # Skip the conflicting transition
    FORCE = "force"  # Force apply the transition
    ROLLBACK = "rollback"  # Rollback to previous state


class LockApplicationTask(Task):
    """Base task class with database session management."""

    _db: Session | None = None
    _sharepoint_service: SharePointService | None = None

    @property
    def db(self) -> Session:
        """Get or create database session."""
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    @property
    def sharepoint_service(self) -> SharePointService:
        """Get or create SharePoint service."""
        if self._sharepoint_service is None:
            self._sharepoint_service = SharePointService(self.db)
        return self._sharepoint_service

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Clean up resources after task completion."""
        if self._db is not None:
            self._db.close()
            self._db = None
        self._sharepoint_service = None


@celery_app.task(
    base=LockApplicationTask,
    bind=True,
    name="worker.apply_lock_state",
    queue="locks",
    max_retries=3,
    default_retry_delay=30,
)
def apply_lock_state(
    self,
    order_em_id: int,
    folder_path: str,
    new_state: str,
    new_permission: str,
    lock_rule_id: str | None,
    evaluation_run_id: str,
    correlation_id: str,
    conflict_strategy: str = "retry",
) -> dict:
    """Apply lock state transition to a folder in SharePoint.

    Args:
        order_em_id: Order/EM identifier
        folder_path: Path to the folder
        new_state: New lock state (LockWindowType value)
        new_permission: New permission level (PermissionLevel value)
        lock_rule_id: ID of the lock rule triggering the change
        evaluation_run_id: ID of the evaluation run
        correlation_id: Correlation ID for tracing
        conflict_strategy: Strategy for handling conflicts

    Returns:
        Dictionary with application results
    """
    start_time = datetime.now(UTC)

    # Log rule configuration with author (subtask 6)
    audit_logger.info(
        "Lock state application started",
        extra={
            "order_em_id": order_em_id,
            "folder_path": folder_path,
            "new_state": new_state,
            "new_permission": new_permission,
            "lock_rule_id": lock_rule_id,
            "evaluation_run_id": evaluation_run_id,
            "correlation_id": correlation_id,
            "task_id": self.request.id,
        },
    )

    try:
        # Get current lock state
        current_lock = (
            self.db.query(LockState)
            .filter(
                LockState.order_em_id == order_em_id,
                LockState.folder_path == folder_path,
            )
            .first()
        )

        # Track before state (subtask 7)
        before_state = None
        before_permission = None
        if current_lock:
            before_state = current_lock.current_state
            before_permission = current_lock.permission_level

        # Check for conflicts (subtask 4)
        conflict_detected = False
        if current_lock and current_lock.is_manual_override:
            conflict_detected = True
            audit_logger.warning(
                "Conflict detected: Manual override present",
                extra={
                    "order_em_id": order_em_id,
                    "folder_path": folder_path,
                    "override_reason": current_lock.override_reason,
                    "correlation_id": correlation_id,
                },
            )

            # Handle conflict based on strategy
            if conflict_strategy == TransitionConflictStrategy.SKIP:
                return {
                    "status": "skipped",
                    "reason": "manual_override_present",
                    "order_em_id": order_em_id,
                    "folder_path": folder_path,
                }
            elif conflict_strategy == TransitionConflictStrategy.RETRY:
                raise self.retry(countdown=60)

        # Apply to SharePoint (subtask 3)
        sharepoint_result = self._apply_sharepoint_permissions(
            order_em_id,
            folder_path,
            PermissionLevel(new_permission),
            correlation_id,
        )

        if not sharepoint_result["success"]:
            # Handle SharePoint failure
            error_msg = sharepoint_result.get("error", "Unknown error")
            audit_logger.error(
                "Failed to apply SharePoint permissions",
                extra={
                    "order_em_id": order_em_id,
                    "folder_path": folder_path,
                    "error": error_msg,
                    "correlation_id": correlation_id,
                },
            )

            # Attempt rollback if needed (subtask 5)
            if conflict_strategy == TransitionConflictStrategy.ROLLBACK and before_permission:
                self._rollback_permissions(
                    order_em_id,
                    folder_path,
                    PermissionLevel(before_permission),
                    correlation_id,
                )

            raise Exception(f"SharePoint permission update failed: {error_msg}")

        # Update lock state in database
        if not current_lock:
            current_lock = LockState(
                id=uuid4(),
                order_em_id=order_em_id,
                folder_id=uuid4(),  # Generate a folder ID for now
                folder_path=folder_path,
                current_state=new_state,
                permission_level=new_permission,
                locked_at=datetime.now(UTC),
                locked_by_rule_id=UUID(lock_rule_id) if lock_rule_id else None,
                is_manual_override=False,
                created_at=datetime.now(UTC),
            )
            self.db.add(current_lock)
        else:
            current_lock.current_state = new_state
            current_lock.permission_level = new_permission
            current_lock.locked_at = datetime.now(UTC)
            current_lock.locked_by_rule_id = UUID(lock_rule_id) if lock_rule_id else None
            current_lock.is_manual_override = False
            current_lock.override_reason = None
            current_lock.updated_at = datetime.now(UTC)

        # Create audit log entry (subtasks 7, 8, 10)
        log_entry = LockTransitionLog(
            id=uuid4(),
            lock_rule_id=UUID(lock_rule_id) if lock_rule_id else None,
            order_em_id=order_em_id,
            folder_path=folder_path,
            previous_state=before_state,
            new_state=new_state,
            previous_permission=before_permission,
            new_permission=new_permission,
            transition_reason=f"Automated time-based transition via evaluation {evaluation_run_id}",
            transitioned_at=datetime.now(UTC),
            evaluation_run_id=UUID(evaluation_run_id),
            success=True,
            correlation_id=correlation_id,
        )
        self.db.add(log_entry)
        self.db.commit()

        end_time = datetime.now(UTC)
        duration_ms = (end_time - start_time).total_seconds() * 1000

        # Log successful transition with full context
        audit_logger.info(
            "Lock state transition completed successfully",
            extra={
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "before_state": before_state,
                "after_state": new_state,
                "before_permission": before_permission,
                "after_permission": new_permission,
                "duration_ms": duration_ms,
                "evaluation_run_id": evaluation_run_id,
                "correlation_id": correlation_id,
                "sharepoint_updated": True,
            },
        )

        return {
            "status": "success",
            "order_em_id": order_em_id,
            "folder_path": folder_path,
            "before_state": before_state,
            "after_state": new_state,
            "before_permission": before_permission,
            "after_permission": new_permission,
            "duration_ms": duration_ms,
            "conflict_detected": conflict_detected,
        }

    except Exception as e:
        end_time = datetime.now(UTC)
        duration_ms = (end_time - start_time).total_seconds() * 1000

        # Log failed transition
        audit_logger.error(
            "Lock state transition failed",
            extra={
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "error": str(e),
                "duration_ms": duration_ms,
                "evaluation_run_id": evaluation_run_id,
                "correlation_id": correlation_id,
            },
        )

        # Create failure log entry
        log_entry = LockTransitionLog(
            id=uuid4(),
            lock_rule_id=UUID(lock_rule_id) if lock_rule_id else None,
            order_em_id=order_em_id,
            folder_path=folder_path,
            previous_state=before_state if "before_state" in locals() else None,
            new_state=new_state,
            previous_permission=before_permission if "before_permission" in locals() else None,
            new_permission=new_permission,
            transition_reason=f"Failed transition via evaluation {evaluation_run_id}",
            transitioned_at=datetime.now(UTC),
            evaluation_run_id=UUID(evaluation_run_id),
            success=False,
            error_message=str(e),
            correlation_id=correlation_id,
        )
        self.db.add(log_entry)
        self.db.commit()

        # Retry with exponential backoff
        raise self.retry(exc=e)

    def _apply_sharepoint_permissions(
        self,
        order_em_id: int,
        folder_path: str,
        permission_level: PermissionLevel,
        correlation_id: str,
    ) -> dict[str, Any]:
        """Apply permission changes to SharePoint folder.

        Args:
            order_em_id: Order/EM identifier
            folder_path: Path to the folder
            permission_level: Permission level to apply
            correlation_id: Correlation ID for tracing

        Returns:
            Dictionary with operation results
        """
        try:
            # Map permission level to SharePoint permissions
            if permission_level == PermissionLevel.FULL:
                sp_permission = "Contribute"  # Read, write, delete
            elif permission_level == PermissionLevel.WRITE:
                sp_permission = "Edit"  # Read and write
            else:  # READ
                sp_permission = "Read"  # Read only

            # Apply permissions via SharePoint service
            result = self.sharepoint_service.update_folder_permissions(
                folder_path=folder_path,
                permission_level=sp_permission,
                correlation_id=correlation_id,
            )

            return {"success": True, "result": result}

        except Exception as e:
            logger.error(
                f"SharePoint permission update failed: {e}",
                extra={
                    "order_em_id": order_em_id,
                    "folder_path": folder_path,
                    "permission_level": permission_level.value,
                    "correlation_id": correlation_id,
                },
            )
            return {"success": False, "error": str(e)}

    def _rollback_permissions(
        self,
        order_em_id: int,
        folder_path: str,
        previous_permission: PermissionLevel,
        correlation_id: str,
    ) -> bool:
        """Rollback permissions to previous state.

        Args:
            order_em_id: Order/EM identifier
            folder_path: Path to the folder
            previous_permission: Previous permission level
            correlation_id: Correlation ID for tracing

        Returns:
            True if rollback successful, False otherwise
        """
        try:
            audit_logger.info(
                "Attempting permission rollback",
                extra={
                    "order_em_id": order_em_id,
                    "folder_path": folder_path,
                    "rollback_to": previous_permission.value,
                    "correlation_id": correlation_id,
                },
            )

            result = self._apply_sharepoint_permissions(
                order_em_id,
                folder_path,
                previous_permission,
                correlation_id,
            )

            if result["success"]:
                audit_logger.info(
                    "Permission rollback successful",
                    extra={
                        "order_em_id": order_em_id,
                        "folder_path": folder_path,
                        "correlation_id": correlation_id,
                    },
                )
                return True
            else:
                audit_logger.error(
                    "Permission rollback failed",
                    extra={
                        "order_em_id": order_em_id,
                        "folder_path": folder_path,
                        "error": result.get("error"),
                        "correlation_id": correlation_id,
                    },
                )
                return False

        except Exception as e:
            audit_logger.error(
                f"Exception during permission rollback: {e}",
                extra={
                    "order_em_id": order_em_id,
                    "folder_path": folder_path,
                    "correlation_id": correlation_id,
                },
            )
            return False


@celery_app.task(
    base=LockApplicationTask,
    bind=True,
    name="worker.apply_manual_override",
    queue="locks",
)
def apply_manual_override(
    self,
    order_em_id: int,
    folder_path: str,
    override_state: str,
    override_permission: str,
    override_reason: str,
    override_by: str,
    correlation_id: str,
) -> dict:
    """Apply manual override to lock state.

    Args:
        order_em_id: Order/EM identifier
        folder_path: Path to the folder
        override_state: Override lock state
        override_permission: Override permission level
        override_reason: Reason for override
        override_by: User applying override
        correlation_id: Correlation ID for tracing

    Returns:
        Dictionary with operation results
    """
    # Capture manual overrides (subtask 9)
    audit_logger.info(
        "Manual lock override requested",
        extra={
            "order_em_id": order_em_id,
            "folder_path": folder_path,
            "override_state": override_state,
            "override_permission": override_permission,
            "override_reason": override_reason,
            "override_by": override_by,
            "correlation_id": correlation_id,
        },
    )

    try:
        # Get current lock state
        current_lock = (
            self.db.query(LockState)
            .filter(
                LockState.order_em_id == order_em_id,
                LockState.folder_path == folder_path,
            )
            .first()
        )

        before_state = None
        before_permission = None
        if current_lock:
            before_state = current_lock.current_state
            before_permission = current_lock.permission_level

        # Apply SharePoint permissions
        sharepoint_result = apply_lock_state._apply_sharepoint_permissions(
            self,
            order_em_id,
            folder_path,
            PermissionLevel(override_permission),
            correlation_id,
        )

        if not sharepoint_result["success"]:
            raise Exception(f"SharePoint update failed: {sharepoint_result.get('error')}")

        # Update or create lock state with override flag
        if not current_lock:
            current_lock = LockState(
                id=uuid4(),
                order_em_id=order_em_id,
                folder_id=uuid4(),  # Generate a folder ID for now
                folder_path=folder_path,
                current_state=override_state,
                permission_level=override_permission,
                locked_at=datetime.now(UTC),
                is_manual_override=True,
                override_reason=override_reason,
                created_at=datetime.now(UTC),
            )
            self.db.add(current_lock)
        else:
            current_lock.current_state = override_state
            current_lock.permission_level = override_permission
            current_lock.locked_at = datetime.now(UTC)
            current_lock.is_manual_override = True
            current_lock.override_reason = override_reason
            current_lock.updated_at = datetime.now(UTC)

        # Create audit log for manual override
        log_entry = LockTransitionLog(
            id=uuid4(),
            order_em_id=order_em_id,
            folder_path=folder_path,
            previous_state=before_state,
            new_state=override_state,
            previous_permission=before_permission,
            new_permission=override_permission,
            transition_reason=f"Manual override by {override_by}: {override_reason}",
            transitioned_at=datetime.now(UTC),
            success=True,
            correlation_id=correlation_id,
        )
        self.db.add(log_entry)
        self.db.commit()

        audit_logger.info(
            "Manual lock override applied successfully",
            extra={
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "before_state": before_state,
                "after_state": override_state,
                "before_permission": before_permission,
                "after_permission": override_permission,
                "override_by": override_by,
                "correlation_id": correlation_id,
            },
        )

        return {
            "status": "success",
            "order_em_id": order_em_id,
            "folder_path": folder_path,
            "override_applied": True,
        }

    except Exception as e:
        audit_logger.error(
            f"Manual override failed: {e}",
            extra={
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "error": str(e),
                "correlation_id": correlation_id,
            },
        )

        # Log failure
        log_entry = LockTransitionLog(
            id=uuid4(),
            order_em_id=order_em_id,
            folder_path=folder_path,
            previous_state=before_state if "before_state" in locals() else None,
            new_state=override_state,
            previous_permission=before_permission if "before_permission" in locals() else None,
            new_permission=override_permission,
            transition_reason=f"Failed manual override by {override_by}",
            transitioned_at=datetime.now(UTC),
            success=False,
            error_message=str(e),
            correlation_id=correlation_id,
        )
        self.db.add(log_entry)
        self.db.commit()

        raise


@celery_app.task(
    base=LockApplicationTask,
    bind=True,
    name="worker.apply_manual_lock_permissions",
    queue="locks",
    max_retries=3,
    default_retry_delay=30,
)
def apply_manual_lock_permissions(
    self,
    em_id: int,
    scope: str,
    action: str,
    correlation_id: str,
) -> dict:
    """Apply manual lock permissions to SharePoint folders.

    Args:
        em_id: Order/EM identifier
        scope: Folder scope ('experts' or 'deliverables')
        action: Lock action ('lock' or 'unlock')
        correlation_id: Correlation ID for tracing

    Returns:
        Dictionary with operation results
    """
    from api.models.contract import OrderEm

    start_time = datetime.now(UTC)

    audit_logger.info(
        "Manual lock permissions update started",
        extra={
            "em_id": em_id,
            "scope": scope,
            "action": action,
            "correlation_id": correlation_id,
            "task_id": self.request.id,
        },
    )

    try:
        # Get EM details
        em = self.db.query(OrderEm).filter(OrderEm.id == em_id).first()
        if not em:
            raise ValueError(f"Order/EM with ID {em_id} not found")

        # Determine folder paths based on scope
        base_path = f"/sites/{em.sharepoint_site_id}/Shared Documents/{em.name}"
        folder_paths = []

        if scope == "experts":
            folder_paths = [f"{base_path}/Szakértők"]
        elif scope == "deliverables":
            folder_paths = [f"{base_path}/Eredménytermékek"]
        else:
            raise ValueError(f"Invalid scope: {scope}")

        # Determine permission level based on action
        if action == "lock":
            sp_permission = "Read"
        elif action == "unlock":
            sp_permission = "Contribute"
        else:
            raise ValueError(f"Invalid action: {action}")

        # Apply permissions to each folder
        results = []
        for folder_path in folder_paths:
            try:
                # Apply SharePoint permissions
                self.sharepoint_service.update_folder_permissions(
                    folder_path=folder_path,
                    permission_level=sp_permission,
                    correlation_id=correlation_id,
                )

                # Update lock state in database to reflect SharePoint sync
                lock_state = (
                    self.db.query(LockState)
                    .filter(
                        LockState.order_em_id == em_id,
                        LockState.folder_path == folder_path,
                        LockState.is_active.is_(True),
                    )
                    .first()
                )

                if lock_state:
                    lock_state.updated_at = datetime.now(UTC)
                    self.db.commit()

                results.append(
                    {
                        "folder_path": folder_path,
                        "success": True,
                        "permission_applied": sp_permission,
                    }
                )

                audit_logger.info(
                    "Manual lock permissions applied to folder",
                    extra={
                        "em_id": em_id,
                        "folder_path": folder_path,
                        "permission": sp_permission,
                        "correlation_id": correlation_id,
                    },
                )

            except Exception as e:
                error_msg = str(e)
                results.append(
                    {
                        "folder_path": folder_path,
                        "success": False,
                        "error": error_msg,
                    }
                )

                audit_logger.error(
                    "Failed to apply permissions to folder",
                    extra={
                        "em_id": em_id,
                        "folder_path": folder_path,
                        "error": error_msg,
                        "correlation_id": correlation_id,
                    },
                )

        end_time = datetime.now(UTC)
        duration_ms = (end_time - start_time).total_seconds() * 1000

        # Check if all operations succeeded
        all_success = all(r["success"] for r in results)

        if all_success:
            audit_logger.info(
                "Manual lock permissions update completed successfully",
                extra={
                    "em_id": em_id,
                    "scope": scope,
                    "action": action,
                    "duration_ms": duration_ms,
                    "correlation_id": correlation_id,
                    "folders_updated": len(results),
                },
            )
        else:
            audit_logger.warning(
                "Manual lock permissions update completed with errors",
                extra={
                    "em_id": em_id,
                    "scope": scope,
                    "action": action,
                    "duration_ms": duration_ms,
                    "correlation_id": correlation_id,
                    "successful": sum(1 for r in results if r["success"]),
                    "failed": sum(1 for r in results if not r["success"]),
                },
            )

        return {
            "status": "success" if all_success else "partial",
            "em_id": em_id,
            "scope": scope,
            "action": action,
            "results": results,
            "duration_ms": duration_ms,
        }

    except Exception as e:
        end_time = datetime.now(UTC)
        duration_ms = (end_time - start_time).total_seconds() * 1000

        audit_logger.error(
            "Manual lock permissions update failed",
            extra={
                "em_id": em_id,
                "scope": scope,
                "action": action,
                "error": str(e),
                "duration_ms": duration_ms,
                "correlation_id": correlation_id,
            },
        )

        # Retry with exponential backoff
        raise self.retry(exc=e)
