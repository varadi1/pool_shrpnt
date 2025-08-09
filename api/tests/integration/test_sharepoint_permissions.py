"""Integration tests for SharePoint permission application."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.errors import GraphAPIError, PermissionApplicationError
from api.models.lock import LockState, LockType
from api.models.rbac import PermissionAssignment
from api.services.rbac.batch_processor import BatchStatus, RBACBatchProcessor
from api.services.rbac.lock_service import LockOverrideEngine, LockService
from api.services.sharepoint.permission_service import (
    PermissionAction,
    SharePointBulkPermissionProcessor,
    SharePointPermissionService,
)


@pytest.fixture
async def permission_service(db_session: AsyncSession):
    """Create permission service instance."""
    return SharePointPermissionService(db_session)


@pytest.fixture
async def bulk_processor(db_session: AsyncSession):
    """Create bulk processor instance."""
    return SharePointBulkPermissionProcessor(db_session)


@pytest.fixture
async def batch_processor(db_session: AsyncSession):
    """Create batch processor instance."""
    return RBACBatchProcessor(db_session)


@pytest.fixture
async def lock_service(db_session: AsyncSession):
    """Create lock service instance."""
    return LockService(db_session)


@pytest.fixture
def sample_permissions():
    """Sample permission data."""
    return [
        {"recipients": [{"email": "user1@test.com"}], "roles": ["read"]},
        {"grantedTo": {"group": {"id": "group-123"}}, "roles": ["write"]},
    ]


@pytest.fixture
def sample_assignment():
    """Sample permission assignment - not persisted."""
    assignment = PermissionAssignment(
        id=uuid4(),
        folder_path="/contracts/2025/A",
        resource_path="/contracts/2025/A",
        resource_id="site-123",
        resource_type="sharepoint_folder",
        role_id=uuid4(),
        granted_to_id="user1@test.com",
        granted_to_type="user",
        permission_level="read",
        permission_type="read",
        requires_unique_permissions=True,
        sharepoint_sync_status="pending",
    )
    return assignment


class TestSharePointPermissionService:
    """Test SharePoint permission service."""

    @pytest.mark.asyncio
    async def test_apply_permissions_success(self, permission_service, sample_permissions):
        """Test successful permission application."""
        with patch(
            "api.services.sharepoint.permission_service.check_idempotency", return_value=False
        ):
            with patch(
                "api.services.sharepoint.permission_service.mark_operation_complete",
                return_value=None,
            ):
                with patch.object(permission_service, "_get_graph_token", return_value="token123"):
                    with patch.object(
                        permission_service, "_get_drive_item_id", return_value="item-123"
                    ):
                        with patch.object(
                            permission_service, "_break_inheritance", return_value=None
                        ):
                            with patch.object(
                                permission_service, "_get_current_permissions", return_value=[]
                            ):
                                with patch.object(
                                    permission_service, "_apply_permission_action"
                                ) as mock_apply:
                                    mock_apply.return_value = {"status": "success"}

                                    result = await permission_service.apply_permissions(
                                        folder_path="/test/folder",
                                        site_id="site-123",
                                        permissions=sample_permissions,
                                        correlation_id="corr-123",
                                        break_inheritance=True,
                                    )

                                    assert result["status"] == "success"
                                    assert result["folder_path"] == "/test/folder"
                                    assert result["actions_applied"] == 2

    @pytest.mark.asyncio
    async def test_apply_permissions_idempotency(self, permission_service, sample_permissions):
        """Test idempotent permission application."""
        with patch(
            "api.services.sharepoint.permission_service.check_idempotency", return_value=True
        ):
            result = await permission_service.apply_permissions(
                folder_path="/test/folder",
                site_id="site-123",
                permissions=sample_permissions,
                correlation_id="corr-123",
            )

            assert result["status"] == "already_applied"

    @pytest.mark.asyncio
    async def test_break_inheritance(self, permission_service):
        """Test breaking permission inheritance."""
        mock_adapter = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_adapter.post.return_value = mock_response

        permission_service.graph_adapter = mock_adapter

        await permission_service._break_inheritance("site-123", "item-123", "token123", "corr-123")

        mock_adapter.post.assert_called_once()
        call_args = mock_adapter.post.call_args
        assert "breakInheritance" in call_args[1]["json"]

    @pytest.mark.asyncio
    async def test_calculate_permission_changes(self, permission_service):
        """Test permission change calculation."""
        current = [{"id": "perm-1", "grantedTo": {"user": {"id": "user1"}}, "roles": ["read"]}]

        desired = [
            {"grantedTo": {"user": {"id": "user1"}}, "roles": ["write"]},
            {"grantedTo": {"user": {"id": "user2"}}, "roles": ["read"]},
        ]

        changes = permission_service._calculate_permission_changes(current, desired)

        assert len(changes) == 2
        assert any(c["action"] == PermissionAction.UPDATE for c in changes)
        assert any(c["action"] == PermissionAction.GRANT for c in changes)

    @pytest.mark.asyncio
    async def test_handle_graph_api_error(self, permission_service, sample_permissions):
        """Test Graph API error handling."""
        with patch(
            "api.services.sharepoint.permission_service.check_idempotency", return_value=False
        ):
            with patch.object(permission_service, "_get_graph_token", return_value="token123"):
                with patch.object(
                    permission_service, "_get_drive_item_id", side_effect=GraphAPIError("API Error")
                ):
                    with pytest.raises(PermissionApplicationError):
                        await permission_service.apply_permissions(
                            folder_path="/test/folder",
                            site_id="site-123",
                            permissions=sample_permissions,
                            correlation_id="corr-123",
                        )


class TestSharePointBulkProcessor:
    """Test bulk permission processor."""

    @pytest.mark.asyncio
    async def test_process_bulk_permissions(self, bulk_processor):
        """Test bulk permission processing."""
        permission_sets = [
            {
                "folder_path": f"/folder{i}",
                "site_id": "site-123",
                "permissions": [],
                "break_inheritance": False,
            }
            for i in range(5)
        ]

        with patch.object(bulk_processor.permission_service, "apply_permissions") as mock_apply:
            mock_apply.return_value = {"status": "success"}

            result = await bulk_processor.process_bulk_permissions(permission_sets, "corr-123")

            assert result["total"] == 5
            assert result["processed"] == 5
            assert result["failed"] == 0

    @pytest.mark.asyncio
    async def test_bulk_processing_with_failures(self, bulk_processor):
        """Test bulk processing with some failures."""
        permission_sets = [
            {
                "folder_path": f"/folder{i}",
                "site_id": "site-123",
                "permissions": [],
                "break_inheritance": False,
            }
            for i in range(3)
        ]

        with patch.object(bulk_processor.permission_service, "apply_permissions") as mock_apply:
            mock_apply.side_effect = [
                {"status": "success"},
                GraphAPIError("Failed"),
                {"status": "success"},
            ]

            result = await bulk_processor.process_bulk_permissions(permission_sets, "corr-123")

            assert result["total"] == 3
            assert result["processed"] == 2
            assert result["failed"] == 1


class TestRBACBatchProcessor:
    """Test RBAC batch processor."""

    @pytest.mark.asyncio
    async def test_queue_permission_changes(self, batch_processor, sample_assignment):
        """Test queueing permission changes."""
        assignments = [sample_assignment]

        batch_id = await batch_processor.queue_permission_changes(
            assignments, "corr-123", priority=5
        )

        assert batch_id
        assert batch_id in batch_processor._active_batches
        batch = batch_processor._active_batches[batch_id]
        assert batch.total == 1
        assert batch.status == BatchStatus.PENDING

    @pytest.mark.asyncio
    async def test_process_immediate(self, batch_processor, sample_assignment):
        """Test immediate processing."""
        assignments = [sample_assignment]

        with patch.object(batch_processor.permission_service, "apply_permissions") as mock_apply:
            mock_apply.return_value = {"status": "success"}

            result = await batch_processor.process_immediate(assignments, "corr-123")

            assert "batch_id" in result
            assert result["summary"]["total"] == 1
            assert result["summary"]["processed"] == 1

    @pytest.mark.asyncio
    async def test_get_batch_status(self, batch_processor, sample_assignment):
        """Test getting batch status."""
        assignments = [sample_assignment]
        batch_id = await batch_processor.queue_permission_changes(assignments, "corr-123")

        status = await batch_processor.get_batch_status(batch_id)

        assert status
        assert status["batch_id"] == batch_id
        assert status["total"] == 1
        assert status["status"] == BatchStatus.PENDING.value


class TestLockService:
    """Test lock service."""

    @pytest.mark.asyncio
    async def test_create_manual_lock(self, lock_service, db_session):
        """Test creating manual lock."""
        user_id = uuid4()
        folder_id = uuid4()

        with patch.object(lock_service, "_get_active_lock", return_value=None):
            with patch.object(lock_service, "_apply_lock_permissions", return_value=None):
                with patch.object(lock_service, "_audit_lock_action", return_value=None):
                    result = await lock_service.create_manual_lock(
                        folder_path="/test/folder",
                        folder_id=folder_id,
                        locked_by=user_id,
                        reason="Test lock",
                        expires_in_hours=24,
                        correlation_id="corr-123",
                    )

                    assert result.lock_type == LockType.MANUAL
                    assert result.locked_by == user_id
                    assert result.lock_reason == "Test lock"
                    assert result.is_active

    @pytest.mark.asyncio
    async def test_override_automatic_lock(self, lock_service, db_session):
        """Test overriding automatic lock with manual lock."""
        user_id = uuid4()
        folder_id = uuid4()

        automatic_lock = LockState(
            id=uuid4(),
            folder_id=folder_id,
            folder_path="/test/folder",
            lock_type=LockType.AUTOMATIC,
            is_active=True,
            locked_at=datetime.utcnow(),
        )

        with patch.object(lock_service, "_get_active_lock", return_value=automatic_lock):
            with patch.object(lock_service, "_override_automatic_lock", return_value=None):
                with patch.object(lock_service, "_apply_lock_permissions", return_value=None):
                    with patch.object(lock_service, "_audit_lock_action", return_value=None):
                        result = await lock_service.create_manual_lock(
                            folder_path="/test/folder",
                            folder_id=folder_id,
                            locked_by=user_id,
                            reason="Override test",
                            correlation_id="corr-123",
                        )

                        assert result.lock_type == LockType.MANUAL

    @pytest.mark.asyncio
    async def test_remove_lock(self, lock_service, db_session):
        """Test removing lock."""
        lock_id = uuid4()
        user_id = uuid4()
        folder_id = uuid4()

        lock = LockState(
            id=lock_id,
            folder_id=folder_id,
            folder_path="/test/folder",
            lock_type=LockType.MANUAL,
            locked_by=user_id,
            is_active=True,
            locked_at=datetime.utcnow(),
        )

        db_session.add(lock)
        await db_session.commit()

        with patch.object(lock_service, "_restore_calculated_permissions", return_value=None):
            with patch.object(lock_service, "_audit_lock_action", return_value=None):
                result = await lock_service.remove_lock(
                    lock_id=lock_id,
                    removed_by=user_id,
                    reason="Test removal",
                    correlation_id="corr-123",
                )

                assert result["status"] == "removed"
                assert result["lock_id"] == str(lock_id)

    @pytest.mark.asyncio
    async def test_extend_lock(self, lock_service, db_session):
        """Test extending lock expiration."""
        lock_id = uuid4()
        user_id = uuid4()
        folder_id = uuid4()

        lock = LockState(
            id=lock_id,
            folder_id=folder_id,
            folder_path="/test/folder",
            lock_type=LockType.MANUAL,
            locked_by=user_id,
            is_active=True,
            lock_reason="Test lock",
            locked_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=24),
        )

        db_session.add(lock)
        await db_session.commit()

        original_expires = lock.expires_at

        with patch.object(lock_service, "_audit_lock_action", return_value=None):
            result = await lock_service.extend_lock(
                lock_id=lock_id,
                extended_by=user_id,
                additional_hours=12,
                reason="Need more time",
                correlation_id="corr-123",
            )

            assert result.lock_id == lock_id
            assert result.expires_at > original_expires

    @pytest.mark.asyncio
    async def test_check_lock_override(self, lock_service):
        """Test checking lock override status."""
        folder_id = uuid4()
        user_id = uuid4()

        lock = LockState(
            id=uuid4(),
            folder_id=folder_id,
            folder_path="/test/folder",
            lock_type=LockType.MANUAL,
            locked_by=user_id,
            is_active=True,
            locked_at=datetime.utcnow(),
            lock_reason="Test",
        )

        with patch.object(lock_service, "_get_active_lock", return_value=lock):
            with patch.object(lock_service, "_check_lock_access", return_value=True):
                result = await lock_service.check_lock_override(folder_id, user_id)

                assert result["is_locked"]
                assert result["has_override"]
                assert result["lock_type"] == LockType.MANUAL.value
                assert result["can_access"]


class TestLockOverrideEngine:
    """Test lock override engine."""

    @pytest.mark.asyncio
    async def test_apply_lock_overrides(self, db_session):
        """Test applying lock overrides to permissions."""
        engine = LockOverrideEngine(db_session)
        user_id = uuid4()

        permissions = [
            PermissionAssignment(
                id=uuid4(),
                folder_path="/test/folder1",
                resource_path="/test/folder1",
                resource_id=str(uuid4()),
                resource_type="sharepoint_folder",
                role_id=uuid4(),
                permission_level="write",
                permission_type="write",
            ),
            PermissionAssignment(
                id=uuid4(),
                folder_path="/test/folder2",
                resource_path="/test/folder2",
                resource_id=str(uuid4()),
                resource_type="sharepoint_folder",
                role_id=uuid4(),
                permission_level="write",
                permission_type="write",
            ),
        ]

        with patch.object(engine.lock_service, "check_lock_override") as mock_check:
            mock_check.side_effect = [{"is_locked": True, "can_access": True}, {"is_locked": False}]

            modified = await engine.apply_lock_overrides(permissions, user_id)

            assert len(modified) == 2
            assert modified[0].permission_type == "read"
            assert modified[0].is_locked
            assert modified[1].permission_type == "write"
            assert not modified[1].is_locked
