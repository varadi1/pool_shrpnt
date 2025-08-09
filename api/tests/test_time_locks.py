"""Tests for time-based lock functionality."""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from freezegun import freeze_time
from sqlalchemy.orm import Session

from api.core.errors import BadRequestError, ConflictError
from api.models.contract import OrderEm
from api.models.lock import (
    LockRule,
    LockRuleTemplate,
    LockState,
    LockWindowType,
    PermissionLevel,
)
from api.services.locks.lock_evaluator import LockEvaluator, LockTransition
from api.services.locks.lock_rule_service import LockRuleService


@pytest.fixture
def lock_rule_service(test_db: Session):
    """Create lock rule service with test database session."""
    return LockRuleService(test_db)


@pytest.fixture
def lock_evaluator(test_db: Session):
    """Create lock evaluator with test database session."""
    return LockEvaluator(test_db)


@pytest.fixture
def sample_order_em(test_db: Session):
    """Create a sample order/EM for testing."""
    from api.models.contract import Contract, PartnerCompany

    # Create required contract first
    contract = Contract(
        contract_number="C-TEST-001",
        name="Test Contract",
        start_date=datetime.now(UTC),
        status="active",
        created_by="test_user",
    )
    test_db.add(contract)
    test_db.flush()  # Get the ID

    # Create required partner company
    partner = PartnerCompany(
        name="Test Partner",
        short_name="TEST",
        company_code="TEST001",
    )
    test_db.add(partner)
    test_db.flush()  # Get the ID

    order = OrderEm(
        em_number="EM-2025-001",
        title="Test Order",
        contract_id=contract.id,
        partner_company_id=partner.id,
        year=2025,
        part="A",
    )
    test_db.add(order)
    test_db.commit()
    return order


class TestLockRuleService:
    """Test lock rule service functionality."""

    def test_parse_t_relative_expression(self, lock_rule_service):
        """Test parsing T-relative expressions."""
        t_value = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        # Test positive offset
        result = lock_rule_service.parse_t_relative_expression("T+8", t_value)
        assert result == datetime(2025, 1, 23, 12, 0, 0, tzinfo=UTC)

        # Test negative offset
        result = lock_rule_service.parse_t_relative_expression("T-3", t_value)
        assert result == datetime(2025, 1, 12, 12, 0, 0, tzinfo=UTC)

        # Test zero offset
        result = lock_rule_service.parse_t_relative_expression("T+0", t_value)
        assert result == t_value

        # Test invalid expression
        with pytest.raises(BadRequestError):
            lock_rule_service.parse_t_relative_expression("invalid", t_value)

    def test_calculate_absolute_dates(self, lock_rule_service):
        """Test calculating absolute dates from T-value and offsets."""
        t_value = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        start_date, end_date = lock_rule_service.calculate_absolute_dates(t_value, -3, 7)

        assert start_date == datetime(2025, 1, 12, 12, 0, 0, tzinfo=UTC)
        assert end_date.date() == datetime(2025, 1, 22).date()
        assert end_date.hour == 23
        assert end_date.minute == 59

    def test_validate_non_overlapping_windows(self, lock_rule_service, test_db, sample_order_em):
        """Test validation of non-overlapping lock windows."""
        t_value = datetime(2025, 1, 15, tzinfo=UTC)

        # Create first rule
        rule1 = LockRule(
            id=uuid4(),
            order_em_id=sample_order_em.id,
            rule_name="Rule 1",
            t_value=t_value,
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test_user",
        )
        test_db.add(rule1)
        test_db.commit()

        # Test overlapping window - should raise ConflictError
        with pytest.raises(ConflictError):
            lock_rule_service.validate_non_overlapping_windows(sample_order_em.id, 5, 10, t_value)

        # Test non-overlapping window - should not raise
        lock_rule_service.validate_non_overlapping_windows(sample_order_em.id, 8, 15, t_value)

    def test_create_lock_rule(self, lock_rule_service, test_db, sample_order_em):
        """Test creating a lock rule."""
        t_value = datetime(2025, 1, 15, tzinfo=UTC)

        rule = lock_rule_service.create_lock_rule(
            order_em_id=sample_order_em.id,
            rule_name="Test Rule",
            t_value=t_value,
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            created_by="test_user",
        )

        assert rule.id is not None
        assert rule.order_em_id == sample_order_em.id
        assert rule.rule_name == "Test Rule"
        assert rule.window_type == LockWindowType.ACTIVE
        assert rule.start_offset == 0
        assert rule.end_offset == 7

    def test_create_standard_lock_windows(self, lock_rule_service, test_db, sample_order_em):
        """Test creating standard lock windows."""
        t_value = datetime(2025, 1, 15, tzinfo=UTC)

        rules = lock_rule_service.create_standard_lock_windows(
            sample_order_em.id, t_value, "test_user"
        )

        assert len(rules) == 3

        # Check pre-release window
        pre_release = rules[0]
        assert pre_release.window_type == LockWindowType.PRE_RELEASE
        assert pre_release.start_offset == -3
        assert pre_release.end_offset == -1
        assert pre_release.permission_level == PermissionLevel.READ

        # Check active window
        active = rules[1]
        assert active.window_type == LockWindowType.ACTIVE
        assert active.start_offset == 0
        assert active.end_offset == 7
        assert active.permission_level == PermissionLevel.FULL

        # Check locked window
        locked = rules[2]
        assert locked.window_type == LockWindowType.LOCKED
        assert locked.start_offset == 8
        assert locked.permission_level == PermissionLevel.READ

    def test_create_rules_from_template(self, lock_rule_service, test_db, sample_order_em):
        """Test creating rules from a template."""
        # Create a template
        template_config = {
            "rules": [
                {
                    "name": "Pre-release",
                    "window_type": "pre_release",
                    "start_offset": -3,
                    "end_offset": -1,
                    "permission_level": "read",
                },
                {
                    "name": "Active",
                    "window_type": "active",
                    "start_offset": 0,
                    "end_offset": 7,
                    "permission_level": "full",
                },
            ]
        }

        template = LockRuleTemplate(
            id=uuid4(),
            template_name="standard",
            description="Standard lock template",
            rules_config=json.dumps(template_config),
            is_active=True,
        )
        test_db.add(template)
        test_db.commit()

        t_value = datetime(2025, 1, 15, tzinfo=UTC)

        rules = lock_rule_service.create_rules_from_template(
            sample_order_em.id, "standard", t_value, "test_user"
        )

        assert len(rules) == 2
        assert rules[0].rule_name == "Pre-release"
        assert rules[1].rule_name == "Active"


class TestLockEvaluator:
    """Test lock evaluator functionality."""

    @freeze_time("2025-01-15 12:00:00")
    def test_evaluate_current_time_against_rules(self, lock_evaluator, test_db, sample_order_em):
        """Test evaluating current time against lock rules."""
        t_value = datetime(2025, 1, 10, tzinfo=UTC)

        # Create rules
        rules = [
            LockRule(
                id=uuid4(),
                order_em_id=sample_order_em.id,
                rule_name="Pre-release",
                t_value=t_value,
                window_type=LockWindowType.PRE_RELEASE,
                start_offset=-3,
                end_offset=-1,
                permission_level=PermissionLevel.READ,
                is_active=True,
                created_by="test",
            ),
            LockRule(
                id=uuid4(),
                order_em_id=sample_order_em.id,
                rule_name="Active",
                t_value=t_value,
                window_type=LockWindowType.ACTIVE,
                start_offset=0,
                end_offset=7,
                permission_level=PermissionLevel.FULL,
                is_active=True,
                created_by="test",
            ),
        ]

        # Test time in active window (Jan 15 is T+5)
        result = lock_evaluator.evaluate_current_time_against_rules(rules)
        assert result is not None
        rule, window_type, permission = result
        assert window_type == LockWindowType.ACTIVE
        assert permission == PermissionLevel.FULL

    def test_determine_required_transitions(self, lock_evaluator, test_db, sample_order_em):
        """Test determining required lock state transitions."""
        t_value = datetime(2025, 1, 10, tzinfo=UTC)
        eval_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        # Create a lock rule
        rule = LockRule(
            id=uuid4(),
            order_em_id=sample_order_em.id,
            rule_name="Active",
            t_value=t_value,
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test",
        )
        test_db.add(rule)
        test_db.commit()

        folder_paths = ["/teams/test/documents"]

        transitions = lock_evaluator.determine_required_transitions(
            sample_order_em.id, folder_paths, eval_time
        )

        assert len(transitions) == 1
        transition = transitions[0]
        assert transition.new_state == LockWindowType.ACTIVE
        assert transition.new_permission == PermissionLevel.FULL
        assert transition.folder_path == "/teams/test/documents"

    def test_apply_transition(self, lock_evaluator, test_db, sample_order_em):
        """Test applying a lock state transition."""
        # Create a lock rule first
        rule = LockRule(
            id=uuid4(),
            order_em_id=sample_order_em.id,
            rule_name="Test Rule",
            t_value=datetime.now(UTC),
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test_user",
        )
        test_db.add(rule)
        test_db.flush()

        transition = LockTransition(
            order_em_id=sample_order_em.id,
            folder_path="/teams/test/documents",
            current_state=None,
            new_state=LockWindowType.ACTIVE,
            current_permission=None,
            new_permission=PermissionLevel.FULL,
            lock_rule_id=rule.id,
            reason="Test transition",
        )

        evaluation_run_id = uuid4()
        correlation_id = "test_correlation"

        log_entry = lock_evaluator.apply_transition(transition, evaluation_run_id, correlation_id)

        assert log_entry.success is True
        assert log_entry.new_state == LockWindowType.ACTIVE
        assert log_entry.new_permission == PermissionLevel.FULL

        # Check that lock state was created
        lock_state = (
            test_db.query(LockState)
            .filter(
                LockState.order_em_id == sample_order_em.id,
                LockState.folder_path == "/teams/test/documents",
            )
            .first()
        )
        assert lock_state is not None
        assert lock_state.current_state == LockWindowType.ACTIVE
        assert lock_state.permission_level == PermissionLevel.FULL

    def test_handle_edge_cases(self, lock_evaluator):
        """Test handling of edge cases (DST, leap years)."""
        # Test with timezone-naive datetime
        naive_time = datetime(2025, 1, 15, 12, 0, 0)
        t_value = datetime(2025, 1, 10, tzinfo=UTC)

        result = lock_evaluator.handle_edge_cases(naive_time, t_value)
        assert result.tzinfo is not None
        assert result.tzinfo == UTC

        # Test with DST transition date (example: March 10, 2025)
        dst_time = datetime(2025, 3, 10, 2, 0, 0, tzinfo=UTC)
        result = lock_evaluator.handle_edge_cases(dst_time, t_value)
        assert result == dst_time  # Should remain in UTC

        # Test with leap year date (Feb 29, 2024)
        leap_time = datetime(2024, 2, 29, 12, 0, 0, tzinfo=UTC)
        leap_t_value = datetime(2024, 2, 25, tzinfo=UTC)
        result = lock_evaluator.handle_edge_cases(leap_time, leap_t_value)
        assert result.day == 29
        assert result.month == 2

    def test_generate_transition_tasks(self, lock_evaluator, sample_order_em):
        """Test grouping transitions by order for batch processing."""
        transitions = [
            LockTransition(
                order_em_id=sample_order_em.id,
                folder_path="/teams/test/documents",
                current_state=None,
                new_state=LockWindowType.ACTIVE,
                current_permission=None,
                new_permission=PermissionLevel.FULL,
                reason="Test 1",
            ),
            LockTransition(
                order_em_id=sample_order_em.id,
                folder_path="/teams/test/templates",
                current_state=None,
                new_state=LockWindowType.ACTIVE,
                current_permission=None,
                new_permission=PermissionLevel.FULL,
                reason="Test 2",
            ),
            LockTransition(
                order_em_id=999,
                folder_path="/teams/other/documents",
                current_state=None,
                new_state=LockWindowType.LOCKED,
                current_permission=None,
                new_permission=PermissionLevel.READ,
                reason="Test 3",
            ),
        ]

        tasks = lock_evaluator.generate_transition_tasks(transitions)

        assert len(tasks) == 2
        assert str(sample_order_em.id) in tasks
        assert "999" in tasks
        assert len(tasks[str(sample_order_em.id)]) == 2
        assert len(tasks["999"]) == 1


class TestTimezoneHandling:
    """Test timezone handling across the system."""

    def test_timezone_aware_dates(self, lock_rule_service):
        """Test that all dates are properly timezone-aware."""
        # Test with naive datetime
        naive_t_value = datetime(2025, 1, 15, 12, 0, 0)

        start_date, end_date = lock_rule_service.calculate_absolute_dates(naive_t_value, 0, 7)

        assert start_date.tzinfo is not None
        assert end_date.tzinfo is not None
        assert start_date.tzinfo == UTC
        assert end_date.tzinfo == UTC

    @freeze_time("2025-03-09 06:00:00", tz_offset=0)  # Day before DST
    def test_dst_transition(self, lock_evaluator, test_db, sample_order_em):
        """Test behavior during DST transitions."""
        # Create rule with T+0 on DST transition day
        t_value = datetime(2025, 3, 10, tzinfo=UTC)

        rule = LockRule(
            id=uuid4(),
            order_em_id=sample_order_em.id,
            rule_name="DST Test",
            t_value=t_value,
            window_type=LockWindowType.ACTIVE,
            start_offset=-1,
            end_offset=1,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test",
        )

        # Evaluate before DST
        result = lock_evaluator.evaluate_current_time_against_rules([rule])
        assert result is not None
        _, window_type, _ = result
        assert window_type == LockWindowType.ACTIVE


class TestIdempotency:
    """Test idempotency of lock operations."""

    def test_idempotent_rule_creation(self, lock_rule_service, test_db, sample_order_em):
        """Test that creating the same rule twice fails appropriately."""
        t_value = datetime(2025, 1, 15, tzinfo=UTC)

        # Create first rule
        lock_rule_service.create_lock_rule(
            order_em_id=sample_order_em.id,
            rule_name="Test Rule",
            t_value=t_value,
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            created_by="test_user",
        )

        # Attempt to create overlapping rule should fail
        with pytest.raises(ConflictError):
            lock_rule_service.create_lock_rule(
                order_em_id=sample_order_em.id,
                rule_name="Duplicate Rule",
                t_value=t_value,
                window_type=LockWindowType.ACTIVE,
                start_offset=0,
                end_offset=7,
                permission_level=PermissionLevel.FULL,
                created_by="test_user",
            )

    def test_idempotent_transition_application(self, lock_evaluator, test_db, sample_order_em):
        """Test that applying the same transition twice is idempotent."""
        # Create a lock rule first
        rule = LockRule(
            id=uuid4(),
            order_em_id=sample_order_em.id,
            rule_name="Test Rule",
            t_value=datetime.now(UTC),
            window_type=LockWindowType.ACTIVE,
            start_offset=0,
            end_offset=7,
            permission_level=PermissionLevel.FULL,
            is_active=True,
            created_by="test_user",
        )
        test_db.add(rule)
        test_db.flush()

        transition = LockTransition(
            order_em_id=sample_order_em.id,
            folder_path="/teams/test/documents",
            current_state=None,
            new_state=LockWindowType.ACTIVE,
            current_permission=None,
            new_permission=PermissionLevel.FULL,
            lock_rule_id=rule.id,
            reason="Test transition",
        )

        evaluation_run_id = uuid4()
        correlation_id = "test_correlation"

        # Apply transition first time
        log_entry1 = lock_evaluator.apply_transition(transition, evaluation_run_id, correlation_id)
        assert log_entry1.success is True

        # Apply same transition again (with updated current state)
        transition.current_state = LockWindowType.ACTIVE
        transition.current_permission = PermissionLevel.FULL

        log_entry2 = lock_evaluator.apply_transition(transition, evaluation_run_id, correlation_id)
        assert log_entry2.success is True

        # Check that only one lock state exists
        lock_states = (
            test_db.query(LockState).filter(LockState.order_em_id == sample_order_em.id).all()
        )
        assert len(lock_states) == 1
