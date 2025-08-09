"""Batch processor for RBAC permission operations.

Handles efficient bulk processing of permission changes with
Graph API batching, queue management, and progress tracking.
"""

import asyncio
import logging
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.errors import BatchProcessingError
from api.models.rbac import PermissionAssignment
from api.services.sharepoint.permission_service import (
    PermissionSyncStatus,
    SharePointPermissionService,
)

logger = logging.getLogger(__name__)


class BatchStatus(str, Enum):
    """Batch operation status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class BatchOperation:
    """Represents a batch permission operation."""

    def __init__(self, batch_id: str, operations: list[dict[str, Any]], correlation_id: str):
        self.batch_id = batch_id
        self.operations = operations
        self.correlation_id = correlation_id
        self.status = BatchStatus.PENDING
        self.processed = 0
        self.failed = 0
        self.total = len(operations)
        self.results = []
        self.start_time = None
        self.end_time = None

    def update_progress(self, processed: int, failed: int):
        """Update batch progress."""
        self.processed = processed
        self.failed = failed

        if processed + failed >= self.total:
            if failed == 0:
                self.status = BatchStatus.COMPLETED
            elif processed == 0:
                self.status = BatchStatus.FAILED
            else:
                self.status = BatchStatus.PARTIAL
            self.end_time = datetime.utcnow()

    def get_summary(self) -> dict[str, Any]:
        """Get batch operation summary."""
        duration = None
        if self.start_time and self.end_time:
            duration = (self.end_time - self.start_time).total_seconds()

        return {
            "batch_id": self.batch_id,
            "status": self.status.value,
            "total": self.total,
            "processed": self.processed,
            "failed": self.failed,
            "success_rate": ((self.processed / self.total * 100) if self.total > 0 else 0),
            "duration_seconds": duration,
            "correlation_id": self.correlation_id,
        }


class RBACBatchProcessor:
    """Batch processor for RBAC permission operations."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.permission_service = SharePointPermissionService(db_session)
        self._active_batches: dict[str, BatchOperation] = {}
        self._batch_size = settings.GRAPH_BATCH_SIZE or 20
        self._max_concurrent = settings.MAX_CONCURRENT_GRAPH_REQUESTS or 5
        self._queue = asyncio.Queue(maxsize=1000)
        self._processing = False

    async def queue_permission_changes(
        self, assignments: list[PermissionAssignment], correlation_id: str, priority: int = 5
    ) -> str:
        """Queue permission assignments for batch processing.

        Args:
            assignments: Permission assignments to process
            correlation_id: Request correlation ID
            priority: Processing priority (1=highest, 10=lowest)

        Returns:
            Batch ID for tracking
        """
        batch_id = str(uuid4())

        operations = []
        for assignment in assignments:
            operation = {
                "assignment_id": assignment.id,
                "folder_path": assignment.resource_path,
                "site_id": assignment.resource_id,
                "permissions": self._convert_assignment_to_permissions(assignment),
                "break_inheritance": assignment.requires_unique_permissions,
                "priority": priority,
            }
            operations.append(operation)

        operations.sort(key=lambda x: x["priority"])

        batch = BatchOperation(batch_id, operations, correlation_id)
        self._active_batches[batch_id] = batch

        await self._queue.put(batch)

        if not self._processing:
            asyncio.create_task(self._process_queue())

        logger.info(
            f"Queued batch {batch_id} with {len(operations)} operations "
            f"(correlation_id: {correlation_id})"
        )

        return batch_id

    async def process_immediate(
        self, assignments: list[PermissionAssignment], correlation_id: str
    ) -> dict[str, Any]:
        """Process permission assignments immediately without queueing.

        Args:
            assignments: Permission assignments to process
            correlation_id: Request correlation ID

        Returns:
            Processing results
        """
        batch_id = str(uuid4())

        operations = []
        for assignment in assignments:
            operation = {
                "folder_path": assignment.resource_path,
                "site_id": assignment.resource_id,
                "permissions": self._convert_assignment_to_permissions(assignment),
                "break_inheritance": assignment.requires_unique_permissions,
            }
            operations.append(operation)

        batch = BatchOperation(batch_id, operations, correlation_id)
        batch.status = BatchStatus.PROCESSING
        batch.start_time = datetime.utcnow()

        results = await self._process_batch_operations(batch)

        return {"batch_id": batch_id, "summary": batch.get_summary(), "results": results}

    async def get_batch_status(self, batch_id: str) -> dict[str, Any] | None:
        """Get status of a batch operation.

        Args:
            batch_id: Batch identifier

        Returns:
            Batch status and progress
        """
        batch = self._active_batches.get(batch_id)
        if not batch:
            return None

        return batch.get_summary()

    async def _process_queue(self):
        """Process queued batch operations."""
        self._processing = True

        try:
            while not self._queue.empty():
                batch = await self._queue.get()

                if batch.status != BatchStatus.PENDING:
                    continue

                batch.status = BatchStatus.PROCESSING
                batch.start_time = datetime.utcnow()

                try:
                    await self._process_batch_operations(batch)
                except Exception as e:
                    logger.error(f"Batch {batch.batch_id} processing failed: {str(e)}")
                    batch.status = BatchStatus.FAILED
                    batch.end_time = datetime.utcnow()

        finally:
            self._processing = False

    async def _process_batch_operations(self, batch: BatchOperation) -> list[dict[str, Any]]:
        """Process operations in a batch."""
        semaphore = asyncio.Semaphore(self._max_concurrent)
        results = []
        processed = 0
        failed = 0

        async def process_with_limit(operation):
            async with semaphore:
                return await self._process_single_operation(operation, batch.correlation_id)

        for i in range(0, batch.total, self._batch_size):
            chunk = batch.operations[i : i + self._batch_size]

            chunk_tasks = [process_with_limit(op) for op in chunk]

            chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)

            for result in chunk_results:
                if isinstance(result, Exception):
                    failed += 1
                    results.append({"status": "failed", "error": str(result)})
                else:
                    processed += 1
                    results.append(result)

            batch.update_progress(processed, failed)

            if i + self._batch_size < batch.total:
                await asyncio.sleep(1)

        batch.results = results
        return results

    async def _process_single_operation(
        self, operation: dict[str, Any], correlation_id: str
    ) -> dict[str, Any]:
        """Process a single permission operation."""
        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                result = await self.permission_service.apply_permissions(
                    folder_path=operation["folder_path"],
                    site_id=operation["site_id"],
                    permissions=operation["permissions"],
                    correlation_id=correlation_id,
                    break_inheritance=operation.get("break_inheritance", False),
                )

                if "assignment_id" in operation:
                    await self._update_assignment_status(
                        operation["assignment_id"], PermissionSyncStatus.SYNCED
                    )

                return result

            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = 2**attempt
                    await asyncio.sleep(wait_time)
                else:
                    if "assignment_id" in operation:
                        await self._update_assignment_status(
                            operation["assignment_id"], PermissionSyncStatus.FAILED, str(e)
                        )
                    raise

        raise BatchProcessingError(f"Operation failed after {max_retries} attempts: {last_error}")

    def _convert_assignment_to_permissions(
        self, assignment: PermissionAssignment
    ) -> list[dict[str, Any]]:
        """Convert permission assignment to Graph API format."""
        permissions = []

        if assignment.granted_to_type == "user":
            permissions.append(
                {
                    "recipients": [{"email": assignment.granted_to_id}],
                    "roles": self._map_permission_to_roles(assignment.permission_type),
                }
            )
        elif assignment.granted_to_type == "group":
            permissions.append(
                {
                    "grantedTo": {"group": {"id": assignment.granted_to_id}},
                    "roles": self._map_permission_to_roles(assignment.permission_type),
                }
            )

        return permissions

    def _map_permission_to_roles(self, permission_type: str) -> list[str]:
        """Map internal permission types to SharePoint roles."""
        role_mapping = {
            "read": ["read"],
            "write": ["write"],
            "owner": ["owner"],
            "contribute": ["write"],
            "view": ["read"],
        }
        return role_mapping.get(permission_type.lower(), ["read"])

    async def _update_assignment_status(
        self, assignment_id: UUID, status: PermissionSyncStatus, error: str | None = None
    ) -> None:
        """Update assignment sync status."""
        stmt = (
            update(PermissionAssignment)
            .where(PermissionAssignment.id == assignment_id)
            .values(
                sharepoint_sync_status=status.value,
                last_sync_at=datetime.utcnow(),
                sync_error=error,
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()


class GraphBatchRequest:
    """Helper for creating Graph API batch requests."""

    def __init__(self):
        self.requests = []
        self._request_id = 0

    def add_request(
        self,
        method: str,
        url: str,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> str:
        """Add request to batch."""
        self._request_id += 1
        request_id = str(self._request_id)

        request = {"id": request_id, "method": method.upper(), "url": url}

        if body:
            request["body"] = body
        if headers:
            request["headers"] = headers

        self.requests.append(request)
        return request_id

    def get_batch_body(self) -> dict[str, Any]:
        """Get batch request body for Graph API."""
        return {"requests": self.requests}

    def parse_responses(self, batch_response: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Parse batch response from Graph API."""
        responses = {}

        for response in batch_response.get("responses", []):
            responses[response["id"]] = {
                "status": response.get("status"),
                "body": response.get("body"),
                "headers": response.get("headers", {}),
            }

        return responses
