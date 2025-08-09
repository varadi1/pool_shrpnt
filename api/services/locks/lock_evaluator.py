"""Service for evaluating lock rules and determining state transitions."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from api.core.logging import get_logger
from api.models.lock import (
    LockRule,
    LockState,
    LockTransitionLog,
    LockType,
    LockWindowType,
    PermissionLevel,
)

logger = get_logger(__name__)


class LockTransition:
    """Represents a required lock state transition."""

    def __init__(
        self,
        order_em_id: int,
        folder_path: str,
        current_state: LockWindowType | None,
        new_state: LockWindowType,
        current_permission: PermissionLevel | None,
        new_permission: PermissionLevel,
        lock_rule_id: UUID | None = None,
        reason: str = "",
    ):
        """Initialize lock transition.

        Args:
            order_em_id: Order/EM identifier
            folder_path: Path to the folder
            current_state: Current lock state (None if no existing state)
            new_state: New lock state to apply
            current_permission: Current permission level
            new_permission: New permission level to apply
            lock_rule_id: ID of the rule triggering the transition
            reason: Reason for the transition
        """
        self.order_em_id = order_em_id
        self.folder_path = folder_path
        self.current_state = current_state
        self.new_state = new_state
        self.current_permission = current_permission
        self.new_permission = new_permission
        self.lock_rule_id = lock_rule_id
        self.reason = reason

    def __repr__(self) -> str:
        """String representation of the transition."""
        return (
            f"LockTransition(folder={self.folder_path}, "
            f"{self.current_state}->{self.new_state}, "
            f"{self.current_permission}->{self.new_permission})"
        )


class LockEvaluator:
    """Service for evaluating lock rules and determining state transitions."""

    def __init__(self, db: Session):
        """Initialize lock evaluator.

        Args:
            db: Database session
        """
        self.db = db

    def evaluate_current_time_against_rules(
        self, lock_rules: list[LockRule], current_time: datetime | None = None
    ) -> tuple[LockRule, LockWindowType, PermissionLevel] | None:
        """Evaluate current time against lock rules to determine active rule.

        Args:
            lock_rules: List of lock rules to evaluate
            current_time: Time to evaluate (defaults to now)

        Returns:
            Tuple of (active_rule, window_type, permission_level) or None
        """
        if current_time is None:
            current_time = datetime.now(UTC)
        elif current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=UTC)

        for rule in lock_rules:
            if not rule.is_active:
                continue

            # Calculate absolute dates for this rule
            start_date = rule.t_value.replace(tzinfo=UTC) + timedelta(days=rule.start_offset)
            end_date = rule.t_value.replace(tzinfo=UTC) + timedelta(days=rule.end_offset)

            # Make end date inclusive (end of day)
            end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)

            # Check if current time falls within this window
            if start_date <= current_time <= end_date:
                return (
                    rule,
                    LockWindowType(rule.window_type),
                    PermissionLevel(rule.permission_level),
                )

        return None

    def determine_required_transitions(
        self, order_em_id: int, folder_paths: list[str], evaluation_time: datetime | None = None
    ) -> list[LockTransition]:
        """Determine required lock state transitions for folders.

        Args:
            order_em_id: Order/EM identifier
            folder_paths: List of folder paths to evaluate
            evaluation_time: Time to evaluate against (defaults to now)

        Returns:
            List of required transitions
        """
        transitions = []

        if evaluation_time is None:
            evaluation_time = datetime.now(UTC)

        # Get active lock rules for this order/EM
        lock_rules = (
            self.db.query(LockRule)
            .filter(LockRule.order_em_id == order_em_id, LockRule.is_active)
            .order_by(LockRule.start_offset)
            .all()
        )

        if not lock_rules:
            logger.debug(f"No active lock rules for order_em_id={order_em_id}")
            return transitions

        # Evaluate what the current state should be based on rules
        rule_evaluation = self.evaluate_current_time_against_rules(lock_rules, evaluation_time)

        if not rule_evaluation:
            logger.debug(
                f"No matching lock window for order_em_id={order_em_id} "
                f"at {evaluation_time.isoformat()}"
            )
            return transitions

        active_rule, target_state, target_permission = rule_evaluation

        # Check current state for each folder
        for folder_path in folder_paths:
            # First check for manual locks (highest priority)
            manual_lock = (
                self.db.query(LockState)
                .filter(
                    LockState.order_em_id == order_em_id,
                    LockState.folder_path == folder_path,
                    LockState.is_active == True,
                    LockState.lock_type == LockType.MANUAL,
                )
                .first()
            )

            # If manual lock exists, skip this folder (manual locks have priority)
            if manual_lock:
                logger.info(
                    f"Skipping folder {folder_path} - has active manual lock",
                    extra={"order_em_id": order_em_id, "folder_path": folder_path},
                )
                continue

            # Check for CR locks (medium priority) - would be implemented for CR system
            # cr_lock = self._check_cr_lock(order_em_id, folder_path)
            # if cr_lock:
            #     continue

            # Now check current automatic lock state
            current_lock = (
                self.db.query(LockState)
                .filter(
                    LockState.order_em_id == order_em_id,
                    LockState.folder_path == folder_path,
                    LockState.lock_type == LockType.AUTOMATIC,
                )
                .first()
            )

            # Determine if transition is needed
            needs_transition = False
            current_state = None
            current_permission = None

            if not current_lock:
                # No existing lock state, need to create one
                needs_transition = True
                reason = f"Initial lock state: {target_state}"
            else:
                current_state = LockWindowType(current_lock.current_state)
                current_permission = PermissionLevel(current_lock.permission_level)

                # Check if state or permission changed
                if current_state != target_state or current_permission != target_permission:
                    needs_transition = True
                    reason = (
                        f"Time-based transition: {current_state}->{target_state}, "
                        f"permission {current_permission}->{target_permission}"
                    )

            if needs_transition:
                transition = LockTransition(
                    order_em_id=order_em_id,
                    folder_path=folder_path,
                    current_state=current_state,
                    new_state=target_state,
                    current_permission=current_permission,
                    new_permission=target_permission,
                    lock_rule_id=active_rule.id,
                    reason=reason,
                )
                transitions.append(transition)

        logger.info(
            f"Evaluated {len(folder_paths)} folders, "
            f"found {len(transitions)} required transitions",
            extra={
                "order_em_id": order_em_id,
                "folder_count": len(folder_paths),
                "transition_count": len(transitions),
            },
        )

        return transitions

    def apply_transition(
        self, transition: LockTransition, evaluation_run_id: UUID, correlation_id: str
    ) -> LockTransitionLog:
        """Apply a lock state transition.

        Args:
            transition: Transition to apply
            evaluation_run_id: ID linking transitions in same evaluation
            correlation_id: Correlation ID for tracing

        Returns:
            Transition log entry
        """
        try:
            # Get or create lock state
            lock_state = (
                self.db.query(LockState)
                .filter(
                    LockState.order_em_id == transition.order_em_id,
                    LockState.folder_path == transition.folder_path,
                )
                .first()
            )

            if not lock_state:
                # Create new lock state
                lock_state = LockState(
                    id=uuid4(),
                    order_em_id=transition.order_em_id,
                    folder_id=uuid4(),  # Generate a folder ID for now
                    folder_path=transition.folder_path,
                    current_state=transition.new_state,
                    permission_level=transition.new_permission,
                    locked_at=datetime.now(UTC),
                    locked_by_rule_id=transition.lock_rule_id,
                    is_manual_override=False,
                    created_at=datetime.now(UTC),
                )
                self.db.add(lock_state)
            else:
                # Update existing lock state
                lock_state.current_state = transition.new_state
                lock_state.permission_level = transition.new_permission
                lock_state.locked_at = datetime.now(UTC)
                lock_state.locked_by_rule_id = transition.lock_rule_id
                lock_state.updated_at = datetime.now(UTC)

            # Create transition log entry
            log_entry = LockTransitionLog(
                id=uuid4(),
                lock_rule_id=transition.lock_rule_id,
                order_em_id=transition.order_em_id,
                folder_path=transition.folder_path,
                previous_state=transition.current_state,
                new_state=transition.new_state,
                previous_permission=transition.current_permission,
                new_permission=transition.new_permission,
                transition_reason=transition.reason,
                transitioned_at=datetime.now(UTC),
                evaluation_run_id=evaluation_run_id,
                success=True,
                correlation_id=correlation_id,
            )
            self.db.add(log_entry)
            self.db.commit()

            logger.info(
                f"Applied lock transition: {transition}",
                extra={
                    "order_em_id": transition.order_em_id,
                    "folder_path": transition.folder_path,
                    "transition": f"{transition.current_state}->{transition.new_state}",
                    "evaluation_run_id": str(evaluation_run_id),
                },
            )

            return log_entry

        except Exception as e:
            # Log failed transition
            log_entry = LockTransitionLog(
                id=uuid4(),
                lock_rule_id=transition.lock_rule_id,
                order_em_id=transition.order_em_id,
                folder_path=transition.folder_path,
                previous_state=transition.current_state,
                new_state=transition.new_state,
                previous_permission=transition.current_permission,
                new_permission=transition.new_permission,
                transition_reason=transition.reason,
                transitioned_at=datetime.now(UTC),
                evaluation_run_id=evaluation_run_id,
                success=False,
                error_message=str(e),
                correlation_id=correlation_id,
            )
            self.db.add(log_entry)
            self.db.commit()

            logger.error(
                f"Failed to apply lock transition: {e}",
                extra={
                    "order_em_id": transition.order_em_id,
                    "folder_path": transition.folder_path,
                    "error": str(e),
                    "evaluation_run_id": str(evaluation_run_id),
                },
            )

            raise

    def handle_edge_cases(self, evaluation_time: datetime, t_value: datetime) -> datetime:
        """Handle edge cases like DST transitions and leap years.

        Args:
            evaluation_time: Time being evaluated
            t_value: T+0 reference date

        Returns:
            Adjusted evaluation time
        """
        # Ensure all times are timezone-aware UTC
        if evaluation_time.tzinfo is None:
            evaluation_time = evaluation_time.replace(tzinfo=UTC)
        if t_value.tzinfo is None:
            t_value = t_value.replace(tzinfo=UTC)

        # For DST transitions, we work in UTC so no adjustment needed
        # The frontend will handle display in local timezone

        # For leap years, Python's datetime handles this correctly
        # No special handling needed

        return evaluation_time

    def generate_transition_tasks(
        self, transitions: list[LockTransition]
    ) -> dict[str, list[LockTransition]]:
        """Group transitions by order/EM for batch processing.

        Args:
            transitions: List of transitions to process

        Returns:
            Dictionary mapping order_em_id to list of transitions
        """
        tasks = {}

        for transition in transitions:
            em_id = str(transition.order_em_id)
            if em_id not in tasks:
                tasks[em_id] = []
            tasks[em_id].append(transition)

        logger.debug(
            f"Generated {len(tasks)} transition task groups "
            f"for {len(transitions)} total transitions"
        )

        return tasks

    def evaluate_all_active_orders(
        self, evaluation_time: datetime | None = None
    ) -> list[LockTransition]:
        """Evaluate all active orders and determine required transitions.

        Args:
            evaluation_time: Time to evaluate (defaults to now)

        Returns:
            List of all required transitions
        """
        if evaluation_time is None:
            evaluation_time = datetime.now(UTC)

        # Get all orders with active lock rules
        order_ids = self.db.query(LockRule.order_em_id).filter(LockRule.is_active).distinct().all()

        all_transitions = []

        for (order_em_id,) in order_ids:
            # Get all folders for this order (simplified for now)
            # In practice, this would query the actual folder structure
            folder_paths = [f"/teams/order_{order_em_id}/documents"]

            transitions = self.determine_required_transitions(
                order_em_id, folder_paths, evaluation_time
            )
            all_transitions.extend(transitions)

        logger.info(
            f"Evaluated {len(order_ids)} orders, "
            f"found {len(all_transitions)} total transitions",
            extra={
                "order_count": len(order_ids),
                "total_transitions": len(all_transitions),
            },
        )

        return all_transitions

    def check_and_expire_manual_locks(self, max_duration_hours: int = 48) -> list[tuple[int, str]]:
        """Check for expired manual locks and deactivate them.

        Args:
            max_duration_hours: Maximum duration for manual locks (default 48 hours)

        Returns:
            List of (order_em_id, folder_path) tuples for expired locks
        """
        expiry_time = datetime.now(UTC) - timedelta(hours=max_duration_hours)

        # Find expired manual locks
        expired_locks = (
            self.db.query(LockState)
            .filter(
                LockState.is_active == True,
                LockState.lock_type == LockType.MANUAL,
                LockState.locked_at < expiry_time,
            )
            .all()
        )

        expired_list = []
        for lock in expired_locks:
            # Deactivate the expired lock
            lock.is_active = False
            lock.removed_at = datetime.now(UTC)
            lock.removal_reason = f"Manual lock expired after {max_duration_hours} hours"
            lock.updated_at = datetime.now(UTC)

            # Log the expiry
            transition_log = LockTransitionLog(
                order_em_id=lock.order_em_id,
                folder_path=lock.folder_path,
                previous_state="locked",
                new_state="expired",
                previous_permission=lock.permission_level,
                new_permission=PermissionLevel.FULL,
                transition_reason=f"Manual lock auto-expired after {max_duration_hours} hours",
                success=True,
                correlation_id=f"expiry_{uuid4()}",
            )
            self.db.add(transition_log)

            expired_list.append((lock.order_em_id, lock.folder_path))

            logger.info(
                f"Expired manual lock for {lock.folder_path}",
                extra={
                    "order_em_id": lock.order_em_id,
                    "folder_path": lock.folder_path,
                    "locked_at": lock.locked_at.isoformat() if lock.locked_at else None,
                    "duration_hours": max_duration_hours,
                },
            )

        if expired_list:
            self.db.commit()

        return expired_list
