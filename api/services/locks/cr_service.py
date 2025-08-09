"""Change Request service for temporary CR-based unlocks."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.core.errors import BadRequestError, ConflictError, NotFoundError
from api.models.change_request import ChangeRequest, CRScope, CRStatus
from api.models.contract import OrderEm
from api.models.lock import LockState, LockType, PermissionLevel
from api.services.audit import AuditService
from api.services.locks.manual_lock_service import ManualLockService

if TYPE_CHECKING:
    from api.services.notifications.notification_service import NotificationService
    from api.services.sharepoint.permission_service import SharePointPermissionService

logger = logging.getLogger(__name__)


class CRService:
    """Service for managing Change Requests and CR-based unlocks."""

    def __init__(
        self,
        db: Session,
        notification_service: "NotificationService | None" = None,
        sharepoint_service: "SharePointPermissionService | None" = None,
    ):
        self.db = db
        self.audit_service = AuditService(db)
        self.manual_lock_service = ManualLockService(db)
        self.notification_service = notification_service
        self.sharepoint_service = sharepoint_service

    async def create_cr(
        self,
        em_id: int,
        scope: str,
        reason: str,
        created_by: UUID,
        duration_hours: int = 48,
        correlation_id: UUID | None = None,
    ) -> ChangeRequest:
        """Create a new Change Request and immediately unlock affected folders.

        Args:
            em_id: Order/EM ID
            scope: Scope of unlock ('experts' or 'deliverables')
            reason: Reason for the CR (required, min 20 chars)
            created_by: User ID creating the CR
            duration_hours: Duration of CR in hours (default 48, max 72)
            correlation_id: Correlation ID for audit trail

        Returns:
            Created ChangeRequest

        Raises:
            BadRequestError: Invalid input parameters
            NotFoundError: EM not found
            ConflictError: Unable to create CR
        """
        # Validate inputs
        if scope not in [CRScope.EXPERTS, CRScope.DELIVERABLES]:
            raise BadRequestError(f"Invalid scope: {scope}. Must be 'experts' or 'deliverables'")

        if not reason or len(reason) < 20:
            raise BadRequestError("Reason must be at least 20 characters")

        if duration_hours < 1 or duration_hours > 72:
            raise BadRequestError("Duration must be between 1 and 72 hours")

        # Check EM exists
        order_em = self.db.query(OrderEm).filter_by(id=em_id).first()
        if not order_em:
            raise NotFoundError("OrderEm", em_id)

        # Create CR with database transaction to prevent race conditions
        try:
            # Check for overlapping active CRs
            existing_crs = self._get_active_crs_for_scope(em_id, scope)

            # Calculate expiry time
            now = datetime.now(UTC)
            expires_at = now + timedelta(hours=duration_hours)

            # If there are existing CRs, extend the expiry if needed
            if existing_crs:
                latest_expiry = max(cr.expires_at for cr in existing_crs)
                if expires_at > latest_expiry:
                    logger.info(
                        f"Extending CR unlock period for EM {em_id} scope {scope} "
                        f"from {latest_expiry} to {expires_at}"
                    )

            # Create the CR
            cr = ChangeRequest(
                id=uuid4(),
                em_id=em_id,
                scope=scope,
                reason=reason,
                created_by=created_by,
                created_at=now,
                expires_at=expires_at,
                status=CRStatus.ACTIVE,
                audit_correlation_id=correlation_id or uuid4(),
                duration_hours=duration_hours,
            )

            self.db.add(cr)
            self.db.flush()

            # Apply immediate unlock to affected folders
            await self._apply_cr_unlock(cr)

            # Audit the CR creation
            self.audit_service.log_event(
                user_id=str(created_by),
                action="CR_OPENED",
                entity_type="change_request",
                entity_id=str(cr.id),
                correlation_id=str(cr.audit_correlation_id),
                metadata={
                    "em_id": em_id,
                    "scope": scope,
                    "reason": reason,
                    "expires_at": expires_at.isoformat(),
                    "duration_hours": duration_hours,
                },
            )

            self.db.commit()
            logger.info(f"Created CR {cr.id} for EM {em_id} scope {scope}")

            # Emit notification event for CR creation
            if self.notification_service:
                await self._emit_cr_notification(
                    cr=cr, event_type="lock.cr.opened", created_by=created_by
                )

            return cr

        except IntegrityError as e:
            self.db.rollback()
            logger.error(f"Failed to create CR: {e}")
            raise ConflictError("Failed to create change request")

    async def close_cr(
        self,
        cr_id: UUID,
        closed_by: UUID,
        reason: str | None = None,
        correlation_id: UUID | None = None,
    ) -> ChangeRequest:
        """Manually close a Change Request before expiry.

        Args:
            cr_id: CR ID to close
            closed_by: User ID closing the CR
            reason: Optional reason for early closure
            correlation_id: Correlation ID for audit trail

        Returns:
            Closed ChangeRequest

        Raises:
            NotFoundError: CR not found
            ConflictError: CR already closed or expired
        """
        cr = self.db.query(ChangeRequest).filter_by(id=cr_id).first()
        if not cr:
            raise NotFoundError("ChangeRequest", cr_id)

        if cr.status != CRStatus.ACTIVE:
            raise ConflictError(f"CR is already {cr.status}")

        # Close CR with database transaction
        now = datetime.now(UTC)

        # Update CR status
        cr.status = CRStatus.CLOSED
        cr.closed_at = now
        cr.closed_by = closed_by
        cr.updated_at = now

        # Check if we need to re-lock folders
        # Only re-lock if there are no other active CRs for the same scope
        other_active_crs = (
            self.db.query(ChangeRequest)
            .filter(
                and_(
                    ChangeRequest.em_id == cr.em_id,
                    ChangeRequest.scope == cr.scope,
                    ChangeRequest.status == CRStatus.ACTIVE,
                    ChangeRequest.id != cr.id,
                )
            )
            .all()
        )

        if not other_active_crs:
            # Re-lock the folders
            await self._revert_cr_lock(cr)
        else:
            logger.info(
                f"Not re-locking folders for CR {cr_id} as there are "
                f"{len(other_active_crs)} other active CRs for the same scope"
            )

        # Audit the closure
        self.audit_service.log_event(
            user_id=str(closed_by),
            action="CR_CLOSED",
            entity_type="change_request",
            entity_id=str(cr.id),
            correlation_id=str(correlation_id or uuid4()),
            metadata={
                "em_id": cr.em_id,
                "scope": cr.scope,
                "reason": reason,
                "closed_at": now.isoformat(),
                "other_active_crs": len(other_active_crs),
            },
        )

        self.db.commit()
        logger.info(f"Closed CR {cr.id} manually by user {closed_by}")

        # Emit notification event for CR closure
        if self.notification_service:
            await self._emit_cr_notification(
                cr=cr, event_type="lock.cr.closed", closed_by=closed_by, close_reason=reason
            )

        return cr

    async def get_active_crs(self, em_id: int) -> list[ChangeRequest]:
        """Get all active CRs for an EM.

        Args:
            em_id: Order/EM ID

        Returns:
            List of active ChangeRequests
        """
        return (
            self.db.query(ChangeRequest)
            .filter(and_(ChangeRequest.em_id == em_id, ChangeRequest.status == CRStatus.ACTIVE))
            .order_by(ChangeRequest.created_at.desc())
            .all()
        )

    async def expire_crs(self, correlation_id: UUID | None = None) -> list[ChangeRequest]:
        """Check for expired CRs and process them.

        This method should be called by the scheduler every 15 minutes.

        Args:
            correlation_id: Correlation ID for audit trail

        Returns:
            List of expired ChangeRequests
        """
        now = datetime.now(UTC)

        # Find expired CRs
        expired_crs = (
            self.db.query(ChangeRequest)
            .filter(and_(ChangeRequest.status == CRStatus.ACTIVE, ChangeRequest.expires_at <= now))
            .all()
        )

        processed_crs = []

        for cr in expired_crs:
            try:
                # Update status
                cr.status = CRStatus.EXPIRED
                cr.updated_at = now

                # Check if we need to re-lock
                # Only re-lock if no other active CRs for same scope
                other_active_crs = (
                    self.db.query(ChangeRequest)
                    .filter(
                        and_(
                            ChangeRequest.em_id == cr.em_id,
                            ChangeRequest.scope == cr.scope,
                            ChangeRequest.status == CRStatus.ACTIVE,
                            ChangeRequest.id != cr.id,
                        )
                    )
                    .all()
                )

                if not other_active_crs:
                    await self._revert_cr_lock(cr)
                    logger.info(f"Re-locked folders for expired CR {cr.id}")
                else:
                    logger.info(
                        f"Not re-locking for expired CR {cr.id} due to "
                        f"{len(other_active_crs)} other active CRs"
                    )

                # Audit the expiry
                self.audit_service.log_event(
                    user_id="system",
                    action="CR_EXPIRES",
                    entity_type="change_request",
                    entity_id=str(cr.id),
                    correlation_id=str(correlation_id or uuid4()),
                    metadata={
                        "em_id": cr.em_id,
                        "scope": cr.scope,
                        "expired_at": now.isoformat(),
                        "other_active_crs": len(other_active_crs),
                        "folders_relocked": len(other_active_crs) == 0,
                    },
                )

                processed_crs.append(cr)

                # Emit notification event for CR expiry
                if self.notification_service:
                    await self._emit_cr_notification(cr=cr, event_type="lock.cr.expired")

            except Exception as e:
                logger.error(f"Failed to expire CR {cr.id}: {e}")
                continue

        if processed_crs:
            self.db.commit()
            logger.info(f"Expired {len(processed_crs)} CRs")

        return processed_crs

    def _get_active_crs_for_scope(self, em_id: int, scope: str) -> list[ChangeRequest]:
        """Get all active CRs for a specific EM and scope."""
        return (
            self.db.query(ChangeRequest)
            .filter(
                and_(
                    ChangeRequest.em_id == em_id,
                    ChangeRequest.scope == scope,
                    ChangeRequest.status == CRStatus.ACTIVE,
                )
            )
            .all()
        )

    async def _apply_cr_unlock(self, cr: ChangeRequest):
        """Apply unlock to folders affected by the CR.

        This updates lock_state records to grant write permissions and syncs with SharePoint.
        """
        # Determine folder patterns based on scope
        folder_patterns = self._get_folder_patterns(cr.scope)
        all_lock_states = []

        # Find or create lock states for affected folders
        for pattern in folder_patterns:
            # Find existing lock states
            lock_states = (
                self.db.query(LockState)
                .filter(
                    and_(
                        LockState.order_em_id == cr.em_id,
                        LockState.folder_path.like(pattern),
                        LockState.is_active == True,
                    )
                )
                .all()
            )

            for lock_state in lock_states:
                # Update to write permission
                lock_state.permission_level = PermissionLevel.WRITE
                lock_state.cr_id = cr.id
                lock_state.cr_expires_at = cr.expires_at
                lock_state.cr_reason = cr.reason
                lock_state.lock_type = LockType.MANUAL  # CR unlock is a type of manual override
                lock_state.is_manual_override = True
                lock_state.override_reason = f"CR unlock: {cr.reason}"
                lock_state.updated_at = datetime.now(UTC)

                all_lock_states.append(lock_state)
                logger.debug(f"Updated lock state for {lock_state.folder_path} to WRITE")

        logger.info(f"Applied CR unlock for {len(all_lock_states)} folders in scope {cr.scope}")

        # Sync permissions to SharePoint if service is available
        if self.sharepoint_service and all_lock_states:
            await self._sync_sharepoint_permissions(cr, all_lock_states, is_unlock=True)

    async def _revert_cr_lock(self, cr: ChangeRequest):
        """Revert folders back to read-only after CR expires or closes.

        This updates lock_state records to revoke write permissions and syncs with SharePoint.
        """
        # Find lock states affected by this CR
        lock_states = (
            self.db.query(LockState)
            .filter(and_(LockState.cr_id == cr.id, LockState.is_active == True))
            .all()
        )

        for lock_state in lock_states:
            # Revert to read-only
            lock_state.permission_level = PermissionLevel.READ
            lock_state.cr_id = None
            lock_state.cr_expires_at = None
            lock_state.cr_reason = None
            lock_state.lock_type = LockType.AUTOMATIC
            lock_state.is_manual_override = False
            lock_state.override_reason = None
            lock_state.updated_at = datetime.now(UTC)

            logger.debug(f"Reverted lock state for {lock_state.folder_path} to READ")

        logger.info(f"Reverted CR lock for {len(lock_states)} folders")

        # Sync permissions to SharePoint if service is available
        if self.sharepoint_service and lock_states:
            await self._sync_sharepoint_permissions(cr, lock_states, is_unlock=False)

    def _get_folder_patterns(self, scope: str) -> list[str]:
        """Get folder path patterns based on CR scope.

        Args:
            scope: 'experts' or 'deliverables'

        Returns:
            List of SQL LIKE patterns for folder paths
        """
        if scope == CRScope.EXPERTS:
            # Szakértők folders
            return ["%/2. Szakértők/%", "%/Szakértők/%", "%/experts/%"]
        elif scope == CRScope.DELIVERABLES:
            # Eredménytermékek folders
            return ["%/3. Eredménytermékek/%", "%/Eredménytermékek/%", "%/deliverables/%"]
        else:
            return []

    async def _emit_cr_notification(
        self,
        cr: ChangeRequest,
        event_type: str,
        created_by: UUID | None = None,
        closed_by: UUID | None = None,
        close_reason: str | None = None,
    ):
        """Emit notification events for CR operations.

        Args:
            cr: Change Request object
            event_type: Type of event ('lock.cr.opened', 'lock.cr.closed', 'lock.cr.expired')
            created_by: User who created the CR (for opened events)
            closed_by: User who closed the CR (for closed events)
            close_reason: Reason for early closure (for closed events)
        """
        try:
            # Get order/EM details for context
            order_em = self.db.query(OrderEm).filter_by(id=cr.em_id).first()
            if not order_em:
                logger.warning(f"Could not find OrderEm {cr.em_id} for CR notification")
                return

            # Prepare notification variables
            variables = {
                "cr_id": str(cr.id),
                "em_id": cr.em_id,
                "em_name": order_em.name if order_em else f"EM-{cr.em_id}",
                "scope": cr.scope,
                "reason": cr.reason,
                "created_at": cr.created_at.isoformat(),
                "expires_at": cr.expires_at.isoformat(),
                "duration_hours": cr.duration_hours,
            }

            # Add event-specific variables
            if event_type == "lock.cr.closed" and close_reason:
                variables["close_reason"] = close_reason
            if closed_by:
                variables["closed_by"] = str(closed_by)

            # Determine template key based on event type
            template_key = {
                "lock.cr.opened": "cr_opened",
                "lock.cr.closed": "cr_closed",
                "lock.cr.expired": "cr_expired",
            }.get(event_type, "cr_event")

            # Resolve recipients - notify PM and affected partners
            recipients = await self.notification_service.resolve_recipients(
                roles=["NEU_PM", "PARTNER_ADMIN"],
                em_id=cr.em_id,
                partner_id=order_em.partner_id if order_em else None,
            )

            # Queue notifications with de-duplication
            await self.notification_service.queue_notification(
                template_key=template_key,
                recipients=recipients,
                variables=variables,
                priority=3,  # High priority for CR events
                event_type=event_type,
                event_id=cr.id,
                bypass_dedup=False,  # Allow de-duplication within 24h window
            )

            logger.info(f"Emitted {event_type} notification for CR {cr.id}")

        except Exception as e:
            # Don't let notification failures break the CR flow
            logger.error(f"Failed to emit CR notification: {e}")
            # Continue without raising

    async def _sync_sharepoint_permissions(
        self, cr: ChangeRequest, lock_states: list[LockState], is_unlock: bool
    ):
        """Sync permission changes to SharePoint via Graph API.

        Args:
            cr: Change Request triggering the sync
            lock_states: List of lock states to sync
            is_unlock: True for unlock (grant write), False for lock (revoke write)
        """
        if not self.sharepoint_service:
            logger.warning("SharePoint service not available, skipping permission sync")
            return

        try:
            # Get order/EM details for SharePoint context
            order_em = self.db.query(OrderEm).filter_by(id=cr.em_id).first()
            if not order_em or not order_em.sharepoint_site_id:
                logger.warning(f"No SharePoint site configured for EM {cr.em_id}")
                return

            site_id = order_em.sharepoint_site_id
            correlation_id = str(cr.audit_correlation_id)

            # Process each folder with exponential backoff for throttling
            sync_results = []
            max_retries = 3

            for lock_state in lock_states:
                retry_count = 0
                success = False

                while retry_count < max_retries and not success:
                    try:
                        # Prepare permission changes based on lock state
                        if is_unlock:
                            # Grant write permissions to affected groups
                            permissions = [
                                {
                                    "group_id": lock_state.group_id,
                                    "roles": ["write"],
                                    "action": "grant",
                                }
                                for group_id in self._get_affected_groups(cr.scope, order_em)
                            ]
                        else:
                            # Revoke write permissions (revert to read-only)
                            permissions = [
                                {
                                    "group_id": lock_state.group_id,
                                    "roles": ["read"],
                                    "action": "update",
                                }
                                for group_id in self._get_affected_groups(cr.scope, order_em)
                            ]

                        # Apply permissions via SharePoint service
                        result = await self.sharepoint_service.apply_permissions(
                            folder_path=lock_state.folder_path,
                            site_id=site_id,
                            permissions=permissions,
                            correlation_id=correlation_id,
                            break_inheritance=is_unlock,  # Break inheritance when unlocking
                            user_id=str(cr.created_by) if cr.created_by else None,
                        )

                        sync_results.append(result)
                        success = True

                        # Update sync status in lock_state
                        lock_state.sharepoint_sync_status = "synced"
                        lock_state.sharepoint_sync_at = datetime.now(UTC)

                        logger.info(
                            f"Successfully synced permissions for {lock_state.folder_path} "
                            f"(CR: {cr.id}, action: {'unlock' if is_unlock else 'lock'})"
                        )

                    except Exception as e:
                        retry_count += 1
                        if "429" in str(e) or "throttl" in str(e).lower():
                            # Graph API throttling - exponential backoff
                            wait_time = (2**retry_count) + (retry_count * 0.1)  # Add jitter
                            logger.warning(
                                f"Graph API throttling, waiting {wait_time}s before retry "
                                f"({retry_count}/{max_retries})"
                            )
                            await asyncio.sleep(wait_time)
                        else:
                            logger.error(
                                f"Failed to sync permissions for {lock_state.folder_path}: {e}"
                            )
                            lock_state.sharepoint_sync_status = "failed"
                            lock_state.sharepoint_sync_error = str(e)[:500]
                            break

            # Commit sync status updates
            self.db.flush()

            logger.info(
                f"Completed SharePoint sync for CR {cr.id}: "
                f"{len([r for r in sync_results if r.get('status') == 'success'])} succeeded, "
                f"{len([r for r in sync_results if r.get('status') != 'success'])} failed"
            )

        except Exception as e:
            # Don't let SharePoint sync failures break the CR flow
            logger.error(f"SharePoint permission sync failed for CR {cr.id}: {e}")
            # Continue without raising

    def _get_affected_groups(self, scope: str, order_em: OrderEm) -> list[str]:
        """Get SharePoint group IDs affected by the CR scope.

        Args:
            scope: CR scope ('experts' or 'deliverables')
            order_em: Order/EM object containing group mappings

        Returns:
            List of SharePoint group IDs
        """
        # This would typically fetch from a mapping table or configuration
        # For now, return placeholder groups based on scope
        if scope == CRScope.EXPERTS:
            # Groups that have access to Szakértők folders
            return order_em.expert_group_ids if hasattr(order_em, "expert_group_ids") else []
        elif scope == CRScope.DELIVERABLES:
            # Groups that have access to Eredménytermékek folders
            return (
                order_em.deliverable_group_ids if hasattr(order_em, "deliverable_group_ids") else []
            )
        else:
            return []
