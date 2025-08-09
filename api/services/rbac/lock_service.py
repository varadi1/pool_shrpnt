"""Manual lock service for SharePoint folders.

Provides functionality for PMs to manually lock/unlock folders,
overriding calculated permissions.
"""

import logging
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.errors import LockError
from api.models.audit import AuditLog
from api.models.lock import LockState, LockType
from api.models.rbac import PermissionAssignment
from api.schemas.lock import LockResponse

logger = logging.getLogger(__name__)


class LockService:
    """Service for managing manual folder locks."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def create_manual_lock(
        self,
        folder_path: str,
        folder_id: UUID,
        locked_by: UUID,
        reason: str,
        expires_in_hours: int | None = None,
        correlation_id: str | None = None,
    ) -> LockResponse:
        """Create a manual lock on a folder.

        Args:
            folder_path: SharePoint folder path
            folder_id: Folder identifier
            locked_by: User ID who is locking
            reason: Reason for locking
            expires_in_hours: Optional expiration time in hours
            correlation_id: Request correlation ID

        Returns:
            Created lock details
        """
        existing_lock = await self._get_active_lock(folder_id)
        if existing_lock:
            if existing_lock.lock_type == LockType.MANUAL:
                raise LockError(f"Folder already manually locked by {existing_lock.locked_by}")
            elif existing_lock.lock_type == LockType.AUTOMATIC:
                await self._override_automatic_lock(existing_lock, locked_by, reason)

        expires_at = None
        if expires_in_hours:
            expires_at = datetime.utcnow() + timedelta(hours=expires_in_hours)

        lock = LockState(
            id=uuid4(),
            folder_id=folder_id,
            folder_path=folder_path,
            locked_by=locked_by,
            locked_at=datetime.utcnow(),
            lock_reason=reason,
            expires_at=expires_at,
            lock_type=LockType.MANUAL,
            is_active=True,
        )

        self.db.add(lock)

        await self._apply_lock_permissions(folder_id, folder_path)

        await self._audit_lock_action(
            "manual_lock_created",
            folder_path,
            locked_by,
            {"reason": reason, "expires_in_hours": expires_in_hours},
            correlation_id,
        )

        await self.db.commit()

        logger.info(f"Manual lock created on {folder_path} by user {locked_by}: {reason}")

        return LockResponse(
            lock_id=lock.id,
            folder_id=folder_id,
            folder_path=folder_path,
            lock_type=LockType.MANUAL,
            locked_by=locked_by,
            locked_at=lock.locked_at,
            lock_reason=reason,
            expires_at=expires_at,
            is_active=True,
        )

    async def remove_lock(
        self,
        lock_id: UUID,
        removed_by: UUID,
        reason: str | None = None,
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        """Remove a lock from a folder.

        Args:
            lock_id: Lock identifier
            removed_by: User removing the lock
            reason: Optional reason for removal
            correlation_id: Request correlation ID

        Returns:
            Removal confirmation
        """
        stmt = select(LockState).where(and_(LockState.id == lock_id, LockState.is_active))
        result = await self.db.execute(stmt)
        lock = result.scalar_one_or_none()

        if not lock:
            raise LockError(f"Active lock not found: {lock_id}")

        if lock.lock_type == LockType.MANUAL and lock.locked_by != removed_by:
            await self._check_override_permission(removed_by)

        lock.is_active = False
        lock.removed_at = datetime.utcnow()
        lock.removed_by = removed_by
        lock.removal_reason = reason

        await self._restore_calculated_permissions(lock.folder_id, lock.folder_path)

        await self._audit_lock_action(
            "lock_removed",
            lock.folder_path,
            removed_by,
            {"lock_id": str(lock_id), "reason": reason},
            correlation_id,
        )

        await self.db.commit()

        logger.info(f"Lock {lock_id} removed from {lock.folder_path} by {removed_by}")

        return {
            "status": "removed",
            "lock_id": str(lock_id),
            "folder_path": lock.folder_path,
            "removed_by": str(removed_by),
            "removed_at": lock.removed_at.isoformat(),
        }

    async def get_active_locks(
        self, folder_id: UUID | None = None, lock_type: LockType | None = None
    ) -> list[LockResponse]:
        """Get active locks, optionally filtered.

        Args:
            folder_id: Optional folder ID filter
            lock_type: Optional lock type filter

        Returns:
            List of active locks
        """
        stmt = select(LockState).where(LockState.is_active)

        if folder_id:
            stmt = stmt.where(LockState.folder_id == folder_id)
        if lock_type:
            stmt = stmt.where(LockState.lock_type == lock_type)

        stmt = stmt.order_by(LockState.locked_at.desc())

        result = await self.db.execute(stmt)
        locks = result.scalars().all()

        responses = []
        for lock in locks:
            if lock.expires_at and lock.expires_at < datetime.utcnow():
                await self._expire_lock(lock)
                continue

            responses.append(
                LockResponse(
                    lock_id=lock.id,
                    folder_id=lock.folder_id,
                    folder_path=lock.folder_path,
                    lock_type=lock.lock_type,
                    locked_by=lock.locked_by,
                    locked_at=lock.locked_at,
                    lock_reason=lock.lock_reason,
                    expires_at=lock.expires_at,
                    is_active=lock.is_active,
                )
            )

        return responses

    async def check_lock_override(self, folder_id: UUID, user_id: UUID) -> dict[str, Any]:
        """Check if a folder's permissions are overridden by a lock.

        Args:
            folder_id: Folder to check
            user_id: User requesting access

        Returns:
            Lock override status
        """
        lock = await self._get_active_lock(folder_id)

        if not lock:
            return {"is_locked": False, "has_override": False}

        if lock.expires_at and lock.expires_at < datetime.utcnow():
            await self._expire_lock(lock)
            return {"is_locked": False, "has_override": False}

        can_access = await self._check_lock_access(lock, user_id)

        return {
            "is_locked": True,
            "has_override": True,
            "lock_type": lock.lock_type.value,
            "locked_by": str(lock.locked_by),
            "lock_reason": lock.lock_reason,
            "can_access": can_access,
            "expires_at": lock.expires_at.isoformat() if lock.expires_at else None,
        }

    async def extend_lock(
        self,
        lock_id: UUID,
        extended_by: UUID,
        additional_hours: int,
        reason: str,
        correlation_id: str | None = None,
    ) -> LockResponse:
        """Extend an existing lock's expiration.

        Args:
            lock_id: Lock to extend
            extended_by: User extending the lock
            additional_hours: Hours to add to expiration
            reason: Reason for extension
            correlation_id: Request correlation ID

        Returns:
            Updated lock details
        """
        stmt = select(LockState).where(and_(LockState.id == lock_id, LockState.is_active))
        result = await self.db.execute(stmt)
        lock = result.scalar_one_or_none()

        if not lock:
            raise LockError(f"Active lock not found: {lock_id}")

        if lock.locked_by != extended_by:
            await self._check_override_permission(extended_by)

        # Check max extension limit
        if additional_hours > settings.lock_max_extension_hours:
            raise LockError(
                f"Extension exceeds maximum allowed ({settings.lock_max_extension_hours} hours)"
            )

        if lock.expires_at:
            new_expiration = lock.expires_at + timedelta(hours=additional_hours)
        else:
            new_expiration = datetime.utcnow() + timedelta(hours=additional_hours)

        lock.expires_at = new_expiration
        lock.last_extended_at = datetime.utcnow()
        lock.last_extended_by = extended_by

        await self._audit_lock_action(
            "lock_extended",
            lock.folder_path,
            extended_by,
            {
                "lock_id": str(lock_id),
                "additional_hours": additional_hours,
                "reason": reason,
                "new_expiration": new_expiration.isoformat(),
            },
            correlation_id,
        )

        await self.db.commit()

        return LockResponse(
            lock_id=lock.id,
            folder_id=lock.folder_id,
            folder_path=lock.folder_path,
            lock_type=lock.lock_type,
            locked_by=lock.locked_by,
            locked_at=lock.locked_at,
            lock_reason=lock.lock_reason,
            expires_at=lock.expires_at,
            is_active=lock.is_active,
        )

    async def _get_active_lock(self, folder_id: UUID) -> LockState | None:
        """Get active lock for a folder."""
        stmt = (
            select(LockState)
            .where(and_(LockState.folder_id == folder_id, LockState.is_active))
            .order_by(LockState.locked_at.desc())
        )

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _override_automatic_lock(
        self, automatic_lock: LockState, override_by: UUID, reason: str
    ) -> None:
        """Override an automatic lock with manual lock."""
        automatic_lock.is_active = False
        automatic_lock.removed_at = datetime.utcnow()
        automatic_lock.removed_by = override_by
        automatic_lock.removal_reason = f"Overridden by manual lock: {reason}"

    async def _apply_lock_permissions(self, folder_id: UUID, folder_path: str) -> None:
        """Apply restrictive permissions when folder is locked."""
        stmt = (
            update(PermissionAssignment)
            .where(
                and_(
                    PermissionAssignment.resource_id == str(folder_id),
                    PermissionAssignment.resource_type == "sharepoint_folder",
                )
            )
            .values(
                is_locked=True,
                lock_applied_at=datetime.utcnow(),
                sharepoint_sync_status="needs_update",
            )
        )
        await self.db.execute(stmt)

    async def _restore_calculated_permissions(self, folder_id: UUID, folder_path: str) -> None:
        """Restore calculated permissions after lock removal."""
        stmt = (
            update(PermissionAssignment)
            .where(
                and_(
                    PermissionAssignment.resource_id == str(folder_id),
                    PermissionAssignment.resource_type == "sharepoint_folder",
                )
            )
            .values(is_locked=False, lock_applied_at=None, sharepoint_sync_status="needs_update")
        )
        await self.db.execute(stmt)

    async def _check_override_permission(self, user_id: UUID) -> None:
        """Check if user has permission to override locks.

        Args:
            user_id: User attempting to override

        Raises:
            LockError: If user lacks permission to override locks
        """
        from api.models.rbac import GroupRoleMapping, Membership, Role
        from api.models.user import User

        # Check if user has PM or Admin role
        user = await self.db.get(User, user_id)
        if not user:
            raise LockError(f"User {user_id} not found")

        # Check for direct PM/Admin role assignment
        stmt = (
            select(Role)
            .join(GroupRoleMapping)
            .join(Membership)
            .where(
                and_(
                    Membership.user_id == str(user_id),
                    Role.name.in_(["PM", "Admin", "ProjectManager"]),
                )
            )
        )
        result = await self.db.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            raise LockError(
                f"User {user.email or user_id} lacks permission to override locks. "
                "PM or Admin role required."
            )

    async def _check_lock_access(self, lock: LockState, user_id: UUID) -> bool:
        """Check if user can access locked folder."""
        if lock.locked_by == user_id:
            return True

        return False

    async def _expire_lock(self, lock: LockState) -> None:
        """Expire a lock that has passed its expiration time."""
        lock.is_active = False
        lock.removed_at = datetime.utcnow()
        lock.removal_reason = "Expired"

        await self._restore_calculated_permissions(lock.folder_id, lock.folder_path)

        await self.db.commit()

        logger.info(f"Lock {lock.id} expired for {lock.folder_path}")

    async def _audit_lock_action(
        self,
        action: str,
        folder_path: str,
        user_id: UUID,
        details: dict[str, Any],
        correlation_id: str | None = None,
    ) -> None:
        """Audit lock-related actions."""
        audit_entry = AuditLog(
            action=action,
            entity_type="folder_lock",
            entity_id=folder_path,
            user_id=str(user_id),
            correlation_id=correlation_id or "unknown",
            extra_metadata=details,
            timestamp=datetime.utcnow(),
        )
        self.db.add(audit_entry)


class LockOverrideEngine:
    """Engine for applying lock overrides to permission calculations."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.lock_service = LockService(db_session)

    async def apply_lock_overrides(
        self, permissions: list[PermissionAssignment], user_id: UUID
    ) -> list[PermissionAssignment]:
        """Apply lock overrides to calculated permissions.

        Args:
            permissions: Calculated permission assignments
            user_id: User context for override evaluation

        Returns:
            Modified permissions with lock overrides applied
        """
        modified_permissions = []

        for permission in permissions:
            folder_id = UUID(permission.resource_id)
            lock_status = await self.lock_service.check_lock_override(folder_id, user_id)

            if lock_status["is_locked"]:
                if not lock_status["can_access"]:
                    continue
                else:
                    permission.permission_type = "read"
                    permission.is_locked = True

            modified_permissions.append(permission)

        return modified_permissions
