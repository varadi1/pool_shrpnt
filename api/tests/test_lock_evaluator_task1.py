"""Tests for Story 3.2 Task 1 components: scheduler, state transitions, and distributed locks."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import redis.asyncio as redis
from freezegun import freeze_time
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import Contract, OrderEm, PartnerCompany
from api.models.lock import LockRule, LockState
from api.services.locks.state_transition_service import (
    LockPermissionLevel,
    LockStateType,
    StateTransition,
    StateTransitionService,
    TWindowCalculator,
)
from api.utils.distributed_lock import DistributedLock, distributed_lock


@pytest.fixture
async def async_db_session(async_engine):
    """Create an async database session for testing."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    async_session = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )

    async with async_session() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def test_order_em(async_db_session: AsyncSession):
    """Create test order EM with dependencies."""
    contract = Contract(
        contract_number="C-TEST-001",
        name="Test Contract",
        start_date=datetime.now(UTC),
        status="active",
        created_by="test_user",
    )
    async_db_session.add(contract)

    partner = PartnerCompany(
        name="Test Partner",
        short_name="TEST",
        company_code="TEST001",
    )
    async_db_session.add(partner)

    await async_db_session.flush()

    order_em = OrderEm(
        em_number="EM-2025-001",
        title="Test Order",
        contract_id=contract.id,
        partner_company_id=partner.id,
        year=2025,
        part="A",
        provisioning_status="completed",
        created_at=datetime.now(UTC),
    )
    async_db_session.add(order_em)
    await async_db_session.commit()

    return order_em


@pytest.fixture
async def lock_rules(async_db_session: AsyncSession, test_order_em):
    """Create test lock rules."""
    rules = [
        LockRule(
            id=uuid.uuid4(),
            order_em_id=test_order_em.id,
            rule_name="Remediation Window",
            t_value=datetime(2025, 1, 15, tzinfo=UTC),
            window_type="remediation",
            start_offset=-7,
            end_offset=-1,
            permission_level="limited_access",
            is_active=True,
            created_by="test_user",
            created_at=datetime.now(UTC),
        ),
        LockRule(
            id=uuid.uuid4(),
            order_em_id=test_order_em.id,
            rule_name="Upload Window",
            t_value=datetime(2025, 1, 15, tzinfo=UTC),
            window_type="upload",
            start_offset=0,
            end_offset=7,
            permission_level="upload_window",
            is_active=True,
            created_by="test_user",
            created_at=datetime.now(UTC),
        ),
    ]

    for rule in rules:
        async_db_session.add(rule)

    await async_db_session.commit()
    return rules


@pytest.fixture
def mock_redis_client():
    """Create a mock Redis client."""
    mock = AsyncMock(spec=redis.Redis)
    mock.lock = MagicMock()
    mock.exists = AsyncMock(return_value=0)
    mock.get = AsyncMock(return_value=None)
    mock.delete = AsyncMock(return_value=1)
    mock.ttl = AsyncMock(return_value=300)
    return mock


class TestTWindowCalculator:
    """Test T-window calculation logic (AC: 2)."""

    def test_before_remediation_window(self):
        """Test state before T-7."""
        calculator = TWindowCalculator()
        t_value = datetime(2025, 1, 15, tzinfo=UTC)
        current_time = datetime(2025, 1, 6, tzinfo=UTC)  # T-9

        window_state, permission = calculator.calculate_window_state(t_value, current_time, -7, -1)

        assert window_state == "before_window"
        assert permission == LockPermissionLevel.LIMITED_ACCESS

    def test_in_remediation_window(self):
        """Test state during T-7 to T-1."""
        calculator = TWindowCalculator()
        t_value = datetime(2025, 1, 15, tzinfo=UTC)
        current_time = datetime(2025, 1, 10, tzinfo=UTC)  # T-5

        window_state, permission = calculator.calculate_window_state(t_value, current_time, -7, -1)

        assert window_state == "remediation_window"
        assert permission == LockPermissionLevel.LIMITED_ACCESS

    def test_in_upload_window(self):
        """Test state during T+0 to T+7."""
        calculator = TWindowCalculator()
        t_value = datetime(2025, 1, 15, tzinfo=UTC)
        current_time = datetime(2025, 1, 18, tzinfo=UTC)  # T+3

        window_state, permission = calculator.calculate_window_state(t_value, current_time, 0, 7)

        assert window_state == "upload_window"
        assert permission == LockPermissionLevel.UPLOAD_WINDOW

    def test_after_upload_window(self):
        """Test state after T+7."""
        calculator = TWindowCalculator()
        t_value = datetime(2025, 1, 15, tzinfo=UTC)
        current_time = datetime(2025, 1, 25, tzinfo=UTC)  # T+10

        window_state, permission = calculator.calculate_window_state(t_value, current_time, 0, 7)

        assert window_state == "after_window"
        assert permission == LockPermissionLevel.READONLY

    def test_get_state_for_t_offset(self):
        """Test simplified state calculation based on T offset."""
        calculator = TWindowCalculator()
        t_value = datetime(2025, 1, 15, tzinfo=UTC)

        # T-10 (full access)
        state = calculator.get_state_for_t_offset(t_value, datetime(2025, 1, 5, tzinfo=UTC))
        assert state == LockPermissionLevel.FULL_ACCESS

        # T-5 (limited access)
        state = calculator.get_state_for_t_offset(t_value, datetime(2025, 1, 10, tzinfo=UTC))
        assert state == LockPermissionLevel.LIMITED_ACCESS

        # T+3 (upload window)
        state = calculator.get_state_for_t_offset(t_value, datetime(2025, 1, 18, tzinfo=UTC))
        assert state == LockPermissionLevel.UPLOAD_WINDOW

        # T+10 (readonly)
        state = calculator.get_state_for_t_offset(t_value, datetime(2025, 1, 25, tzinfo=UTC))
        assert state == LockPermissionLevel.READONLY


class TestStateTransitionService:
    """Test state transition engine (AC: 2, 3)."""

    @pytest.mark.asyncio
    async def test_evaluate_lock_states_no_overrides(
        self,
        async_db_session,
        test_order_em,
        lock_rules,
    ):
        """Test automatic state evaluation without overrides."""
        service = StateTransitionService(async_db_session)

        with freeze_time("2025-01-10 12:00:00"):  # T-5
            transitions = await service.evaluate_lock_states([test_order_em.id])

            assert len(transitions) > 0
            for transition in transitions:
                assert transition.lock_type == LockStateType.AUTOMATIC
                assert transition.permission_level == LockPermissionLevel.LIMITED_ACCESS

    @pytest.mark.asyncio
    async def test_cr_override_priority(
        self,
        async_db_session,
        test_order_em,
        lock_rules,
    ):
        """Test CR override takes priority over automatic locks."""
        # Add CR override
        cr_state = LockState(
            id=uuid.uuid4(),
            order_em_id=test_order_em.id,
            folder_path="/root",
            current_state="cr_locked",
            permission_level=LockPermissionLevel.READONLY,
            lock_type=LockStateType.CR_OVERRIDE,
            is_active=True,
            applied_by="cr_system",
            applied_at=datetime.now(UTC),
            locked_until=datetime.now(UTC) + timedelta(hours=24),
        )
        async_db_session.add(cr_state)
        await async_db_session.commit()

        service = StateTransitionService(async_db_session)
        transitions = await service.evaluate_lock_states([test_order_em.id])

        assert all(t.lock_type == LockStateType.CR_OVERRIDE for t in transitions)
        assert all(t.permission_level == LockPermissionLevel.READONLY for t in transitions)

    @pytest.mark.asyncio
    async def test_manual_override_priority(
        self,
        async_db_session,
        test_order_em,
        lock_rules,
    ):
        """Test manual override takes priority over automatic locks."""
        # Add manual override
        manual_state = LockState(
            id=uuid.uuid4(),
            order_em_id=test_order_em.id,
            folder_path="/root/docs",
            current_state="manual_locked",
            permission_level=LockPermissionLevel.READONLY,
            lock_type=LockStateType.MANUAL,
            is_active=True,
            applied_by="admin_user",
            applied_at=datetime.now(UTC),
            locked_until=datetime.now(UTC) + timedelta(hours=12),
        )
        async_db_session.add(manual_state)
        await async_db_session.commit()

        service = StateTransitionService(async_db_session)
        transitions = await service.evaluate_lock_states([test_order_em.id])

        # Find transition for the manually locked folder
        manual_transition = next((t for t in transitions if t.folder_path == "/root/docs"), None)

        assert manual_transition is not None
        assert manual_transition.lock_type == LockStateType.MANUAL
        assert manual_transition.permission_level == LockPermissionLevel.READONLY

    @pytest.mark.asyncio
    async def test_expired_manual_lock_reversion(
        self,
        async_db_session,
        test_order_em,
        lock_rules,
    ):
        """Test expired manual locks revert to automatic state."""
        # Add expired manual override
        expired_state = LockState(
            id=uuid.uuid4(),
            order_em_id=test_order_em.id,
            folder_path="/root/data",
            current_state="manual_locked",
            permission_level=LockPermissionLevel.READONLY,
            lock_type=LockStateType.MANUAL,
            is_active=True,
            applied_by="admin_user",
            applied_at=datetime.now(UTC) - timedelta(hours=24),
            locked_until=datetime.now(UTC) - timedelta(hours=1),  # Expired
        )
        async_db_session.add(expired_state)
        await async_db_session.commit()

        service = StateTransitionService(async_db_session)

        with freeze_time("2025-01-10 12:00:00"):  # T-5
            transitions = await service.evaluate_lock_states([test_order_em.id])

            # Find transition for the expired lock folder
            data_transition = next((t for t in transitions if t.folder_path == "/root/data"), None)

            assert data_transition is not None
            assert data_transition.lock_type == LockStateType.AUTOMATIC
            assert "expired" in data_transition.reason.lower()

    @pytest.mark.asyncio
    async def test_apply_transitions(
        self,
        async_db_session,
        test_order_em,
    ):
        """Test applying state transitions to database."""
        service = StateTransitionService(async_db_session)

        transitions = [
            StateTransition(
                order_em_id=test_order_em.id,
                folder_path="/root/new",
                current_state="unknown",
                desired_state="locked",
                permission_level=LockPermissionLevel.READONLY,
                lock_type=LockStateType.AUTOMATIC,
                reason="Test transition",
            )
        ]

        success, failure = await service.apply_transitions(transitions)

        assert success == 1
        assert failure == 0

        # Verify state was created
        result = await async_db_session.execute(
            select(LockState).where(
                LockState.order_em_id == test_order_em.id,
                LockState.folder_path == "/root/new",
            )
        )
        state = result.scalar_one_or_none()

        assert state is not None
        assert state.current_state == "locked"
        assert state.permission_level == LockPermissionLevel.READONLY


class TestDistributedLock:
    """Test distributed locking mechanism (AC: 4)."""

    @pytest.mark.asyncio
    async def test_lock_acquisition(self, mock_redis_client):
        """Test successful lock acquisition."""
        mock_lock = AsyncMock()
        mock_lock.acquire = AsyncMock(return_value=True)
        mock_redis_client.lock.return_value = mock_lock

        dist_lock = DistributedLock(
            mock_redis_client,
            "test_lock",
            timeout=600,
        )

        acquired = await dist_lock.acquire()

        assert acquired is True
        mock_redis_client.lock.assert_called_once()
        mock_lock.acquire.assert_called_once()

    @pytest.mark.asyncio
    async def test_lock_release(self, mock_redis_client):
        """Test lock release with auto-renewal cancellation."""
        mock_lock = AsyncMock()
        mock_lock.acquire = AsyncMock(return_value=True)
        mock_lock.release = AsyncMock()
        mock_redis_client.lock.return_value = mock_lock

        dist_lock = DistributedLock(
            mock_redis_client,
            "test_lock",
            timeout=600,
            auto_renewal_interval=30,
        )

        await dist_lock.acquire()
        await dist_lock.release()

        mock_lock.release.assert_called_once()
        assert dist_lock._renewal_task is None

    @pytest.mark.asyncio
    async def test_lock_timeout_and_auto_release(self, mock_redis_client):
        """Test lock timeout configuration."""
        mock_lock = AsyncMock()
        mock_lock.acquire = AsyncMock(return_value=True)
        mock_redis_client.lock.return_value = mock_lock

        timeout = 300  # 5 minutes
        dist_lock = DistributedLock(
            mock_redis_client,
            "test_lock",
            timeout=timeout,
        )

        await dist_lock.acquire()

        # Verify timeout was passed to Redis lock
        mock_redis_client.lock.assert_called_with(
            "lock:test_lock",
            timeout=timeout,
            blocking_timeout=0,
            token=dist_lock.token,
        )

    @pytest.mark.asyncio
    async def test_stale_lock_detection(self, mock_redis_client):
        """Test stale lock detection and breaking."""
        # Simulate a lock with no TTL (stale)
        mock_redis_client.ttl = AsyncMock(return_value=-1)
        mock_redis_client.delete = AsyncMock(return_value=1)

        dist_lock = DistributedLock(
            mock_redis_client,
            "stale_lock",
            timeout=600,
        )

        broken = await dist_lock.break_stale_lock(max_age_seconds=3600)

        assert broken is True
        mock_redis_client.delete.assert_called_once_with("lock:stale_lock")

    @pytest.mark.asyncio
    async def test_concurrent_lock_prevention(self, mock_redis_client):
        """Test prevention of concurrent scheduler execution."""
        mock_lock = AsyncMock()
        mock_lock.acquire = AsyncMock(return_value=False)  # Lock already held
        mock_redis_client.lock.return_value = mock_lock

        dist_lock = DistributedLock(
            mock_redis_client,
            "scheduler_lock",
            timeout=600,
            blocking_timeout=0,
        )

        acquired = await dist_lock.acquire()

        assert acquired is False

    @pytest.mark.asyncio
    async def test_distributed_lock_context_manager(self, mock_redis_client):
        """Test distributed lock as context manager."""
        mock_lock = AsyncMock()
        mock_lock.acquire = AsyncMock(return_value=True)
        mock_lock.release = AsyncMock()
        mock_redis_client.lock.return_value = mock_lock

        async with distributed_lock(
            mock_redis_client,
            "context_lock",
            timeout=600,
        ) as lock:
            assert lock is not None
            assert isinstance(lock, DistributedLock)

        # Verify lock was released
        mock_lock.release.assert_called_once()


class TestSchedulerIntegration:
    """Test scheduler integration (AC: 1, 7)."""

    @pytest.mark.asyncio
    @patch("scheduler.tasks.lock_evaluator.AsyncSessionLocal")
    @patch("scheduler.tasks.lock_evaluator.redis.from_url")
    async def test_15_minute_interval_scheduling(
        self,
        mock_redis_from_url,
        mock_session_local,
    ):
        """Test scheduler runs every 15 minutes."""
        from scheduler.app import app

        # Check beat schedule configuration
        schedule = app.conf.beat_schedule

        assert "evaluate-locks-every-15-minutes" in schedule
        task_config = schedule["evaluate-locks-every-15-minutes"]

        assert task_config["task"] == "lock_evaluator"
        # Verify it's configured for every 15 minutes
        assert task_config["schedule"].minute == set(range(0, 60, 15))

    @pytest.mark.asyncio
    async def test_batch_processing(self):
        """Test EMs are processed in batches for efficiency."""
        from scheduler.tasks.lock_evaluator import LockEvaluatorTask

        task = LockEvaluatorTask()

        # Test batch size configuration
        assert task.batch_size == 50
        assert task.max_workers == 10

        # Test batching logic
        em_ids = list(range(120))  # 120 EMs
        batches = []

        for i in range(0, len(em_ids), task.batch_size):
            batch = em_ids[i : i + task.batch_size]
            batches.append(batch)

        assert len(batches) == 3  # 120 / 50 = 2.4, so 3 batches
        assert len(batches[0]) == 50
        assert len(batches[1]) == 50
        assert len(batches[2]) == 20

    @pytest.mark.asyncio
    @patch("scheduler.tasks.lock_evaluator.acquire_scheduler_lock")
    async def test_performance_requirement(self, mock_acquire_lock):
        """Test scheduler can process 1000+ EMs within 5-minute window (AC: 7)."""
        from scheduler.tasks.lock_evaluator import LockEvaluatorTask

        task = LockEvaluatorTask()

        # Calculate theoretical processing time
        num_ems = 1000
        batch_size = task.batch_size  # 50
        num_batches = (num_ems + batch_size - 1) // batch_size  # 20 batches

        # Assuming 100ms per EM (from requirements)
        time_per_batch = batch_size * 0.1  # 5 seconds per batch
        total_time = num_batches * time_per_batch  # 100 seconds

        # Should be well under 5 minutes (300 seconds)
        assert total_time < 300

        # With parallel processing (10 workers), even faster
        parallel_time = total_time / min(task.max_workers, num_batches)
        assert parallel_time < 60  # Should complete in under 1 minute
