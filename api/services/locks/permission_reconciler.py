"""SharePoint permission reconciler for lock state synchronization.

Reconciles lock states with SharePoint permissions, handling retries,
compensation, and event emission for state changes.
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.errors import GraphAPIError
from api.integrations.graph.retry_adapter import GraphRetryAdapter
from api.models.audit import AuditLog
from api.models.contract import OrderEm
from api.models.lock import LockState
from api.services.sharepoint.permission_service import SharePointPermissionService
from api.services.telemetry.graph_metrics import get_metrics_collector

logger = logging.getLogger(__name__)


class SyncStatus(str, Enum):
    """Permission sync status."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATING = "compensating"


class RetryPolicy:
    """Retry policy configuration for permission sync."""

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        exponential_base: float = 2.0,
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.retry_count = 0
        self.failures: list[dict[str, Any]] = []

    def get_next_delay(self) -> float:
        """Calculate next retry delay with exponential backoff."""
        if self.retry_count >= self.max_retries:
            return 0

        delay = min(self.base_delay * (self.exponential_base**self.retry_count), self.max_delay)
        self.retry_count += 1
        return delay

    def record_failure(self, error: Exception, context: dict[str, Any]):
        """Record failure for audit trail."""
        self.failures.append(
            {
                "attempt": self.retry_count,
                "error": str(error),
                "context": context,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

    def should_retry(self) -> bool:
        """Check if we should retry."""
        return self.retry_count < self.max_retries


class DeadLetterQueue:
    """Dead letter queue for persistent failures."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.queue_name = "lock_permission_sync_dlq"

    async def add_failed_sync(
        self,
        lock_state_id: uuid.UUID,
        order_em_id: int,
        folder_path: str,
        error: str,
        retry_policy: RetryPolicy,
    ) -> None:
        """Add failed sync to dead letter queue."""
        audit_entry = AuditLog(
            entity_type="lock_permission_sync",
            entity_id=str(lock_state_id),
            action="dlq_enqueue",
            actor="system",
            details={
                "queue": self.queue_name,
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "error": error,
                "retry_attempts": retry_policy.retry_count,
                "failure_history": retry_policy.failures,
            },
            timestamp=datetime.now(UTC),
        )
        self.db.add(audit_entry)
        await self.db.flush()

        logger.error(
            f"Added to DLQ: lock_state={lock_state_id}, folder={folder_path}",
            extra={
                "lock_state_id": str(lock_state_id),
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "retry_count": retry_policy.retry_count,
            },
        )

    async def get_failed_syncs(self, limit: int = 100) -> list[dict[str, Any]]:
        """Retrieve failed syncs from DLQ for manual intervention."""
        query = (
            select(AuditLog)
            .where(
                and_(
                    AuditLog.entity_type == "lock_permission_sync",
                    AuditLog.action == "dlq_enqueue",
                )
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
        )

        result = await self.db.execute(query)
        audits = result.scalars().all()

        return [
            {
                "id": audit.id,
                "lock_state_id": audit.entity_id,
                "details": audit.details,
                "timestamp": audit.timestamp,
            }
            for audit in audits
        ]


class EventEmitter:
    """Event emitter for lock state changes."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.event_queue: list[dict[str, Any]] = []

    async def emit_state_changed(
        self,
        order_em_id: int,
        folder_path: str,
        old_state: str,
        new_state: str,
        permission_level: str,
        affected_users: list[str],
        change_type: str,
    ):
        """Emit lock.state.changed event."""
        event = {
            "event_type": "lock.state.changed",
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.now(UTC).isoformat(),
            "payload": {
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "old_state": old_state,
                "new_state": new_state,
                "permission_level": permission_level,
                "affected_users": affected_users,
                "change_type": change_type,  # automatic, manual, cr_override
            },
        }

        self.event_queue.append(event)

        # Log event for audit
        audit_entry = AuditLog(
            entity_type="lock_state_event",
            entity_id=str(order_em_id),
            action="event_emitted",
            actor="system",
            details=event,
            timestamp=datetime.now(UTC),
        )
        self.db.add(audit_entry)

        logger.info(
            f"Event emitted: lock.state.changed for {folder_path}",
            extra={
                "event_id": event["event_id"],
                "order_em_id": order_em_id,
                "folder_path": folder_path,
                "new_state": new_state,
            },
        )

    async def flush_events(self):
        """Flush queued events to event bus/notification system."""
        if not self.event_queue:
            return

        # In production, this would publish to an event bus (e.g., Redis Pub/Sub, RabbitMQ)
        # For now, we'll store them in the audit log
        for event in self.event_queue:
            logger.info(f"Publishing event: {event['event_type']}", extra=event)

        # Clear the queue
        self.event_queue.clear()
        await self.db.flush()


class PermissionReconciler:
    """Reconciles lock states with SharePoint permissions."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.sp_service = SharePointPermissionService(db_session)
        self.metrics_collector = get_metrics_collector(db_session)
        self.graph_adapter = GraphRetryAdapter(metrics_collector=self.metrics_collector)
        self.dlq = DeadLetterQueue(db_session)
        self.event_emitter = EventEmitter(db_session)
        self.monitoring_metrics = {
            "syncs_attempted": 0,
            "syncs_succeeded": 0,
            "syncs_failed": 0,
            "compensations_triggered": 0,
        }

    async def sync_lock_permissions(
        self,
        lock_states: list[LockState],
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        """Sync lock states to SharePoint permissions.

        Args:
            lock_states: List of lock states to sync
            correlation_id: Optional correlation ID for tracing

        Returns:
            Sync results including successes and failures
        """
        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        logger.info(
            f"Starting permission sync for {len(lock_states)} lock states",
            extra={"correlation_id": correlation_id, "count": len(lock_states)},
        )

        results = {
            "correlation_id": correlation_id,
            "total": len(lock_states),
            "succeeded": 0,
            "failed": 0,
            "compensated": 0,
            "failures": [],
        }

        # Group by order EM for batch processing
        em_groups = {}
        for state in lock_states:
            if state.order_em_id not in em_groups:
                em_groups[state.order_em_id] = []
            em_groups[state.order_em_id].append(state)

        # Process each EM group
        for em_id, states in em_groups.items():
            try:
                em_result = await self._sync_em_permissions(em_id, states, correlation_id)
                results["succeeded"] += em_result["succeeded"]
                results["failed"] += em_result["failed"]
                results["compensated"] += em_result["compensated"]
                results["failures"].extend(em_result["failures"])
            except Exception as e:
                logger.error(
                    f"Failed to sync permissions for EM {em_id}: {e}",
                    extra={"order_em_id": em_id, "error": str(e)},
                )
                results["failed"] += len(states)
                results["failures"].append(
                    {
                        "order_em_id": em_id,
                        "error": str(e),
                        "states_affected": len(states),
                    }
                )

        # Update monitoring metrics
        self.monitoring_metrics["syncs_attempted"] += results["total"]
        self.monitoring_metrics["syncs_succeeded"] += results["succeeded"]
        self.monitoring_metrics["syncs_failed"] += results["failed"]
        self.monitoring_metrics["compensations_triggered"] += results["compensated"]

        # Flush events
        await self.event_emitter.flush_events()

        logger.info(
            f"Permission sync completed: {results['succeeded']}/{results['total']} succeeded",
            extra=results,
        )

        return results

    async def _sync_em_permissions(
        self,
        order_em_id: int,
        lock_states: list[LockState],
        correlation_id: str,
    ) -> dict[str, Any]:
        """Sync permissions for a single EM."""
        # Get EM details
        query = select(OrderEm).where(OrderEm.id == order_em_id)
        result = await self.db.execute(query)
        em = result.scalar_one_or_none()

        if not em:
            logger.error(f"Order EM {order_em_id} not found")
            return {
                "succeeded": 0,
                "failed": len(lock_states),
                "compensated": 0,
                "failures": [{"error": f"EM {order_em_id} not found"}],
            }

        result = {
            "succeeded": 0,
            "failed": 0,
            "compensated": 0,
            "failures": [],
        }

        # Get SharePoint site and drive info from EM
        site_id = em.sharepoint_site_id
        drive_id = em.sharepoint_drive_id

        if not site_id or not drive_id:
            logger.error(f"SharePoint info missing for EM {order_em_id}")
            return {
                "succeeded": 0,
                "failed": len(lock_states),
                "compensated": 0,
                "failures": [{"error": "SharePoint configuration missing"}],
            }

        # Process each lock state
        for state in lock_states:
            retry_policy = RetryPolicy()
            sync_succeeded = False
            last_exception: Exception | None = None

            while retry_policy.should_retry() and not sync_succeeded:
                try:
                    await self._apply_single_permission(state, site_id, drive_id, correlation_id)

                    # Emit state changed event
                    await self.event_emitter.emit_state_changed(
                        order_em_id=order_em_id,
                        folder_path=state.folder_path,
                        old_state=state.current_state,
                        new_state=state.current_state,
                        permission_level=state.permission_level,
                        affected_users=await self._get_affected_users(em),
                        change_type=state.lock_type,
                    )

                    # Update sync status
                    state.sharepoint_sync_status = SyncStatus.COMPLETED
                    state.sharepoint_sync_at = datetime.now(UTC)
                    await self.db.flush()

                    result["succeeded"] += 1
                    sync_succeeded = True

                except GraphAPIError as e:
                    if e.status_code == 429:  # Rate limited
                        delay = retry_policy.get_next_delay()
                        logger.warning(
                            f"Rate limited, retrying in {delay}s",
                            extra={"folder": state.folder_path, "delay": delay},
                        )
                        await asyncio.sleep(delay)
                        retry_policy.record_failure(e, {"folder": state.folder_path})
                    else:
                        # Non-retryable error
                        last_exception = e
                        await self._handle_sync_failure(state, e, retry_policy, result)
                        break

                except Exception as e:
                    delay = retry_policy.get_next_delay()
                    last_exception = e
                    if delay > 0:
                        logger.warning(
                            f"Sync failed, retrying in {delay}s: {e}",
                            extra={"folder": state.folder_path, "delay": delay},
                        )
                        await asyncio.sleep(delay)
                        retry_policy.record_failure(e, {"folder": state.folder_path})
                    else:
                        # Max retries exceeded
                        await self._handle_sync_failure(state, e, retry_policy, result)

            # If retries exhausted without success and failure not handled in loop, handle now
            if not sync_succeeded and state.sharepoint_sync_status != SyncStatus.FAILED:
                await self._handle_sync_failure(
                    state,
                    last_exception or Exception("Permission sync failed after retries"),
                    retry_policy,
                    result,
                )

        return result

    async def _apply_single_permission(
        self,
        lock_state: LockState,
        site_id: str,
        drive_id: str,
        correlation_id: str,
    ):
        """Apply permission for a single lock state."""
        # Map lock permission level to SharePoint roles
        permission_mapping = {
            "full_access": ["read", "write", "delete"],
            "limited_access": ["read", "write"],
            "upload_window": ["read", "write"],
            "readonly": ["read"],
        }

        roles = permission_mapping.get(
            lock_state.permission_level, ["read"]  # Default to read-only
        )

        # Build permission object
        permissions = [
            {
                "roles": roles,
                "grantedToIdentities": [],  # Will be populated based on EM users
            }
        ]

        # Apply via SharePoint service
        result = await self.sp_service.apply_permissions(
            folder_path=lock_state.folder_path,
            site_id=site_id,
            permissions=permissions,
            correlation_id=correlation_id,
            break_inheritance=True,  # Always break inheritance for locked folders
        )

        logger.info(
            f"Applied permissions to {lock_state.folder_path}",
            extra={
                "folder": lock_state.folder_path,
                "permission_level": lock_state.permission_level,
                "result": result,
            },
        )

    async def _handle_sync_failure(
        self,
        lock_state: LockState,
        error: Exception,
        retry_policy: RetryPolicy,
        result: dict[str, Any],
    ):
        """Handle sync failure with compensation and DLQ."""
        logger.error(
            f"Failed to sync permissions for {lock_state.folder_path}: {error}",
            extra={
                "lock_state_id": str(lock_state.id),
                "folder": lock_state.folder_path,
                "retry_count": retry_policy.retry_count,
            },
        )

        # Update sync status
        lock_state.sharepoint_sync_status = SyncStatus.FAILED
        lock_state.sharepoint_sync_error = str(error)
        await self.db.flush()

        # Add to DLQ for persistent failures
        await self.dlq.add_failed_sync(
            lock_state_id=lock_state.id,
            order_em_id=lock_state.order_em_id,
            folder_path=lock_state.folder_path,
            error=str(error),
            retry_policy=retry_policy,
        )

        # Attempt compensation
        if await self._attempt_compensation(lock_state):
            result["compensated"] += 1
        else:
            result["failed"] += 1
        # Count every handled failure (compensated or not) as a failed sync attempt
        self.monitoring_metrics["syncs_failed"] += 1

        result["failures"].append(
            {
                "lock_state_id": str(lock_state.id),
                "folder": lock_state.folder_path,
                "error": str(error),
                "retry_attempts": retry_policy.retry_count,
            }
        )

    async def _attempt_compensation(self, lock_state: LockState) -> bool:
        """Attempt compensation for failed sync."""
        try:
            # For now, mark state as needing manual review
            lock_state.sharepoint_sync_status = SyncStatus.COMPENSATING
            lock_state.needs_manual_review = True
            await self.db.flush()

            # Log compensation attempt
            audit_entry = AuditLog(
                entity_type="lock_permission_sync",
                entity_id=str(lock_state.id),
                action="compensation_triggered",
                actor="system",
                details={
                    "folder_path": lock_state.folder_path,
                    "permission_level": lock_state.permission_level,
                },
                timestamp=datetime.now(UTC),
            )
            self.db.add(audit_entry)
            await self.db.flush()

            logger.info(
                f"Compensation triggered for {lock_state.folder_path}",
                extra={"lock_state_id": str(lock_state.id)},
            )

            return True

        except Exception as e:
            logger.error(
                f"Compensation failed for {lock_state.folder_path}: {e}",
                extra={"lock_state_id": str(lock_state.id)},
            )
            return False

    async def _get_affected_users(self, em: OrderEm) -> list[str]:
        """Get list of users affected by permission change."""
        # This would query the actual user assignments for the EM
        # For now, return a placeholder
        return ["team_members", "em_owner", "reviewers"]

    async def reconcile_permissions(
        self,
        order_em_id: int,
    ) -> dict[str, Any]:
        """Reconcile all permissions for an EM with SharePoint.

        Compares database state with actual SharePoint permissions
        and corrects any drift.
        """
        logger.info(f"Starting permission reconciliation for EM {order_em_id}")

        # Get all active lock states for the EM
        query = select(LockState).where(
            and_(
                LockState.order_em_id == order_em_id,
                LockState.is_active.is_(True),
            )
        )
        result = await self.db.execute(query)
        lock_states = result.scalars().all()

        if not lock_states:
            return {
                "status": "no_locks",
                "message": f"No active locks for EM {order_em_id}",
            }

        # Get EM details
        em_query = select(OrderEm).where(OrderEm.id == order_em_id)
        em_result = await self.db.execute(em_query)
        em = em_result.scalar_one_or_none()

        if not em or not em.sharepoint_site_id:
            return {
                "status": "error",
                "message": "EM or SharePoint configuration not found",
            }

        reconciliation_results = {
            "order_em_id": order_em_id,
            "total_folders": len(lock_states),
            "drift_detected": 0,
            "drift_corrected": 0,
            "errors": [],
        }

        for lock_state in lock_states:
            try:
                # Get current SharePoint permissions
                current_perms = await self._get_sharepoint_permissions(
                    em.sharepoint_site_id,
                    lock_state.folder_path,
                )

                # Compare with expected permissions
                expected_perms = self._get_expected_permissions(lock_state)

                if not self._permissions_match(current_perms, expected_perms):
                    reconciliation_results["drift_detected"] += 1

                    # Apply correct permissions
                    await self._apply_single_permission(
                        lock_state,
                        em.sharepoint_site_id,
                        em.sharepoint_drive_id,
                        f"reconcile_{order_em_id}",
                    )
                    reconciliation_results["drift_corrected"] += 1

                    logger.info(
                        f"Corrected permission drift for {lock_state.folder_path}",
                        extra={
                            "folder": lock_state.folder_path,
                            "expected": expected_perms,
                            "actual": current_perms,
                        },
                    )

            except Exception as e:
                logger.error(
                    f"Reconciliation failed for {lock_state.folder_path}: {e}",
                    extra={"folder": lock_state.folder_path, "error": str(e)},
                )
                reconciliation_results["errors"].append(
                    {
                        "folder": lock_state.folder_path,
                        "error": str(e),
                    }
                )

        # Log reconciliation results
        audit_entry = AuditLog(
            entity_type="permission_reconciliation",
            entity_id=str(order_em_id),
            action="reconciliation_completed",
            actor="system",
            details=reconciliation_results,
            timestamp=datetime.now(UTC),
        )
        self.db.add(audit_entry)
        await self.db.flush()

        return reconciliation_results

    async def _get_sharepoint_permissions(
        self,
        site_id: str,
        folder_path: str,
    ) -> dict[str, Any]:
        """Get current permissions from SharePoint."""
        # This would call Graph API to get actual permissions
        # Placeholder for now
        return {"roles": ["read"]}

    def _get_expected_permissions(self, lock_state: LockState) -> dict[str, Any]:
        """Get expected permissions based on lock state."""
        permission_mapping = {
            "full_access": ["read", "write", "delete"],
            "limited_access": ["read", "write"],
            "upload_window": ["read", "write"],
            "readonly": ["read"],
        }

        return {"roles": permission_mapping.get(lock_state.permission_level, ["read"])}

    def _permissions_match(
        self,
        current: dict[str, Any],
        expected: dict[str, Any],
    ) -> bool:
        """Check if permissions match."""
        return set(current.get("roles", [])) == set(expected.get("roles", []))

    def get_monitoring_metrics(self) -> dict[str, Any]:
        """Get monitoring metrics for dashboards."""
        return {
            "timestamp": datetime.now(UTC).isoformat(),
            "metrics": self.monitoring_metrics,
        }
