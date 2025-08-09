"""Tests for Change Request lock functionality."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from freezegun import freeze_time
from sqlalchemy.orm import Session

from api.core.errors import BadRequestError, ConflictError, NotFoundError
from api.models.change_request import ChangeRequest, CRScope, CRStatus
from api.models.contract import OrderEm
from api.models.lock import LockState, LockType, PermissionLevel
from api.services.locks.cr_service import CRService


@pytest.fixture
def db_session():
    """Mock database session."""
    return MagicMock(spec=Session)


@pytest.fixture
def cr_service(db_session):
    """CR service instance."""
    return CRService(db_session)


@pytest.fixture
def sample_em():
    """Sample OrderEm for testing."""
    em = MagicMock(spec=OrderEm)
    em.id = 1
    em.em_number = "EM-2025-001"
    em.title = "Test EM"
    return em


@pytest.fixture
def sample_user_id():
    """Sample user ID."""
    return uuid4()


class TestCRCreation:
    """Test CR creation functionality."""

    @pytest.mark.asyncio
    async def test_create_cr_success(self, cr_service, db_session, sample_em, sample_user_id):
        """Test successful CR creation."""
        # Setup
        db_session.query().filter_by().first.return_value = sample_em
        db_session.query().filter().all.return_value = []  # No existing CRs

        with patch.object(cr_service, "_apply_cr_unlock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute
                cr = await cr_service.create_cr(
                    em_id=1,
                    scope=CRScope.EXPERTS,
                    reason="Emergency fix required for compliance issue",
                    created_by=sample_user_id,
                    duration_hours=48,
                )

                # Assert
                assert cr.em_id == 1
                assert cr.scope == CRScope.EXPERTS
                assert cr.status == CRStatus.ACTIVE
                assert cr.duration_hours == 48
                assert cr.created_by == sample_user_id

                # Verify CR was added to session
                db_session.add.assert_called_once()
                db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_cr_invalid_scope(self, cr_service, sample_user_id):
        """Test CR creation with invalid scope."""
        with pytest.raises(BadRequestError) as exc_info:
            await cr_service.create_cr(
                em_id=1, scope="invalid_scope", reason="Test reason", created_by=sample_user_id
            )

        assert "Invalid scope" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_cr_short_reason(self, cr_service, sample_user_id):
        """Test CR creation with too short reason."""
        with pytest.raises(BadRequestError) as exc_info:
            await cr_service.create_cr(
                em_id=1, scope=CRScope.EXPERTS, reason="Short", created_by=sample_user_id
            )

        assert "at least 20 characters" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_cr_invalid_duration(self, cr_service, sample_user_id):
        """Test CR creation with invalid duration."""
        # Test too short duration
        with pytest.raises(BadRequestError) as exc_info:
            await cr_service.create_cr(
                em_id=1,
                scope=CRScope.EXPERTS,
                reason="Valid reason that is long enough",
                created_by=sample_user_id,
                duration_hours=0,
            )

        assert "between 1 and 72 hours" in str(exc_info.value)

        # Test too long duration
        with pytest.raises(BadRequestError) as exc_info:
            await cr_service.create_cr(
                em_id=1,
                scope=CRScope.EXPERTS,
                reason="Valid reason that is long enough",
                created_by=sample_user_id,
                duration_hours=100,
            )

        assert "between 1 and 72 hours" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_cr_em_not_found(self, cr_service, db_session, sample_user_id):
        """Test CR creation with non-existent EM."""
        db_session.query().filter_by().first.return_value = None

        with pytest.raises(NotFoundError) as exc_info:
            await cr_service.create_cr(
                em_id=999,
                scope=CRScope.EXPERTS,
                reason="Valid reason that is long enough",
                created_by=sample_user_id,
            )

        assert "OrderEm" in str(exc_info.value) or "999" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_cr_with_existing_active_cr(
        self, cr_service, db_session, sample_em, sample_user_id
    ):
        """Test CR creation when there's already an active CR for the same scope."""
        # Setup existing CR
        existing_cr = MagicMock(spec=ChangeRequest)
        existing_cr.expires_at = datetime.now(UTC) + timedelta(hours=24)

        db_session.query().filter_by().first.return_value = sample_em
        cr_service._get_active_crs_for_scope = MagicMock(return_value=[existing_cr])

        with patch.object(cr_service, "_apply_cr_unlock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute
                cr = await cr_service.create_cr(
                    em_id=1,
                    scope=CRScope.EXPERTS,
                    reason="Another emergency fix required",
                    created_by=sample_user_id,
                    duration_hours=48,
                )

                # Assert - CR should be created successfully
                assert cr.em_id == 1
                assert cr.scope == CRScope.EXPERTS
                db_session.commit.assert_called_once()


class TestCRClosure:
    """Test CR closure functionality."""

    @pytest.mark.asyncio
    async def test_close_cr_success(self, cr_service, db_session, sample_user_id):
        """Test successful CR closure."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.status = CRStatus.ACTIVE

        db_session.query().filter_by().first.return_value = cr
        db_session.query().filter().all.return_value = []  # No other active CRs

        with patch.object(cr_service, "_revert_cr_lock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute
                result = await cr_service.close_cr(
                    cr_id=cr.id, closed_by=sample_user_id, reason="Changes completed"
                )

                # Assert
                assert result.status == CRStatus.CLOSED
                assert result.closed_by == sample_user_id
                db_session.commit.assert_called_once()
                cr_service._revert_cr_lock.assert_called_once_with(cr)

    @pytest.mark.asyncio
    async def test_close_cr_not_found(self, cr_service, db_session, sample_user_id):
        """Test closing non-existent CR."""
        db_session.query().filter_by().first.return_value = None

        with pytest.raises(NotFoundError) as exc_info:
            await cr_service.close_cr(cr_id=uuid4(), closed_by=sample_user_id)

        assert "ChangeRequest" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_close_cr_already_closed(self, cr_service, db_session, sample_user_id):
        """Test closing already closed CR."""
        cr = MagicMock(spec=ChangeRequest)
        cr.status = CRStatus.CLOSED

        db_session.query().filter_by().first.return_value = cr

        with pytest.raises(ConflictError) as exc_info:
            await cr_service.close_cr(cr_id=uuid4(), closed_by=sample_user_id)

        assert "already" in str(exc_info.value) and "CLOSED" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_close_cr_with_other_active_crs(self, cr_service, db_session, sample_user_id):
        """Test closing CR when other active CRs exist for same scope."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.status = CRStatus.ACTIVE

        other_cr = MagicMock(spec=ChangeRequest)
        other_cr.id = uuid4()
        other_cr.status = CRStatus.ACTIVE

        db_session.query().filter_by().first.return_value = cr
        db_session.query().filter().all.return_value = [other_cr]  # Other active CR exists

        with patch.object(cr_service, "_revert_cr_lock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute
                result = await cr_service.close_cr(cr_id=cr.id, closed_by=sample_user_id)

                # Assert - should not revert locks
                cr_service._revert_cr_lock.assert_not_called()
                db_session.commit.assert_called_once()


class TestCRExpiry:
    """Test CR expiry functionality."""

    @pytest.mark.asyncio
    @freeze_time("2025-01-15 12:00:00")
    async def test_expire_crs_success(self, cr_service, db_session):
        """Test successful CR expiry processing."""
        # Setup expired CR
        expired_cr = MagicMock(spec=ChangeRequest)
        expired_cr.id = uuid4()
        expired_cr.em_id = 1
        expired_cr.scope = CRScope.EXPERTS
        expired_cr.status = CRStatus.ACTIVE
        expired_cr.expires_at = datetime.now(UTC) - timedelta(hours=1)

        db_session.query().filter().all.side_effect = [
            [expired_cr],  # First call returns expired CRs
            [],  # Second call returns no other active CRs
        ]

        with patch.object(cr_service, "_revert_cr_lock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute
                result = await cr_service.expire_crs()

                # Assert
                assert len(result) == 1
                assert expired_cr.status == CRStatus.EXPIRED
                cr_service._revert_cr_lock.assert_called_once_with(expired_cr)
                db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    @freeze_time("2025-01-15 12:00:00")
    async def test_expire_crs_no_expired(self, cr_service, db_session):
        """Test expiry processing when no CRs are expired."""
        db_session.query().filter().all.return_value = []

        # Execute
        result = await cr_service.expire_crs()

        # Assert
        assert len(result) == 0
        db_session.commit.assert_not_called()

    @pytest.mark.asyncio
    @freeze_time("2025-01-15 12:00:00")
    async def test_expire_crs_with_other_active(self, cr_service, db_session):
        """Test expiry when other active CRs exist for same scope."""
        # Setup
        expired_cr = MagicMock(spec=ChangeRequest)
        expired_cr.id = uuid4()
        expired_cr.em_id = 1
        expired_cr.scope = CRScope.EXPERTS
        expired_cr.status = CRStatus.ACTIVE
        expired_cr.expires_at = datetime.now(UTC) - timedelta(hours=1)

        other_active_cr = MagicMock(spec=ChangeRequest)
        other_active_cr.status = CRStatus.ACTIVE

        db_session.query().filter().all.side_effect = [
            [expired_cr],  # Expired CRs
            [other_active_cr],  # Other active CRs
        ]

        with patch.object(cr_service, "_revert_cr_lock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute
                result = await cr_service.expire_crs()

                # Assert - should not revert locks
                assert len(result) == 1
                cr_service._revert_cr_lock.assert_not_called()
                db_session.commit.assert_called_once()


class TestCRPermissions:
    """Test CR permission management."""

    @pytest.mark.asyncio
    async def test_apply_cr_unlock(self, cr_service, db_session):
        """Test applying unlock permissions for CR."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()
        cr.em_id = 1
        cr.scope = CRScope.EXPERTS
        cr.expires_at = datetime.now(UTC) + timedelta(hours=48)
        cr.reason = "Test reason"

        lock_state = MagicMock(spec=LockState)
        lock_state.folder_path = "/2. Szakértők/test"

        db_session.query().filter().all.return_value = [lock_state]

        # Execute
        await cr_service._apply_cr_unlock(cr)

        # Assert
        assert lock_state.permission_level == PermissionLevel.WRITE
        assert lock_state.cr_id == cr.id
        assert lock_state.cr_expires_at == cr.expires_at
        assert lock_state.lock_type == LockType.MANUAL
        assert lock_state.is_manual_override == True

    @pytest.mark.asyncio
    async def test_revert_cr_lock(self, cr_service, db_session):
        """Test reverting lock permissions after CR."""
        # Setup
        cr = MagicMock(spec=ChangeRequest)
        cr.id = uuid4()

        lock_state = MagicMock(spec=LockState)
        lock_state.cr_id = cr.id
        lock_state.is_active = True

        db_session.query().filter().all.return_value = [lock_state]

        # Execute
        await cr_service._revert_cr_lock(cr)

        # Assert
        assert lock_state.permission_level == PermissionLevel.READ
        assert lock_state.cr_id is None
        assert lock_state.cr_expires_at is None
        assert lock_state.lock_type == LockType.AUTOMATIC
        assert lock_state.is_manual_override == False

    def test_get_folder_patterns_experts(self, cr_service):
        """Test getting folder patterns for experts scope."""
        patterns = cr_service._get_folder_patterns(CRScope.EXPERTS)

        assert "%/2. Szakértők/%" in patterns
        assert "%/Szakértők/%" in patterns
        assert "%/experts/%" in patterns

    def test_get_folder_patterns_deliverables(self, cr_service):
        """Test getting folder patterns for deliverables scope."""
        patterns = cr_service._get_folder_patterns(CRScope.DELIVERABLES)

        assert "%/3. Eredménytermékek/%" in patterns
        assert "%/Eredménytermékek/%" in patterns
        assert "%/deliverables/%" in patterns


class TestCRConcurrency:
    """Test concurrent CR scenarios."""

    @pytest.mark.asyncio
    async def test_overlapping_crs_extend_unlock(
        self, cr_service, db_session, sample_em, sample_user_id
    ):
        """Test that overlapping CRs extend the unlock period."""
        # Setup first CR expiring in 24 hours
        cr1 = MagicMock(spec=ChangeRequest)
        cr1.expires_at = datetime.now(UTC) + timedelta(hours=24)

        db_session.query().filter_by().first.return_value = sample_em
        cr_service._get_active_crs_for_scope = MagicMock(return_value=[cr1])

        with patch.object(cr_service, "_apply_cr_unlock", new_callable=AsyncMock):
            with patch.object(cr_service.audit_service, "log_event", new_callable=AsyncMock):
                # Execute - create CR2 with 48 hour duration
                cr2 = await cr_service.create_cr(
                    em_id=1,
                    scope=CRScope.EXPERTS,
                    reason="Extended emergency fix required",
                    created_by=sample_user_id,
                    duration_hours=48,
                )

                # Assert - CR2 should extend beyond CR1
                assert cr2.expires_at > cr1.expires_at
                assert cr2.status == CRStatus.ACTIVE

    def test_get_active_crs_for_scope(self, cr_service, db_session):
        """Test getting active CRs for a specific scope."""
        # Setup
        cr1 = MagicMock(spec=ChangeRequest)
        cr1.status = CRStatus.ACTIVE
        cr1.scope = CRScope.EXPERTS

        cr2 = MagicMock(spec=ChangeRequest)
        cr2.status = CRStatus.ACTIVE
        cr2.scope = CRScope.EXPERTS

        db_session.query().filter().all.return_value = [cr1, cr2]

        # Execute
        result = cr_service._get_active_crs_for_scope(1, CRScope.EXPERTS)

        # Assert
        assert len(result) == 2
        assert cr1 in result
        assert cr2 in result
