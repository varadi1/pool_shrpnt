"""Unit tests for permission inheritance service."""

import uuid

import pytest
from sqlalchemy.orm import Session

from api.models.rbac import PermissionAssignment, Role
from api.schemas.rbac import EffectivePermission, PermissionLevel, RoleName
from api.services.rbac.inheritance_service import InheritanceService


@pytest.fixture
def setup_roles(test_db: Session) -> dict[RoleName, Role]:
    """Set up test roles."""
    roles = {}
    for role_name in [RoleName.NEU_ADMIN, RoleName.NEU_PM, RoleName.PARTNER_ADMIN]:
        role = Role(
            id=uuid.uuid4(),
            name=role_name.value,
            description=f"Test {role_name.value}",
            priority=100 if role_name == RoleName.NEU_ADMIN else 80,
        )
        test_db.add(role)
        roles[role_name] = role
    test_db.commit()
    return roles


@pytest.fixture
def setup_folder_hierarchy(
    test_db: Session, setup_roles: dict[RoleName, Role]
) -> list[PermissionAssignment]:
    """Set up test folder hierarchy with permissions."""
    assignments = []

    root_assignment = PermissionAssignment(
        id=uuid.uuid4(),
        folder_path="2024/PartA",
        resource_path="2024/PartA",
        resource_type="sharepoint_folder",
        role_id=setup_roles[RoleName.NEU_ADMIN].id,
        permission_level=PermissionLevel.MANAGE.value,
        inheritance_broken=False,
        source="manual",
    )
    assignments.append(root_assignment)
    test_db.add(root_assignment)

    child_assignment = PermissionAssignment(
        id=uuid.uuid4(),
        folder_path="2024/PartA/01_Project",
        resource_path="2024/PartA/01_Project",
        resource_type="sharepoint_folder",
        role_id=setup_roles[RoleName.NEU_PM].id,
        permission_level=PermissionLevel.WRITE.value,
        inheritance_broken=False,
        source="manual",
    )
    assignments.append(child_assignment)
    test_db.add(child_assignment)

    test_db.commit()
    return assignments


@pytest.fixture
def service(test_db: Session) -> InheritanceService:
    """Create inheritance service instance."""
    return InheritanceService(test_db)


class TestInheritanceService:
    """Test suite for permission inheritance."""

    def test_should_break_inheritance_sensitive_folders(self, service: InheritanceService):
        """Test inheritance breaking for sensitive folders."""
        test_cases = [
            ("2024/PartA/Pénzügyi", True),
            ("2024/PartA/PENZUGYI_docs", True),
            ("NEÜ-only/internal", True),
            ("2024/PartA/VEGLEGES", True),
            ("2024/PartA/FINAL_report", True),
            ("2024/PartA/BIZALMAS", True),
            ("2024/PartA/CONFIDENTIAL_data", True),
            ("2024/PartA/regular_folder", False),
            ("2024/PartA/01_Project", False),
        ]

        for folder_path, should_break in test_cases:
            assert service.should_break_inheritance(folder_path) == should_break

    def test_get_parent_path(self, service: InheritanceService):
        """Test parent path extraction."""
        test_cases = [
            ("2024/PartA/01_Project/docs", "2024/PartA/01_Project"),
            ("2024/PartA", "2024"),
            ("2024", None),
            ("single_folder", None),
            ("", None),
        ]

        for folder_path, expected_parent in test_cases:
            assert service.get_parent_path(folder_path) == expected_parent

    def test_get_inherited_permissions(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_roles: dict[RoleName, Role],
        setup_folder_hierarchy: list[PermissionAssignment],
    ):
        """Test getting inherited permissions from parent folders."""
        inherited = service.get_inherited_permissions("2024/PartA/01_Project")

        assert setup_roles[RoleName.NEU_ADMIN].id in inherited
        assert PermissionLevel.MANAGE in inherited[setup_roles[RoleName.NEU_ADMIN].id]

        grandchild_inherited = service.get_inherited_permissions("2024/PartA/01_Project/subfolder")

        assert setup_roles[RoleName.NEU_ADMIN].id in grandchild_inherited
        assert setup_roles[RoleName.NEU_PM].id in grandchild_inherited

    def test_inheritance_with_broken_chain(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_roles: dict[RoleName, Role],
    ):
        """Test inheritance stops when chain is broken."""
        parent = PermissionAssignment(
            id=uuid.uuid4(),
            folder_path="2024/PartB",
            resource_path="2024/PartB",
            resource_type="sharepoint_folder",
            role_id=setup_roles[RoleName.NEU_ADMIN].id,
            permission_level=PermissionLevel.MANAGE.value,
            inheritance_broken=False,
            source="manual",
        )
        test_db.add(parent)

        broken = PermissionAssignment(
            id=uuid.uuid4(),
            folder_path="2024/PartB/secure",
            resource_path="2024/PartB/secure",
            resource_type="sharepoint_folder",
            role_id=setup_roles[RoleName.NEU_PM].id,
            permission_level=PermissionLevel.READ.value,
            inheritance_broken=True,
            source="manual",
        )
        test_db.add(broken)
        test_db.commit()

        inherited = service.get_inherited_permissions("2024/PartB/secure/child")

        assert setup_roles[RoleName.NEU_ADMIN].id not in inherited

    def test_apply_inheritance(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_roles: dict[RoleName, Role],
        setup_folder_hierarchy: list[PermissionAssignment],
    ):
        """Test applying inheritance to calculated permissions."""
        calculated = [
            EffectivePermission(
                folder_path="2024/PartA/01_Project/new_folder",
                role_id=setup_roles[RoleName.PARTNER_ADMIN].id,
                role_name=RoleName.PARTNER_ADMIN,
                permission_level=PermissionLevel.READ,
                source="base_rule",
                inheritance_broken=False,
                exception_applied=False,
            )
        ]

        with_inheritance = service.apply_inheritance("2024/PartA/01_Project/new_folder", calculated)

        role_ids = [p.role_id for p in with_inheritance]
        assert setup_roles[RoleName.NEU_ADMIN].id in role_ids
        assert setup_roles[RoleName.NEU_PM].id in role_ids

    def test_cascade_permissions(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_roles: dict[RoleName, Role],
    ):
        """Test cascading permissions down folder tree."""
        parent = PermissionAssignment(
            id=uuid.uuid4(),
            folder_path="2024/PartC",
            resource_path="2024/PartC",
            resource_type="sharepoint_folder",
            role_id=setup_roles[RoleName.NEU_ADMIN].id,
            permission_level=PermissionLevel.MANAGE.value,
            inheritance_broken=False,
            source="manual",
        )
        test_db.add(parent)
        test_db.commit()

        service._get_child_folders = lambda path: (
            [
                "2024/PartC/child1",
                "2024/PartC/child2",
            ]
            if path == "2024/PartC"
            else []
        )

        affected = service.cascade_permissions(
            "2024/PartC",
            setup_roles[RoleName.NEU_ADMIN].id,
            PermissionLevel.MANAGE,
        )

        assert "2024/PartC/child1" in affected
        assert "2024/PartC/child2" in affected

    def test_break_inheritance(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_folder_hierarchy: list[PermissionAssignment],
    ):
        """Test breaking inheritance for a folder."""
        success = service.break_inheritance("2024/PartA/01_Project", "Security requirement")
        assert success

        assignment = (
            test_db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == "2024/PartA/01_Project")
            .first()
        )
        assert assignment.inheritance_broken is True

    def test_restore_inheritance(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_roles: dict[RoleName, Role],
    ):
        """Test restoring inheritance for a folder."""
        broken = PermissionAssignment(
            id=uuid.uuid4(),
            folder_path="2024/PartD/broken",
            resource_path="2024/PartD/broken",
            resource_type="sharepoint_folder",
            role_id=setup_roles[RoleName.NEU_ADMIN].id,
            permission_level=PermissionLevel.READ.value,
            inheritance_broken=True,
            source="manual",
        )
        test_db.add(broken)
        test_db.commit()

        success = service.restore_inheritance("2024/PartD/broken")
        assert success

        assignment = (
            test_db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == "2024/PartD/broken")
            .first()
        )
        assert assignment.inheritance_broken is False

    def test_get_inheritance_chain(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_folder_hierarchy: list[PermissionAssignment],
    ):
        """Test getting complete inheritance chain for audit."""
        chain = service.get_inheritance_chain("2024/PartA/01_Project/subfolder")

        assert len(chain) > 0
        assert chain[0]["folder_path"] == "2024/PartA/01_Project/subfolder"
        assert not chain[0]["inheritance_broken"]

    def test_inheritance_with_sensitive_folder(
        self, service: InheritanceService, setup_roles: dict[RoleName, Role]
    ):
        """Test inheritance automatically breaks for sensitive folders."""
        calculated = [
            EffectivePermission(
                folder_path="2024/PartA/Pénzügyi",
                role_id=setup_roles[RoleName.NEU_ADMIN].id,
                role_name=RoleName.NEU_ADMIN,
                permission_level=PermissionLevel.READ,
                source="base_rule",
                inheritance_broken=False,
                exception_applied=False,
            )
        ]

        result = service.apply_inheritance("2024/PartA/Pénzügyi", calculated)

        assert all(p.inheritance_broken for p in result)

    def test_cascade_respects_inheritance_breaks(
        self,
        test_db: Session,
        service: InheritanceService,
        setup_roles: dict[RoleName, Role],
    ):
        """Test cascading respects existing inheritance breaks."""
        parent = PermissionAssignment(
            id=uuid.uuid4(),
            folder_path="2024/PartE",
            resource_path="2024/PartE",
            resource_type="sharepoint_folder",
            role_id=setup_roles[RoleName.NEU_ADMIN].id,
            permission_level=PermissionLevel.MANAGE.value,
            inheritance_broken=False,
            source="manual",
        )
        test_db.add(parent)

        broken_child = PermissionAssignment(
            id=uuid.uuid4(),
            folder_path="2024/PartE/secure_child",
            resource_path="2024/PartE/secure_child",
            resource_type="sharepoint_folder",
            role_id=setup_roles[RoleName.NEU_ADMIN].id,
            permission_level=PermissionLevel.READ.value,
            inheritance_broken=True,
            source="manual",
        )
        test_db.add(broken_child)
        test_db.commit()

        service._get_child_folders = lambda path: (
            ["2024/PartE/secure_child"] if path == "2024/PartE" else []
        )

        affected = service.cascade_permissions(
            "2024/PartE",
            setup_roles[RoleName.NEU_ADMIN].id,
            PermissionLevel.MANAGE,
        )

        assert "2024/PartE/secure_child" not in affected

        child = (
            test_db.query(PermissionAssignment)
            .filter(PermissionAssignment.folder_path == "2024/PartE/secure_child")
            .first()
        )
        assert child.permission_level == PermissionLevel.READ.value
