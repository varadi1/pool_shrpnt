"""Service for managing time-based lock rules."""

import json
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from api.core.errors import BadRequestError, ConflictError, NotFoundError
from api.core.logging import get_logger
from api.models.lock import (
    LockRule,
    LockRuleTemplate,
    LockWindowType,
    PermissionLevel,
)

logger = get_logger(__name__)


class LockRuleService:
    """Service for managing time-based lock rules."""

    def __init__(self, db: Session):
        """Initialize lock rule service.

        Args:
            db: Database session
        """
        self.db = db

    def parse_t_relative_expression(self, expression: str, t_value: datetime) -> datetime:
        """Parse T-relative expression (e.g., T-3, T+0, T+8) to absolute date.

        Args:
            expression: T-relative expression string
            t_value: The T+0 reference date

        Returns:
            Absolute datetime calculated from T-value

        Raises:
            BadRequestError: If expression format is invalid
        """
        pattern = r"^T([+-]?\d+)$"
        match = re.match(pattern, expression.upper())

        if not match:
            raise BadRequestError(f"Invalid T-relative expression: {expression}")

        offset_days = int(match.group(1))
        return t_value + timedelta(days=offset_days)

    def calculate_absolute_dates(
        self, t_value: datetime, start_offset: int, end_offset: int
    ) -> tuple[datetime, datetime]:
        """Calculate absolute dates from T-value and offsets.

        Args:
            t_value: The T+0 reference date
            start_offset: Days relative to T (can be negative)
            end_offset: Days relative to T

        Returns:
            Tuple of (start_date, end_date)
        """
        # Ensure t_value is timezone-aware
        if t_value.tzinfo is None:
            t_value = t_value.replace(tzinfo=UTC)

        start_date = t_value + timedelta(days=start_offset)
        end_date = t_value + timedelta(days=end_offset)

        # End date should be at end of day (23:59:59)
        end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)

        return start_date, end_date

    def validate_non_overlapping_windows(
        self,
        order_em_id: int,
        start_offset: int,
        end_offset: int,
        t_value: datetime,
        exclude_rule_id: UUID | None = None,
    ) -> None:
        """Validate that lock windows don't overlap for the same order/EM.

        Args:
            order_em_id: Order/EM identifier
            start_offset: Start offset in days from T
            end_offset: End offset in days from T
            t_value: The T+0 reference date
            exclude_rule_id: Rule ID to exclude from check (for updates)

        Raises:
            ConflictError: If windows overlap
        """
        query = self.db.query(LockRule).filter(
            LockRule.order_em_id == order_em_id, LockRule.is_active
        )

        if exclude_rule_id:
            query = query.filter(LockRule.id != exclude_rule_id)

        existing_rules = query.all()

        for rule in existing_rules:
            # Check if windows overlap
            # Windows overlap if: start1 <= end2 AND end1 >= start2
            if start_offset <= rule.end_offset and end_offset >= rule.start_offset:
                raise ConflictError(
                    f"Lock window overlaps with existing rule '{rule.rule_name}' "
                    f"(T{rule.start_offset:+d} to T{rule.end_offset:+d})"
                )

    def create_lock_rule(
        self,
        order_em_id: int,
        rule_name: str,
        t_value: datetime,
        window_type: LockWindowType,
        start_offset: int,
        end_offset: int,
        permission_level: PermissionLevel,
        created_by: str,
    ) -> LockRule:
        """Create a new lock rule.

        Args:
            order_em_id: Order/EM identifier
            rule_name: Name for the rule
            t_value: The T+0 reference date
            window_type: Type of lock window
            start_offset: Days relative to T (can be negative)
            end_offset: Days relative to T
            permission_level: Permission level for the window
            created_by: User creating the rule

        Returns:
            Created lock rule

        Raises:
            ConflictError: If windows overlap with existing rules
        """
        # Validate non-overlapping windows
        self.validate_non_overlapping_windows(order_em_id, start_offset, end_offset, t_value)

        # Ensure t_value is timezone-aware
        if t_value.tzinfo is None:
            t_value = t_value.replace(tzinfo=UTC)

        lock_rule = LockRule(
            id=uuid4(),
            order_em_id=order_em_id,
            rule_name=rule_name,
            t_value=t_value,
            window_type=window_type,
            start_offset=start_offset,
            end_offset=end_offset,
            permission_level=permission_level,
            is_active=True,
            created_by=created_by,
            created_at=datetime.now(UTC),
        )

        self.db.add(lock_rule)
        self.db.commit()
        self.db.refresh(lock_rule)

        logger.info(
            f"Created lock rule '{rule_name}' for order_em_id={order_em_id}",
            extra={
                "order_em_id": order_em_id,
                "rule_id": str(lock_rule.id),
                "window": f"T{start_offset:+d} to T{end_offset:+d}",
            },
        )

        return lock_rule

    def create_rules_from_template(
        self,
        order_em_id: int,
        template_name: str,
        t_value: datetime,
        created_by: str,
    ) -> list[LockRule]:
        """Create lock rules from a pre-configured template.

        Args:
            order_em_id: Order/EM identifier
            template_name: Name of the template to use
            t_value: The T+0 reference date
            created_by: User creating the rules

        Returns:
            List of created lock rules

        Raises:
            NotFoundError: If template not found
            BadRequestError: If template configuration is invalid
        """
        template = (
            self.db.query(LockRuleTemplate)
            .filter(
                LockRuleTemplate.template_name == template_name,
                LockRuleTemplate.is_active,
            )
            .first()
        )

        if not template:
            raise NotFoundError(f"Lock rule template '{template_name}' not found")

        try:
            rules_config = json.loads(template.rules_config)
        except json.JSONDecodeError as e:
            raise BadRequestError(f"Invalid template configuration: {e}")

        created_rules = []

        for rule_config in rules_config.get("rules", []):
            try:
                lock_rule = self.create_lock_rule(
                    order_em_id=order_em_id,
                    rule_name=rule_config["name"],
                    t_value=t_value,
                    window_type=LockWindowType(rule_config["window_type"]),
                    start_offset=rule_config["start_offset"],
                    end_offset=rule_config["end_offset"],
                    permission_level=PermissionLevel(rule_config["permission_level"]),
                    created_by=created_by,
                )
                created_rules.append(lock_rule)
            except Exception as e:
                # Rollback all created rules if any fail
                for rule in created_rules:
                    self.db.delete(rule)
                self.db.commit()
                raise BadRequestError(f"Failed to create rule from template: {e}")

        logger.info(
            f"Created {len(created_rules)} rules from template '{template_name}'",
            extra={
                "order_em_id": order_em_id,
                "template_name": template_name,
                "rule_count": len(created_rules),
            },
        )

        return created_rules

    def get_lock_rules(self, order_em_id: int, active_only: bool = True) -> list[LockRule]:
        """Get lock rules for an order/EM.

        Args:
            order_em_id: Order/EM identifier
            active_only: Whether to return only active rules

        Returns:
            List of lock rules
        """
        query = self.db.query(LockRule).filter(LockRule.order_em_id == order_em_id)

        if active_only:
            query = query.filter(LockRule.is_active)

        return query.order_by(LockRule.start_offset).all()

    def update_lock_rule(
        self,
        rule_id: UUID,
        rule_name: str | None = None,
        t_value: datetime | None = None,
        window_type: LockWindowType | None = None,
        start_offset: int | None = None,
        end_offset: int | None = None,
        permission_level: PermissionLevel | None = None,
        is_active: bool | None = None,
    ) -> LockRule:
        """Update an existing lock rule.

        Args:
            rule_id: Lock rule identifier
            rule_name: New rule name
            t_value: New T+0 reference date
            window_type: New window type
            start_offset: New start offset
            end_offset: New end offset
            permission_level: New permission level
            is_active: New active status

        Returns:
            Updated lock rule

        Raises:
            NotFoundError: If rule not found
            ConflictError: If updated windows would overlap
        """
        lock_rule = self.db.query(LockRule).filter(LockRule.id == rule_id).first()

        if not lock_rule:
            raise NotFoundError(f"Lock rule {rule_id} not found")

        # Check if offset changes would cause overlap
        if start_offset is not None or end_offset is not None:
            new_start = start_offset if start_offset is not None else lock_rule.start_offset
            new_end = end_offset if end_offset is not None else lock_rule.end_offset
            new_t_value = t_value if t_value is not None else lock_rule.t_value

            self.validate_non_overlapping_windows(
                lock_rule.order_em_id, new_start, new_end, new_t_value, rule_id
            )

        # Update fields if provided
        if rule_name is not None:
            lock_rule.rule_name = rule_name
        if t_value is not None:
            if t_value.tzinfo is None:
                t_value = t_value.replace(tzinfo=UTC)
            lock_rule.t_value = t_value
        if window_type is not None:
            lock_rule.window_type = window_type
        if start_offset is not None:
            lock_rule.start_offset = start_offset
        if end_offset is not None:
            lock_rule.end_offset = end_offset
        if permission_level is not None:
            lock_rule.permission_level = permission_level
        if is_active is not None:
            lock_rule.is_active = is_active

        lock_rule.updated_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(lock_rule)

        logger.info(
            f"Updated lock rule {rule_id}",
            extra={"rule_id": str(rule_id), "order_em_id": lock_rule.order_em_id},
        )

        return lock_rule

    def delete_lock_rule(self, rule_id: UUID) -> None:
        """Delete a lock rule.

        Args:
            rule_id: Lock rule identifier

        Raises:
            NotFoundError: If rule not found
        """
        lock_rule = self.db.query(LockRule).filter(LockRule.id == rule_id).first()

        if not lock_rule:
            raise NotFoundError(f"Lock rule {rule_id} not found")

        self.db.delete(lock_rule)
        self.db.commit()

        logger.info(
            f"Deleted lock rule {rule_id}",
            extra={"rule_id": str(rule_id), "order_em_id": lock_rule.order_em_id},
        )

    def create_standard_lock_windows(
        self, order_em_id: int, t_value: datetime, created_by: str
    ) -> list[LockRule]:
        """Create standard lock windows as defined in PRD.

        Standard windows:
        - T-3 to T-1: Pre-release (read access)
        - T+0 to T+7: Active window (full access)
        - T+8 onwards: Locked (read-only)

        Args:
            order_em_id: Order/EM identifier
            t_value: The T+0 reference date
            created_by: User creating the rules

        Returns:
            List of created lock rules
        """
        rules = []

        # Pre-release window (T-3 to T-1)
        rules.append(
            self.create_lock_rule(
                order_em_id=order_em_id,
                rule_name="Pre-release notification",
                t_value=t_value,
                window_type=LockWindowType.PRE_RELEASE,
                start_offset=-3,
                end_offset=-1,
                permission_level=PermissionLevel.READ,
                created_by=created_by,
            )
        )

        # Active window (T+0 to T+7)
        rules.append(
            self.create_lock_rule(
                order_em_id=order_em_id,
                rule_name="Active upload window",
                t_value=t_value,
                window_type=LockWindowType.ACTIVE,
                start_offset=0,
                end_offset=7,
                permission_level=PermissionLevel.FULL,
                created_by=created_by,
            )
        )

        # Locked window (T+8 onwards)
        rules.append(
            self.create_lock_rule(
                order_em_id=order_em_id,
                rule_name="Automatic read-only lock",
                t_value=t_value,
                window_type=LockWindowType.LOCKED,
                start_offset=8,
                end_offset=365,  # Effectively "forever" - 1 year
                permission_level=PermissionLevel.READ,
                created_by=created_by,
            )
        )

        logger.info(
            f"Created standard lock windows for order_em_id={order_em_id}",
            extra={"order_em_id": order_em_id, "t_value": t_value.isoformat()},
        )

        return rules
