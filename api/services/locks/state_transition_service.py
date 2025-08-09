import logging
from datetime import UTC, datetime, timedelta
from enum import Enum

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import OrderEm
from api.models.lock import LockRule, LockState

logger = logging.getLogger(__name__)


class LockPermissionLevel(str, Enum):
    FULL_ACCESS = "full_access"
    LIMITED_ACCESS = "limited_access"
    UPLOAD_WINDOW = "upload_window"
    READONLY = "readonly"


class LockStateType(str, Enum):
    AUTOMATIC = "automatic"
    MANUAL = "manual"
    CR_OVERRIDE = "cr_override"


class StateTransition:
    def __init__(
        self,
        order_em_id: int,
        folder_path: str,
        current_state: str,
        desired_state: str,
        permission_level: str,
        lock_type: str,
        reason: str,
    ):
        self.order_em_id = order_em_id
        self.folder_path = folder_path
        self.current_state = current_state
        self.desired_state = desired_state
        self.permission_level = permission_level
        self.lock_type = lock_type
        self.reason = reason
        self.requires_change = current_state != desired_state


class TWindowCalculator:
    @staticmethod
    def calculate_window_state(
        t_value: datetime,
        current_time: datetime,
        start_offset: int,
        end_offset: int,
    ) -> tuple[str, str]:
        window_start = t_value + timedelta(days=start_offset)
        window_end = t_value + timedelta(days=end_offset)

        if current_time < window_start:
            # Before the window
            if start_offset <= -8:
                return "before_window", LockPermissionLevel.FULL_ACCESS
            else:
                return "before_window", LockPermissionLevel.LIMITED_ACCESS
        elif window_start <= current_time <= window_end:
            # Within the window
            if start_offset >= -7 and end_offset <= -1:
                return "remediation_window", LockPermissionLevel.LIMITED_ACCESS
            elif start_offset >= 0 and end_offset <= 7:
                return "upload_window", LockPermissionLevel.UPLOAD_WINDOW
            else:
                return "in_window", LockPermissionLevel.LIMITED_ACCESS
        else:
            # After the window
            return "after_window", LockPermissionLevel.READONLY

    @staticmethod
    def get_state_for_t_offset(t_value: datetime, current_time: datetime) -> str:
        days_from_t = (current_time - t_value).days

        if days_from_t < -8:
            return LockPermissionLevel.FULL_ACCESS
        elif -7 <= days_from_t <= -1:
            return LockPermissionLevel.LIMITED_ACCESS
        elif 0 <= days_from_t <= 7:
            return LockPermissionLevel.UPLOAD_WINDOW
        else:
            return LockPermissionLevel.READONLY


class StateTransitionService:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.calculator = TWindowCalculator()

    async def evaluate_lock_states(
        self,
        order_em_ids: list[int],
        current_time: datetime | None = None,
    ) -> list[StateTransition]:
        if current_time is None:
            current_time = datetime.now(UTC)

        transitions = []

        for em_id in order_em_ids:
            em_transitions = await self._evaluate_em_locks(em_id, current_time)
            transitions.extend(em_transitions)

        return transitions

    async def _evaluate_em_locks(
        self,
        order_em_id: int,
        current_time: datetime,
    ) -> list[StateTransition]:
        # Check for CR override first
        cr_state = await self._get_cr_lock_state(order_em_id)
        if cr_state:
            return await self._generate_cr_transitions(order_em_id, cr_state)

        # Check for manual locks
        manual_states = await self._get_manual_lock_states(order_em_id)
        if manual_states:
            return await self._generate_manual_transitions(order_em_id, manual_states)

        # Calculate time-based automatic locks
        return await self._calculate_automatic_transitions(order_em_id, current_time)

    async def _get_cr_lock_state(self, order_em_id: int) -> LockState | None:
        query = select(LockState).where(
            and_(
                LockState.order_em_id == order_em_id,
                LockState.lock_type == LockStateType.CR_OVERRIDE,
                LockState.is_active.is_(True),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_manual_lock_states(self, order_em_id: int) -> list[LockState]:
        query = select(LockState).where(
            and_(
                LockState.order_em_id == order_em_id,
                LockState.lock_type == LockStateType.MANUAL,
                LockState.is_active.is_(True),
            )
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def _generate_cr_transitions(
        self,
        order_em_id: int,
        cr_state: LockState,
    ) -> list[StateTransition]:
        # Get all folders for this EM
        folders = await self._get_em_folders(order_em_id)
        transitions = []

        for folder in folders:
            current = await self._get_current_state(order_em_id, folder)

            transition = StateTransition(
                order_em_id=order_em_id,
                folder_path=folder,
                current_state=current.current_state if current else "unknown",
                desired_state=cr_state.current_state,
                permission_level=cr_state.permission_level,
                lock_type=LockStateType.CR_OVERRIDE,
                reason=f"CR override active until {cr_state.locked_until}",
            )
            transitions.append(transition)

        return transitions

    async def _generate_manual_transitions(
        self,
        order_em_id: int,
        manual_states: list[LockState],
    ) -> list[StateTransition]:
        transitions = []

        for state in manual_states:
            current = await self._get_current_state(order_em_id, state.folder_path)

            # Check if manual lock has expired
            if state.locked_until and datetime.now(UTC) > state.locked_until:
                # Manual lock expired, calculate automatic state
                auto_state = await self._calculate_automatic_state_for_folder(
                    order_em_id,
                    state.folder_path,
                    datetime.now(UTC),
                )
                desired_state = auto_state
                lock_type = LockStateType.AUTOMATIC
                reason = "Manual lock expired, reverting to automatic"
            else:
                desired_state = state.current_state
                lock_type = LockStateType.MANUAL
                reason = f"Manual lock active until {state.locked_until}"

            transition = StateTransition(
                order_em_id=order_em_id,
                folder_path=state.folder_path,
                current_state=current.current_state if current else "unknown",
                desired_state=desired_state,
                permission_level=state.permission_level,
                lock_type=lock_type,
                reason=reason,
            )
            transitions.append(transition)

        return transitions

    async def _calculate_automatic_transitions(
        self,
        order_em_id: int,
        current_time: datetime,
    ) -> list[StateTransition]:
        # Get active lock rules for this EM
        query = select(LockRule).where(
            and_(
                LockRule.order_em_id == order_em_id,
                LockRule.is_active.is_(True),
            )
        )
        result = await self.db.execute(query)
        rules = result.scalars().all()

        if not rules:
            return []

        transitions = []
        folders = await self._get_em_folders(order_em_id)

        for folder in folders:
            # Find applicable rule for this folder
            applicable_rule = self._find_applicable_rule(rules, folder)

            if applicable_rule:
                window_state, permission_level = self.calculator.calculate_window_state(
                    applicable_rule.t_value,
                    current_time,
                    applicable_rule.start_offset,
                    applicable_rule.end_offset,
                )

                current = await self._get_current_state(order_em_id, folder)

                transition = StateTransition(
                    order_em_id=order_em_id,
                    folder_path=folder,
                    current_state=current.current_state if current else "unknown",
                    desired_state=window_state,
                    permission_level=permission_level,
                    lock_type=LockStateType.AUTOMATIC,
                    reason=f"T-window rule: {applicable_rule.rule_name}",
                )
                transitions.append(transition)

        return transitions

    async def _calculate_automatic_state_for_folder(
        self,
        order_em_id: int,
        folder_path: str,
        current_time: datetime,
    ) -> str:
        query = select(LockRule).where(
            and_(
                LockRule.order_em_id == order_em_id,
                LockRule.is_active.is_(True),
            )
        )
        result = await self.db.execute(query)
        rules = result.scalars().all()

        if not rules:
            return LockPermissionLevel.FULL_ACCESS

        applicable_rule = self._find_applicable_rule(rules, folder_path)

        if applicable_rule:
            window_state, _ = self.calculator.calculate_window_state(
                applicable_rule.t_value,
                current_time,
                applicable_rule.start_offset,
                applicable_rule.end_offset,
            )
            return window_state

        return LockPermissionLevel.FULL_ACCESS

    def _find_applicable_rule(
        self,
        rules: list[LockRule],
        folder_path: str,
    ) -> LockRule | None:
        # For now, return the first active rule
        # In the future, this could match based on folder patterns
        return rules[0] if rules else None

    async def _get_current_state(
        self,
        order_em_id: int,
        folder_path: str,
    ) -> LockState | None:
        query = select(LockState).where(
            and_(
                LockState.order_em_id == order_em_id,
                LockState.folder_path == folder_path,
                LockState.is_active.is_(True),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_em_folders(self, order_em_id: int) -> list[str]:
        # Get the EM to find its folders
        query = select(OrderEm).where(OrderEm.id == order_em_id)
        result = await self.db.execute(query)
        em = result.scalar_one_or_none()

        if not em or not em.folder_structure:
            return []

        # Extract folder paths from the structure
        # This assumes folder_structure is a JSON field with paths
        folders = []
        if isinstance(em.folder_structure, dict):
            folders = self._extract_folder_paths(em.folder_structure)
        elif isinstance(em.folder_structure, list):
            folders = em.folder_structure

        return folders

    def _extract_folder_paths(
        self,
        structure: dict,
        parent_path: str = "",
    ) -> list[str]:
        paths = []

        if "path" in structure:
            paths.append(structure["path"])

        if "children" in structure:
            for child in structure["children"]:
                child_paths = self._extract_folder_paths(child, parent_path)
                paths.extend(child_paths)

        return paths

    async def apply_transitions(
        self,
        transitions: list[StateTransition],
    ) -> tuple[int, int]:
        success_count = 0
        failure_count = 0

        for transition in transitions:
            if not transition.requires_change:
                continue

            try:
                await self._apply_single_transition(transition)
                success_count += 1

                logger.info(
                    "State transition applied",
                    extra={
                        "order_em_id": transition.order_em_id,
                        "folder_path": transition.folder_path,
                        "from_state": transition.current_state,
                        "to_state": transition.desired_state,
                        "lock_type": transition.lock_type,
                    },
                )
            except Exception as e:
                failure_count += 1
                logger.error(
                    f"Failed to apply state transition: {e}",
                    extra={
                        "order_em_id": transition.order_em_id,
                        "folder_path": transition.folder_path,
                        "error": str(e),
                    },
                )

        return success_count, failure_count

    async def _apply_single_transition(self, transition: StateTransition):
        # Update or create lock state record
        existing = await self._get_current_state(
            transition.order_em_id,
            transition.folder_path,
        )

        if existing:
            existing.current_state = transition.desired_state
            existing.permission_level = transition.permission_level
            existing.lock_type = transition.lock_type
            existing.updated_at = datetime.now(UTC)
            existing.update_reason = transition.reason
        else:
            new_state = LockState(
                order_em_id=transition.order_em_id,
                folder_path=transition.folder_path,
                current_state=transition.desired_state,
                permission_level=transition.permission_level,
                lock_type=transition.lock_type,
                is_active=True,
                applied_by="system_scheduler",
                applied_at=datetime.now(UTC),
                update_reason=transition.reason,
            )
            self.db.add(new_state)

        await self.db.flush()
