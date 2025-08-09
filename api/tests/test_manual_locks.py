"""Tests for manual lock functionality."""

from datetime import datetime
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.core.errors import BadRequestError, ForbiddenError, NotFoundError
from api.models.contract import OrderEm
from api.models.lock import LockState, LockType, PermissionLevel
from api.services.locks.manual_lock_service import ManualLockService


class TestManualLockService:
    """Test suite for ManualLockService."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        return Mock(spec=Session)

    @pytest.fixture
    def mock_audit_service(self):
        """Create a mock audit service."""
        with patch("api.services.locks.manual_lock_service.AuditService") as mock:
            yield mock

    @pytest.fixture
    def service(self, mock_db, mock_audit_service):
        """Create a ManualLockService instance."""
        return ManualLockService(mock_db)

    def test_apply_manual_lock_validates_pm_role(self, service, mock_db):
        """Test that only PM role can apply manual locks."""
        with pytest.raises(ForbiddenError) as exc_info:
            service.apply_manual_lock(
                em_id=1,
                scope="experts",
                action="lock",
                reason="Test reason for lock",
                user_id=uuid4(),
                user_role="USER",  # Not PM
            )

        assert "Only Project Managers" in str(exc_info.value)

    def test_apply_manual_lock_validates_scope(self, service, mock_db):
        """Test that scope must be valid."""
        with pytest.raises(BadRequestError) as exc_info:
            service.apply_manual_lock(
                em_id=1,
                scope="invalid",  # Invalid scope
                action="lock",
                reason="Test reason for lock",
                user_id=uuid4(),
                user_role="PM",
            )

        assert "Scope must be" in str(exc_info.value)

    def test_apply_manual_lock_validates_action(self, service, mock_db):
        """Test that action must be valid."""
        with pytest.raises(BadRequestError) as exc_info:
            service.apply_manual_lock(
                em_id=1,
                scope="experts",
                action="invalid",  # Invalid action
                reason="Test reason for lock",
                user_id=uuid4(),
                user_role="PM",
            )

        assert "Action must be" in str(exc_info.value)

    def test_apply_manual_lock_validates_reason_length(self, service, mock_db):
        """Test that reason must be at least 10 characters."""
        with pytest.raises(BadRequestError) as exc_info:
            service.apply_manual_lock(
                em_id=1,
                scope="experts",
                action="lock",
                reason="Short",  # Too short
                user_id=uuid4(),
                user_role="PM",
            )

        assert "at least 10 characters" in str(exc_info.value)

    def test_apply_manual_lock_checks_em_exists(self, service, mock_db):
        """Test that EM must exist."""
        mock_db.query().filter().first.return_value = None

        with pytest.raises(NotFoundError) as exc_info:
            service.apply_manual_lock(
                em_id=999,
                scope="experts",
                action="lock",
                reason="Valid reason for lock",
                user_id=uuid4(),
                user_role="PM",
            )

        assert "OrderEm with id 999 not found" in str(exc_info.value)

    def test_apply_manual_lock_success(self, service, mock_db, mock_audit_service):
        """Test successful manual lock application."""
        # Setup mocks
        mock_em = Mock(spec=OrderEm)
        mock_em.id = 1
        mock_em.name = "Test EM"
        mock_em.sharepoint_site_id = "test-site"

        # Setup query chain for OrderEm
        mock_em_query = Mock()
        mock_em_query.filter.return_value = mock_em_query
        mock_em_query.first.return_value = mock_em

        # Setup query chain for LockState
        mock_lock_query = Mock()
        mock_lock_query.filter.return_value = mock_lock_query
        mock_lock_query.first.return_value = None

        # Configure mock_db to return appropriate query based on model
        def query_side_effect(model):
            if model == OrderEm:
                return mock_em_query
            elif model == LockState:
                return mock_lock_query
            return Mock()

        mock_db.query.side_effect = query_side_effect

        user_id = uuid4()
        result = service.apply_manual_lock(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Valid reason for lock",
            user_id=user_id,
            user_role="PM",
        )

        # Verify result
        assert result["success"] is True
        assert result["correlation_id"] is not None
        assert "Manual lock applied successfully" in result["message"]
        assert len(result["affected_folders"]) == 1

        # Verify database operations
        mock_db.add.assert_called()
        mock_db.flush.assert_called()
        mock_db.commit.assert_called()

    def test_apply_manual_unlock_success(self, service, mock_db, mock_audit_service):
        """Test successful manual unlock."""
        # Setup mocks
        mock_em = Mock(spec=OrderEm)
        mock_em.id = 1
        mock_em.name = "Test EM"
        mock_em.sharepoint_site_id = "test-site"

        mock_lock = Mock(spec=LockState)
        mock_lock.id = uuid4()
        mock_lock.is_active = True

        # Setup query chain for OrderEm
        mock_em_query = Mock()
        mock_em_query.filter.return_value = mock_em_query
        mock_em_query.first.return_value = mock_em

        # Setup query chain for LockState
        mock_lock_query = Mock()
        mock_lock_query.filter.return_value = mock_lock_query
        mock_lock_query.first.return_value = mock_lock

        # Configure mock_db to return appropriate query based on model
        def query_side_effect(model):
            if model == OrderEm:
                return mock_em_query
            elif model == LockState:
                return mock_lock_query
            return Mock()

        mock_db.query.side_effect = query_side_effect

        user_id = uuid4()
        result = service.apply_manual_lock(
            em_id=1,
            scope="deliverables",
            action="unlock",
            reason="Valid reason for unlock",
            user_id=user_id,
            user_role="PM",
        )

        # Verify result
        assert result["success"] is True
        assert result["correlation_id"] is not None
        assert "Manual unlock applied successfully" in result["message"]

        # Verify lock was deactivated
        assert mock_lock.is_active is False
        assert mock_lock.removed_at is not None
        assert mock_lock.removed_by == user_id
        assert mock_lock.removal_reason == "Valid reason for unlock"

    def test_get_current_lock_state(self, service, mock_db):
        """Test getting current lock state."""
        # Setup mocks
        mock_em = Mock(spec=OrderEm)
        mock_em.id = 1
        mock_em.name = "Test EM"
        mock_em.sharepoint_site_id = "test-site"

        mock_lock = Mock(spec=LockState)
        mock_lock.lock_type = LockType.MANUAL
        mock_lock.permission_level = PermissionLevel.READ
        mock_lock.locked_at = datetime.utcnow()
        mock_lock.lock_reason = "Test reason"

        mock_db.query(OrderEm).filter().first.return_value = mock_em
        mock_db.query(LockState).filter().order_by().first.return_value = mock_lock

        result = service.get_current_lock_state(em_id=1, scope="experts")

        # Verify result
        assert result["em_id"] == 1
        assert result["scope"] == "experts"
        assert len(result["states"]) == 1
        assert result["states"][0]["is_locked"] is True
        assert result["states"][0]["is_manual"] is True
        assert result["states"][0]["lock_type"] == LockType.MANUAL

    def test_check_lock_priority_manual_overrides(self, service, mock_db):
        """Test that manual locks have highest priority."""
        # Mock manual lock exists
        mock_manual_lock = Mock(spec=LockState)
        mock_db.query(LockState).filter().first.side_effect = [
            mock_manual_lock,  # Manual lock check returns lock
            None,  # Auto lock check returns None
        ]

        priority = service.check_lock_priority(em_id=1, folder_path="/test/path")

        assert priority == "manual"

    def test_check_lock_priority_automatic_when_no_manual(self, service, mock_db):
        """Test that automatic locks are returned when no manual lock."""
        # Mock automatic lock exists
        mock_auto_lock = Mock(spec=LockState)
        mock_db.query(LockState).filter().first.side_effect = [
            None,  # Manual lock check returns None
            mock_auto_lock,  # Auto lock check returns lock
        ]

        priority = service.check_lock_priority(em_id=1, folder_path="/test/path")

        assert priority == "automatic"

    def test_check_lock_priority_none_when_no_locks(self, service, mock_db):
        """Test that None is returned when no locks exist."""
        mock_db.query(LockState).filter().first.return_value = None

        priority = service.check_lock_priority(em_id=1, folder_path="/test/path")

        assert priority is None


class TestManualLockEndpoint:
    """Test suite for manual lock API endpoints."""

    @pytest.fixture
    def mock_manual_lock_service(self):
        """Create a mock manual lock service."""
        with patch("api.routers.locks.ManualLockService") as mock:
            yield mock

    @pytest.fixture
    def mock_lock_application_task(self):
        """Create a mock lock application task."""
        # Mock the task directly in the router module to avoid importing worker
        with patch("api.routers.locks.apply_manual_lock_permissions", create=True) as mock:
            mock.delay.return_value.id = "task-123"
            yield mock

    @pytest.mark.skip(reason="Requires proper environment setup for MSAL initialization")
    def test_apply_manual_lock_endpoint_success(
        self, mock_manual_lock_service, mock_lock_application_task
    ):
        """Test successful manual lock endpoint call."""
        from api.routers.locks import apply_manual_lock
        from api.schemas.lock import ManualLockOperationRequest

        # Setup mock service
        mock_service = mock_manual_lock_service.return_value
        mock_service.apply_manual_lock.return_value = {
            "success": True,
            "correlation_id": "corr-123",
            "applied_at": "2025-01-15T10:00:00Z",
            "message": "Success",
            "affected_folders": [],
        }

        # Create request
        request = ManualLockOperationRequest(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Valid reason for testing",
        )

        # Mock user
        current_user = {
            "user_id": str(uuid4()),
            "roles": ["PM"],
        }

        # Call endpoint
        result = apply_manual_lock(
            request=request,
            current_user=current_user,
            db=Mock(),
        )

        # Verify result
        assert result.success is True
        assert result.correlation_id == "corr-123"
        assert result.applied_at == "2025-01-15T10:00:00Z"

        # Verify task was queued
        mock_lock_application_task.delay.assert_called_once()

    def test_apply_manual_lock_endpoint_handles_forbidden(self, mock_manual_lock_service):
        """Test that forbidden errors are handled correctly."""
        from api.routers.locks import apply_manual_lock
        from api.schemas.lock import ManualLockOperationRequest

        # Setup mock service to raise ForbiddenError
        mock_service = mock_manual_lock_service.return_value
        mock_service.apply_manual_lock.side_effect = ForbiddenError("Not authorized")

        request = ManualLockOperationRequest(
            em_id=1,
            scope="experts",
            action="lock",
            reason="Valid reason for testing",
        )

        current_user = {
            "user_id": str(uuid4()),
            "roles": ["USER"],  # Not PM
        }

        with pytest.raises(HTTPException) as exc_info:
            apply_manual_lock(
                request=request,
                current_user=current_user,
                db=Mock(),
            )

        assert exc_info.value.status_code == 403
        assert "Not authorized" in str(exc_info.value.detail)

    def test_get_manual_lock_state_endpoint(self, mock_manual_lock_service):
        """Test getting manual lock state endpoint."""
        from api.routers.locks import get_manual_lock_state

        # Setup mock service
        mock_service = mock_manual_lock_service.return_value
        mock_service.get_current_lock_state.return_value = {
            "em_id": 1,
            "scope": "experts",
            "states": [
                {
                    "folder_path": "/test/path",
                    "is_locked": True,
                    "lock_type": "manual",
                    "permission_level": "read",
                    "locked_at": "2025-01-15T10:00:00Z",
                    "lock_reason": "Test reason",
                    "is_manual": True,
                }
            ],
        }

        current_user = {"user_id": str(uuid4()), "roles": ["USER"]}

        result = get_manual_lock_state(
            em_id=1,
            scope="experts",
            current_user=current_user,
            db=Mock(),
        )

        # Verify result
        assert result.em_id == 1
        assert result.scope == "experts"
        assert len(result.states) == 1
        assert result.states[0]["is_locked"] is True
