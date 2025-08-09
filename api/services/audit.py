from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from api.core.logging import get_logger
from api.models.audit import AuditLog

logger = get_logger(__name__)


class AuditService:
    def __init__(self, session: Session):
        self.session = session

    def log_event(
        self,
        user_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        correlation_id: str,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
        success: bool = True,
        error_message: str | None = None,
        duration_ms: int | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Log an audit event to the database.

        Args:
            user_id: ID of the user performing the action
            action: Action being performed (e.g., 'create_contract', 'provision_order')
            entity_type: Type of entity (e.g., 'contract', 'order', 'job')
            entity_id: ID of the entity
            correlation_id: Correlation ID for request tracing
            before_state: State before the change
            after_state: State after the change
            success: Whether the action was successful
            error_message: Error message if action failed
            duration_ms: Duration of the operation in milliseconds
            ip_address: IP address of the request
            user_agent: User agent string
            metadata: Additional metadata

        Returns:
            Created audit log entry
        """
        # Calculate changes if both states provided
        changes = None
        if before_state and after_state:
            changes = self._calculate_changes(before_state, after_state)

        audit_entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            correlation_id=correlation_id,
            before_state=before_state,
            after_state=after_state,
            changes=changes,
            success="true" if success else "false",
            error_message=error_message,
            duration_ms=duration_ms,
            ip_address=ip_address,
            user_agent=user_agent,
            extra_metadata=metadata,
            timestamp=datetime.utcnow(),
        )

        self.session.add(audit_entry)
        self.session.commit()
        self.session.refresh(audit_entry)

        logger.info(
            f"Audit event logged: {action} on {entity_type}:{entity_id}",
            extra={
                "audit_id": audit_entry.id,
                "correlation_id": correlation_id,
                "user_id": user_id,
                "action": action,
            },
        )

        return audit_entry

    def _calculate_changes(
        self, before_state: dict[str, Any], after_state: dict[str, Any]
    ) -> dict[str, Any]:
        """Calculate what changed between two states.

        Args:
            before_state: State before change
            after_state: State after change

        Returns:
            Dictionary of changes
        """
        changes = {}

        # Find modified fields
        for key in after_state:
            if key in before_state:
                if before_state[key] != after_state[key]:
                    changes[key] = {
                        "before": before_state[key],
                        "after": after_state[key],
                    }
            else:
                changes[key] = {
                    "before": None,
                    "after": after_state[key],
                }

        # Find removed fields
        for key in before_state:
            if key not in after_state:
                changes[key] = {
                    "before": before_state[key],
                    "after": None,
                }

        return changes

    def log_provisioning_event(
        self,
        order_id: int,
        job_id: str,
        phase: str,
        status: str,
        correlation_id: str,
        user_id: str,
        details: dict[str, Any] | None = None,
        error: str | None = None,
        duration_ms: int | None = None,
    ) -> AuditLog:
        """Log a provisioning-specific audit event.

        Args:
            order_id: Order ID being provisioned
            job_id: Job ID for the provisioning task
            phase: Current phase of provisioning
            status: Status of the phase
            correlation_id: Correlation ID
            user_id: User who triggered provisioning
            details: Additional details
            error: Error message if failed
            duration_ms: Duration of the phase

        Returns:
            Created audit log entry
        """
        action = f"provisioning_{phase}"
        metadata = {
            "job_id": job_id,
            "phase": phase,
            "status": status,
        }
        if details:
            metadata["details"] = details

        return self.log_event(
            user_id=user_id,
            action=action,
            entity_type="order",
            entity_id=str(order_id),
            correlation_id=correlation_id,
            success=(status != "failed"),
            error_message=error,
            duration_ms=duration_ms,
            extra_metadata=metadata,
        )

    def log_permission_change(
        self,
        user_id: str,
        folder_path: str,
        order_em_id: str,
        action_type: str,
        permission_changes: dict[str, Any],
        correlation_id: str,
        graph_response: dict[str, Any] | None = None,
        success: bool = True,
        error: str | None = None,
        duration_ms: int | None = None,
    ) -> AuditLog:
        """Log a SharePoint permission change event.

        Args:
            user_id: User performing the change
            folder_path: SharePoint folder path
            order_em_id: Order EM ID
            action_type: Type of permission action
            permission_changes: Details of permission changes
            correlation_id: Correlation ID
            graph_response: Graph API response
            success: Whether operation succeeded
            error: Error message if failed
            duration_ms: Operation duration

        Returns:
            Created audit log entry
        """
        action = f"permission_{action_type}"
        metadata = {
            "folder_path": folder_path,
            "permission_changes": permission_changes,
        }
        if graph_response:
            metadata["graph_response"] = graph_response

        return self.log_event(
            user_id=user_id,
            action=action,
            entity_type="sharepoint_folder",
            entity_id=f"{order_em_id}/{folder_path}",
            correlation_id=correlation_id,
            before_state=permission_changes.get("before"),
            after_state=permission_changes.get("after"),
            success=success,
            error_message=error,
            duration_ms=duration_ms,
            metadata=metadata,
        )

    def log_manual_lock_event(
        self,
        user_id: str,
        folder_path: str,
        lock_action: str,
        lock_reason: str,
        correlation_id: str,
        lock_details: dict[str, Any] | None = None,
        success: bool = True,
        error: str | None = None,
    ) -> AuditLog:
        """Log a manual lock/unlock event.

        Args:
            user_id: User performing lock action
            folder_path: Folder being locked/unlocked
            lock_action: lock or unlock
            lock_reason: Reason for lock action
            correlation_id: Correlation ID
            lock_details: Additional lock details
            success: Whether operation succeeded
            error: Error message if failed

        Returns:
            Created audit log entry
        """
        action = f"manual_{lock_action}"
        metadata = {
            "lock_reason": lock_reason,
            "folder_path": folder_path,
        }
        if lock_details:
            metadata["lock_details"] = lock_details

        return self.log_event(
            user_id=user_id,
            action=action,
            entity_type="folder_lock",
            entity_id=folder_path,
            correlation_id=correlation_id,
            after_state={"locked": lock_action == "lock"},
            success=success,
            error_message=error,
            metadata=metadata,
        )

    def log_batch_permission_operation(
        self,
        user_id: str,
        batch_id: str,
        order_em_id: str,
        operation_type: str,
        total_items: int,
        correlation_id: str,
        progress: dict[str, Any] | None = None,
        results: dict[str, Any] | None = None,
        duration_ms: int | None = None,
    ) -> AuditLog:
        """Log a batch permission operation.

        Args:
            user_id: User performing operation
            batch_id: Batch operation ID
            order_em_id: Order EM ID
            operation_type: Type of batch operation
            total_items: Total items in batch
            correlation_id: Correlation ID
            progress: Operation progress details
            results: Operation results
            duration_ms: Total duration

        Returns:
            Created audit log entry
        """
        action = f"batch_permission_{operation_type}"
        metadata = {
            "batch_id": batch_id,
            "total_items": total_items,
            "operation_type": operation_type,
        }
        if progress:
            metadata["progress"] = progress
        if results:
            metadata["results"] = results

        success = results.get("failed", 0) == 0 if results else True

        return self.log_event(
            user_id=user_id,
            action=action,
            entity_type="batch_operation",
            entity_id=batch_id,
            correlation_id=correlation_id,
            after_state=results,
            success=success,
            duration_ms=duration_ms,
            metadata=metadata,
        )

    def log_guest_event(
        self,
        user_id: str,
        guest_id: str,
        guest_email: str,
        action: str,
        correlation_id: str,
        partner_company: str | None = None,
        group_changes: dict[str, Any] | None = None,
        invitation_details: dict[str, Any] | None = None,
        success: bool = True,
        error: str | None = None,
        duration_ms: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Log a guest user management event.

        Args:
            user_id: User performing the action
            guest_id: Guest user ID
            guest_email: Guest email address
            action: Action type (GUEST_INVITED, GUEST_ACCEPTED, GUEST_ASSIGNED, etc.)
            correlation_id: Correlation ID for tracing
            partner_company: Partner company name
            group_changes: Group assignment changes
            invitation_details: Invitation details (redeem URL, expiry, etc.)
            success: Whether operation succeeded
            error: Error message if failed
            duration_ms: Operation duration
            metadata: Additional metadata

        Returns:
            Created audit log entry
        """
        audit_metadata = {
            "guest_email": guest_email,
            "action_type": action,
        }
        if partner_company:
            audit_metadata["partner_company"] = partner_company
        if group_changes:
            audit_metadata["group_changes"] = group_changes
        if invitation_details:
            audit_metadata["invitation_details"] = invitation_details
        if metadata:
            audit_metadata.update(metadata)

        return self.log_event(
            user_id=user_id,
            action=action,
            entity_type="guest_user",
            entity_id=guest_id,
            correlation_id=correlation_id,
            after_state={"status": action},
            success=success,
            error_message=error,
            duration_ms=duration_ms,
            metadata=audit_metadata,
        )

    def log_graph_api_call(
        self,
        correlation_id: str,
        method: str,
        url: str,
        status_code: int | None = None,
        response_headers: dict[str, str] | None = None,
        error: str | None = None,
        duration_ms: int | None = None,
        retry_count: int = 0,
    ) -> AuditLog:
        """Log a Graph API call for traceability.

        Args:
            correlation_id: Correlation ID
            method: HTTP method
            url: API URL
            status_code: Response status code
            response_headers: Response headers
            error: Error message if failed
            duration_ms: Call duration
            retry_count: Number of retries

        Returns:
            Created audit log entry
        """
        action = "graph_api_call"
        metadata = {
            "method": method,
            "url": url,
            "retry_count": retry_count,
        }
        if status_code:
            metadata["status_code"] = status_code
        if response_headers:
            metadata["response_headers"] = response_headers

        success = status_code and 200 <= status_code < 400

        return self.log_event(
            user_id="system",
            action=action,
            entity_type="api_call",
            entity_id=correlation_id,
            correlation_id=correlation_id,
            success=success,
            error_message=error,
            duration_ms=duration_ms,
            metadata=metadata,
        )
