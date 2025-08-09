"""Comprehensive unit tests for RBAC permission matrix engine."""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from api.models.rbac import (
    Group,
    GroupRoleMapping,
    Membership,
    PermissionException,
    PermissionRule,
    Role,
)
from api.schemas.rbac import FolderType, PermissionLevel, RoleName
from api.services.rbac.permission_engine import PermissionEngine


class TestPermissionEngine:
    """Test suite for permission engine."""

    @pytest.fixture
    def setup_roles(self, test_db: Session) -> dict:
        """Set up test roles."""
        roles = {}
        role_configs = [
            (RoleName.NEU_ADMIN, "NEÜ Administrator", 100),
            (RoleName.NEU_PM, "NEÜ Project Manager", 90),
            (RoleName.PARTNER_ADMIN, "Partner Administrator", 80),
            (RoleName.NEU_QA, "NEÜ Quality Assurance", 70),
            (RoleName.EXPERT, "External Expert", 60),
            (RoleName.PENZUGYES, "Financial Role", 50),
        ]

        for role_name, description, priority in role_configs:
            role = Role(
                id=uuid.uuid4(),
                name=role_name.value,
                description=description,
                priority=priority,
            )
            test_db.add(role)
            roles[role_name] = role

        test_db.commit()
        return roles

    @pytest.fixture
    def setup_permission_rules(self, test_db: Session, setup_roles: dict):
        """Set up permission rules for testing."""
        rules = [
            (RoleName.NEU_ADMIN, FolderType.STANDARD, PermissionLevel.MANAGE),
            (RoleName.NEU_ADMIN, FolderType.STANDARD, PermissionLevel.WRITE),
            (RoleName.NEU_ADMIN, FolderType.STANDARD, PermissionLevel.READ),
            (RoleName.NEU_ADMIN, FolderType.FINANCIAL, PermissionLevel.READ),
            (RoleName.NEU_PM, FolderType.STANDARD, PermissionLevel.WRITE),
            (RoleName.NEU_PM, FolderType.STANDARD, PermissionLevel.READ),
            (RoleName.PARTNER_ADMIN, FolderType.STANDARD, PermissionLevel.WRITE),
            (RoleName.PARTNER_ADMIN, FolderType.STANDARD, PermissionLevel.READ),
            (RoleName.PARTNER_ADMIN, FolderType.PARTNER_SPECIFIC, PermissionLevel.MANAGE),
            (RoleName.NEU_QA, FolderType.STANDARD, PermissionLevel.READ),
            (RoleName.EXPERT, FolderType.STANDARD, PermissionLevel.READ),
            (RoleName.PENZUGYES, FolderType.FINANCIAL, PermissionLevel.MANAGE),
            (RoleName.PENZUGYES, FolderType.FINANCIAL, PermissionLevel.WRITE),
            (RoleName.PENZUGYES, FolderType.FINANCIAL, PermissionLevel.READ),
        ]

        for role_name, folder_type, permission_level in rules:
            rule = PermissionRule(
                id=uuid.uuid4(),
                role_id=setup_roles[role_name].id,
                folder_type=folder_type.value,
                permission_level=permission_level.value,
            )
            test_db.add(rule)

        test_db.commit()

    @pytest.fixture
    def engine(self, test_db: Session) -> PermissionEngine:
        """Create permission engine instance."""
        return PermissionEngine(test_db)

    def test_folder_type_classification(self, engine: PermissionEngine):
        """Test folder type classification logic."""
        test_cases = [
            ("2024/PartA/01_Project/Pénzügyi", FolderType.FINANCIAL),
            ("2024/PartB/PENZUGYI_docs", FolderType.FINANCIAL),
            ("NEÜ-internal/docs", FolderType.NEU_ONLY),
            ("2024/PartA/VEGLEGES", FolderType.FINAL),
            ("2024/PartA/CEG_01/docs", FolderType.PARTNER_SPECIFIC),
            ("2024/PartA/regular_folder", FolderType.STANDARD),
        ]

        for folder_path, expected_type in test_cases:
            assert engine.classify_folder_type(folder_path) == expected_type

    def test_neu_admin_permissions(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict, setup_permission_rules
    ):
        """Test NEU_Admin has manage permissions on standard folders."""
        role = setup_roles[RoleName.NEU_ADMIN]
        permissions = engine.get_base_permissions(role, FolderType.STANDARD)

        assert PermissionLevel.MANAGE in permissions
        assert PermissionLevel.WRITE in permissions
        assert PermissionLevel.READ in permissions

    def test_financial_folder_segregation(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict, setup_permission_rules
    ):
        """Test only Pénzügyes role can access financial folders."""
        folder_path = "2024/PartA/Pénzügyi/invoices"

        neu_admin = setup_roles[RoleName.NEU_ADMIN]
        segregation = engine.apply_segregation_rules(neu_admin, folder_path, FolderType.FINANCIAL)
        assert segregation == set()

        penzugyes = setup_roles[RoleName.PENZUGYES]
        segregation = engine.apply_segregation_rules(penzugyes, folder_path, FolderType.FINANCIAL)
        assert segregation is None

    def test_neu_only_folder_access(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict
    ):
        """Test NEÜ-only folders are restricted to NEU roles."""
        folder_path = "NEÜ-internal/sensitive"

        partner_admin = setup_roles[RoleName.PARTNER_ADMIN]
        segregation = engine.apply_segregation_rules(
            partner_admin, folder_path, FolderType.NEU_ONLY
        )
        assert segregation == set()

        neu_pm = setup_roles[RoleName.NEU_PM]
        segregation = engine.apply_segregation_rules(neu_pm, folder_path, FolderType.NEU_ONLY)
        assert segregation is None

    def test_final_folder_readonly(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict
    ):
        """Test VEGLEGES folders are read-only for all roles."""
        folder_path = "2024/PartA/VEGLEGES"

        for role_name, role in setup_roles.items():
            segregation = engine.apply_segregation_rules(role, folder_path, FolderType.FINAL)
            assert segregation == {PermissionLevel.READ}

    def test_partner_specific_isolation(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict
    ):
        """Test partner-specific folder isolation."""
        folder_path = "2024/PartA/CEG_01/internal"

        expert = setup_roles[RoleName.EXPERT]
        segregation = engine.apply_segregation_rules(
            expert, folder_path, FolderType.PARTNER_SPECIFIC
        )
        assert segregation == set()

        partner_admin = setup_roles[RoleName.PARTNER_ADMIN]
        segregation = engine.apply_segregation_rules(
            partner_admin, folder_path, FolderType.PARTNER_SPECIFIC
        )
        assert segregation is None

    def test_permission_exceptions(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict
    ):
        """Test permission exceptions override base rules."""
        folder_path = "2024/PartA/special_folder"
        expert = setup_roles[RoleName.EXPERT]

        exception = PermissionException(
            id=uuid.uuid4(),
            folder_path=folder_path,
            role_id=expert.id,
            permission_override=PermissionLevel.WRITE.value,
            reason="Temporary write access granted",
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        test_db.add(exception)
        test_db.commit()

        result = engine.check_exceptions(expert, folder_path)
        assert result is not None
        assert result[0] == PermissionLevel.WRITE
        assert "Temporary write access granted" in result[1]

    def test_expired_exceptions_ignored(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict
    ):
        """Test expired exceptions are ignored."""
        folder_path = "2024/PartA/expired_exception"
        expert = setup_roles[RoleName.EXPERT]

        exception = PermissionException(
            id=uuid.uuid4(),
            folder_path=folder_path,
            role_id=expert.id,
            permission_override=PermissionLevel.WRITE.value,
            reason="Expired exception",
            expires_at=datetime.utcnow() - timedelta(days=1),
        )
        test_db.add(exception)
        test_db.commit()

        result = engine.check_exceptions(expert, folder_path)
        assert result is None

    def test_calculate_effective_permissions(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict, setup_permission_rules
    ):
        """Test calculation of effective permissions."""
        folder_path = "2024/PartA/standard_folder"

        effective = engine.calculate_effective_permissions(
            folder_path, role_ids=[setup_roles[RoleName.NEU_ADMIN].id]
        )

        assert len(effective) > 0
        admin_perms = [p for p in effective if p.role_name == RoleName.NEU_ADMIN]
        assert any(p.permission_level == PermissionLevel.MANAGE for p in admin_perms)
        assert all(p.source == "base_rule" for p in admin_perms)

    def test_user_group_membership(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict
    ):
        """Test getting roles through group memberships."""
        group = Group(
            id=uuid.uuid4(),
            azure_ad_group_id="test-group-123",
            display_name="Test Group",
        )
        test_db.add(group)

        mapping = GroupRoleMapping(
            id=uuid.uuid4(),
            group_id=group.id,
            role_id=setup_roles[RoleName.NEU_PM].id,
        )
        test_db.add(mapping)

        membership = Membership(
            id=uuid.uuid4(),
            user_id="user-123",
            group_id=group.id,
            user_principal_name="user@example.com",
        )
        test_db.add(membership)
        test_db.commit()

        user_roles = engine.get_user_roles("user-123")
        assert len(user_roles) == 1
        assert user_roles[0].name == RoleName.NEU_PM.value

    def test_conflict_resolution(self, engine: PermissionEngine):
        """Test permission conflict resolution."""
        from api.schemas.rbac import EffectivePermission

        role_id = uuid.uuid4()
        permissions = [
            EffectivePermission(
                folder_path="/test",
                role_id=role_id,
                role_name=RoleName.NEU_ADMIN,
                permission_level=PermissionLevel.READ,
                source="base_rule",
                inheritance_broken=False,
                exception_applied=False,
            ),
            EffectivePermission(
                folder_path="/test",
                role_id=role_id,
                role_name=RoleName.NEU_ADMIN,
                permission_level=PermissionLevel.MANAGE,
                source="exception",
                inheritance_broken=False,
                exception_applied=True,
            ),
        ]

        resolved = engine.resolve_permission_conflicts(permissions)
        assert len(resolved) == 1
        assert list(resolved.values())[0] == PermissionLevel.MANAGE

    @pytest.mark.parametrize(
        "role_name,folder_type,expected_perms",
        [
            (
                RoleName.NEU_ADMIN,
                FolderType.STANDARD,
                {PermissionLevel.MANAGE, PermissionLevel.WRITE, PermissionLevel.READ},
            ),
            (RoleName.NEU_PM, FolderType.STANDARD, {PermissionLevel.WRITE, PermissionLevel.READ}),
            (
                RoleName.PARTNER_ADMIN,
                FolderType.STANDARD,
                {PermissionLevel.WRITE, PermissionLevel.READ},
            ),
            (RoleName.NEU_QA, FolderType.STANDARD, {PermissionLevel.READ}),
            (RoleName.EXPERT, FolderType.STANDARD, {PermissionLevel.READ}),
            (
                RoleName.PENZUGYES,
                FolderType.FINANCIAL,
                {PermissionLevel.MANAGE, PermissionLevel.WRITE, PermissionLevel.READ},
            ),
        ],
    )
    def test_permission_matrix_completeness(
        self,
        test_db: Session,
        engine: PermissionEngine,
        setup_roles: dict,
        setup_permission_rules,
        role_name: RoleName,
        folder_type: FolderType,
        expected_perms: set,
    ):
        """Test all role-folder type combinations."""
        role = setup_roles[role_name]
        permissions = engine.get_base_permissions(role, folder_type)
        assert permissions == expected_perms

    def test_privilege_escalation_prevention(
        self, test_db: Session, engine: PermissionEngine, setup_roles: dict, setup_permission_rules
    ):
        """Test that lower priority roles cannot escalate privileges."""
        folder_path = "2024/PartA/secure_folder"
        expert = setup_roles[RoleName.EXPERT]

        effective = engine.calculate_effective_permissions(folder_path, role_ids=[expert.id])

        assert all(
            p.permission_level == PermissionLevel.READ for p in effective if p.role_id == expert.id
        )

        assert not any(
            p.permission_level
            in [PermissionLevel.WRITE, PermissionLevel.DELETE, PermissionLevel.MANAGE]
            for p in effective
            if p.role_id == expert.id
        )
