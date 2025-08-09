"""Service for manual lock management."""

import logging
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from api.core.errors import BadRequestError, ForbiddenError, NotFoundError
from api.models.contract import OrderEm
from api.models.lock import LockState, LockTransitionLog, LockType, PermissionLevel
from api.services.audit import AuditService

logger = logging.getLogger(__name__)


class ManualLockService:
    """Service for managing manual locks."""

    def __init__(self, db: Session):
        """Initialize manual lock service.

        Args:
            db: Database session
        """
        self.db = db
        self.audit_service = AuditService(db)

    def apply_manual_lock(
        self,
        em_id: int,
        scope: str,
        action: str,
        reason: str,
        user_id: UUID,
        user_role: str,
        correlation_id: str | None = None,
    ) -> dict:
        """Apply manual lock or unlock to folder groups.

        Args:
            em_id: Order/EM identifier
            scope: Folder scope ('experts' or 'deliverables')
            action: Lock action ('lock' or 'unlock')
            reason: Reason for the action
            user_id: ID of user performing the action
            user_role: Role of the user
            correlation_id: Optional correlation ID for tracing

        Returns:
            Dict with operation result

        Raises:
            ForbiddenError: If user doesn't have PM role
            NotFoundError: If EM not found
            BadRequestError: If invalid parameters
        """
        # Validate user role - only PM can perform manual locks
        if user_role != "PM":
            raise ForbiddenError("Only Project Managers can perform manual lock operations")

        # Validate parameters
        if scope not in ["experts", "deliverables"]:
            raise BadRequestError("Scope must be 'experts' or 'deliverables'")

        if action not in ["lock", "unlock"]:
            raise BadRequestError("Action must be 'lock' or 'unlock'")

        if not reason or len(reason.strip()) < 10:
            raise BadRequestError("Reason must be at least 10 characters long")

        # Check if EM exists
        em = self.db.query(OrderEm).filter(OrderEm.id == em_id).first()
        if not em:
            raise NotFoundError("OrderEm", em_id)

        # Generate correlation ID if not provided
        if not correlation_id:
            correlation_id = f"manual_{action}_{uuid4()}"

        # Determine folder paths based on scope
        folder_paths = self._get_folder_paths(em, scope)

        # Process each folder
        results = []
        for folder_path in folder_paths:
            if action == "lock":
                result = self._apply_lock(
                    em_id=em_id,
                    folder_path=folder_path,
                    reason=reason,
                    user_id=user_id,
                    correlation_id=correlation_id,
                )
            else:
                result = self._remove_lock(
                    em_id=em_id,
                    folder_path=folder_path,
                    reason=reason,
                    user_id=user_id,
                    correlation_id=correlation_id,
                )
            results.append(result)

        # Create comprehensive audit log entry
        event_type = "MANUAL_LOCK_APPLIED" if action == "lock" else "MANUAL_LOCK_RELEASED"

        # Prepare lock details with full context
        lock_details = {
            "em_id": em_id,
            "em_name": em.name,
            "scope": scope,
            "action": action,
            "affected_folders": folder_paths,
            "results": results,
            "timestamp": datetime.utcnow().isoformat(),
            "user_role": user_role,
        }

        # Log the audit event with all required context
        self.audit_service.log_manual_lock_event(
            user_id=str(user_id),
            folder_path=f"{em.name}/{scope}",
            lock_action=action,
            lock_reason=reason,
            correlation_id=correlation_id,
            lock_details=lock_details,
            success=True,
        )

        # Also log to the generic event log for MANUAL_LOCK_APPLIED/RELEASED tracking
        self.audit_service.log_event(
            user_id=str(user_id),
            action=event_type,
            entity_type="order_em",
            entity_id=str(em_id),
            correlation_id=correlation_id,
            after_state={
                "lock_state": action,
                "scope": scope,
                "folders": folder_paths,
            },
            metadata={
                "reason": reason,
                "affected_folders": folder_paths,
                "user_role": user_role,
                "results": results,
            },
        )

        self.db.commit()

        # Trigger notifications for lock state change
        self._trigger_lock_notification(
            em=em,
            action=action,
            scope=scope,
            user_id=user_id,
            reason=reason,
            correlation_id=correlation_id,
        )

        return {
            "success": True,
            "correlation_id": correlation_id,
            "applied_at": datetime.utcnow().isoformat(),
            "message": f"Manual {action} applied successfully to {scope} folders",
            "affected_folders": results,
        }

    def _get_folder_paths(self, em: OrderEm, scope: str) -> list[str]:
        """Get folder paths based on scope.

        Args:
            em: Order/EM object
            scope: Folder scope

        Returns:
            List of folder paths
        """
        base_path = f"/sites/{em.sharepoint_site_id}/Shared Documents/{em.name}"

        if scope == "experts":
            return [f"{base_path}/Szakértők"]
        elif scope == "deliverables":
            return [f"{base_path}/Eredménytermékek"]
        else:
            return []

    def _apply_lock(
        self,
        em_id: int,
        folder_path: str,
        reason: str,
        user_id: UUID,
        correlation_id: str,
    ) -> dict:
        """Apply lock to a specific folder.

        Args:
            em_id: Order/EM identifier
            folder_path: Path to the folder
            reason: Reason for locking
            user_id: User applying the lock
            correlation_id: Correlation ID

        Returns:
            Lock result
        """
        # Check for existing active lock
        existing_lock = (
            self.db.query(LockState)
            .filter(
                LockState.order_em_id == em_id,
                LockState.folder_path == folder_path,
                LockState.is_active,
                LockState.lock_type == LockType.MANUAL,
            )
            .first()
        )

        if existing_lock:
            # Update existing lock
            existing_lock.lock_reason = reason
            existing_lock.locked_by = user_id
            existing_lock.locked_at = datetime.utcnow()
            existing_lock.updated_at = datetime.utcnow()

            lock_id = existing_lock.id
            is_new = False
        else:
            # Create new lock
            lock = LockState(
                order_em_id=em_id,
                folder_id=uuid4(),
                folder_path=folder_path,
                lock_type=LockType.MANUAL,
                permission_level=PermissionLevel.READ,  # Manual locks set to read-only
                lock_reason=reason,
                locked_by=user_id,
                locked_at=datetime.utcnow(),
                is_active=True,
                is_manual_override=True,
                override_reason=reason,
            )
            self.db.add(lock)
            self.db.flush()

            lock_id = lock.id
            is_new = True

        # Create transition log
        transition_log = LockTransitionLog(
            order_em_id=em_id,
            folder_path=folder_path,
            previous_state="unlocked" if is_new else "locked",
            new_state="locked",
            previous_permission=PermissionLevel.FULL if is_new else PermissionLevel.READ,
            new_permission=PermissionLevel.READ,
            transition_reason=f"Manual lock: {reason}",
            success=True,
            correlation_id=correlation_id,
        )
        self.db.add(transition_log)

        return {
            "folder_path": folder_path,
            "lock_id": str(lock_id),
            "action": "locked",
            "is_new": is_new,
        }

    def _remove_lock(
        self,
        em_id: int,
        folder_path: str,
        reason: str,
        user_id: UUID,
        correlation_id: str,
    ) -> dict:
        """Remove lock from a specific folder.

        Args:
            em_id: Order/EM identifier
            folder_path: Path to the folder
            reason: Reason for unlocking
            user_id: User removing the lock
            correlation_id: Correlation ID

        Returns:
            Unlock result
        """
        # Find active manual lock
        lock = (
            self.db.query(LockState)
            .filter(
                LockState.order_em_id == em_id,
                LockState.folder_path == folder_path,
                LockState.is_active,
                LockState.lock_type == LockType.MANUAL,
            )
            .first()
        )

        if lock:
            # Deactivate the lock
            lock.is_active = False
            lock.removed_at = datetime.utcnow()
            lock.removed_by = user_id
            lock.removal_reason = reason
            lock.updated_at = datetime.utcnow()

            # Create transition log
            transition_log = LockTransitionLog(
                order_em_id=em_id,
                folder_path=folder_path,
                previous_state="locked",
                new_state="unlocked",
                previous_permission=PermissionLevel.READ,
                new_permission=PermissionLevel.FULL,
                transition_reason=f"Manual unlock: {reason}",
                success=True,
                correlation_id=correlation_id,
            )
            self.db.add(transition_log)

            return {
                "folder_path": folder_path,
                "lock_id": str(lock.id),
                "action": "unlocked",
                "was_locked": True,
            }
        else:
            # No active lock found
            return {
                "folder_path": folder_path,
                "lock_id": None,
                "action": "no_change",
                "was_locked": False,
            }

    def get_current_lock_state(self, em_id: int, scope: str) -> dict:
        """Get current lock state for an EM and scope.

        Args:
            em_id: Order/EM identifier
            scope: Folder scope

        Returns:
            Current lock state information
        """
        # Get EM
        em = self.db.query(OrderEm).filter(OrderEm.id == em_id).first()
        if not em:
            raise NotFoundError("OrderEm", em_id)

        # Get folder paths
        folder_paths = self._get_folder_paths(em, scope)

        # Get lock states
        states = []
        for folder_path in folder_paths:
            lock = (
                self.db.query(LockState)
                .filter(
                    LockState.order_em_id == em_id,
                    LockState.folder_path == folder_path,
                    LockState.is_active,
                )
                .order_by(LockState.created_at.desc())
                .first()
            )

            if lock:
                states.append(
                    {
                        "folder_path": folder_path,
                        "is_locked": True,
                        "lock_type": lock.lock_type,
                        "permission_level": lock.permission_level,
                        "locked_at": lock.locked_at.isoformat() if lock.locked_at else None,
                        "lock_reason": lock.lock_reason,
                        "is_manual": lock.lock_type == LockType.MANUAL,
                    }
                )
            else:
                states.append(
                    {
                        "folder_path": folder_path,
                        "is_locked": False,
                        "lock_type": None,
                        "permission_level": PermissionLevel.FULL,
                        "locked_at": None,
                        "lock_reason": None,
                        "is_manual": False,
                    }
                )

        return {
            "em_id": em_id,
            "scope": scope,
            "states": states,
        }

    def check_lock_priority(self, em_id: int, folder_path: str) -> str:
        """Check lock priority for a folder.

        Priority order: Manual > CR > Automatic

        Args:
            em_id: Order/EM identifier
            folder_path: Folder path

        Returns:
            Highest priority lock type or None
        """
        # Check for manual lock first (highest priority)
        manual_lock = (
            self.db.query(LockState)
            .filter(
                LockState.order_em_id == em_id,
                LockState.folder_path == folder_path,
                LockState.is_active,
                LockState.lock_type == LockType.MANUAL,
            )
            .first()
        )

        if manual_lock:
            return "manual"

        # Check for CR lock (medium priority)
        # This would be implemented when CR unlock system is added

        # Check for automatic lock (lowest priority)
        auto_lock = (
            self.db.query(LockState)
            .filter(
                LockState.order_em_id == em_id,
                LockState.folder_path == folder_path,
                LockState.is_active,
                LockState.lock_type == LockType.AUTOMATIC,
            )
            .first()
        )

        if auto_lock:
            return "automatic"

        return None

    def _trigger_lock_notification(
        self,
        em: OrderEm,
        action: str,
        scope: str,
        user_id: UUID,
        reason: str,
        correlation_id: str,
    ) -> None:
        """Trigger notifications for manual lock changes.

        Args:
            em: Order/EM object
            action: Lock action (lock/unlock)
            scope: Folder scope
            user_id: User who performed the action
            reason: Reason for the action
            correlation_id: Correlation ID
        """
        try:
            # Prepare notification event data
            event_data = {
                "event_type": "lock.state.changed",
                "event_id": uuid4(),
                "em_id": em.id,
                "em_name": em.name,
                "action": f"manual_{action}",
                "scope": scope,
                "reason": reason,
                "performed_by": str(user_id),
                "timestamp": datetime.utcnow().isoformat(),
                "correlation_id": correlation_id,
            }

            # Get affected users for notification
            # This would typically query the users who have access to the EM
            # For now, we'll log the event for the notification system to pick up

            # Create notification queue entry
            from api.models.notification import NotificationQueue

            notification = NotificationQueue(
                event_type="MANUAL_LOCK_CHANGE",
                event_data=event_data,
                priority=2,  # High priority for manual lock changes
                created_at=datetime.utcnow(),
                correlation_id=correlation_id,
            )

            self.db.add(notification)
            self.db.flush()

            logger.info(
                f"Notification triggered for manual {action} on {em.name}/{scope}",
                extra={
                    "event_type": "lock.state.changed",
                    "em_id": em.id,
                    "action": action,
                    "correlation_id": correlation_id,
                },
            )

            # Apply de-duplication within 24h window
            # This is handled by the notification service when processing the queue

        except Exception as e:
            # Don't fail the lock operation if notification fails
            logger.error(
                f"Failed to trigger notification for manual lock: {e}",
                extra={
                    "em_id": em.id,
                    "action": action,
                    "correlation_id": correlation_id,
                },
            )
