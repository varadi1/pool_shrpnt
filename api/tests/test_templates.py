import pytest
from sqlalchemy.orm import Session

from api.schemas.template import FolderTemplateCreate, FolderTemplateUpdate
from api.services.templates import TemplateService


def test_create_template(test_db: Session):
    service = TemplateService(test_db)

    template_data = FolderTemplateCreate(
        name="Test Template",
        description="Test Description",
        template_type="standard",
        folder_structure={"root": {"subfolder1": {}, "subfolder2": {}}},
        permissions_template={"read": ["user1"], "write": ["user2"]},
    )

    template = service.create_template(template_data, user_id="test_user")

    assert template.id is not None
    assert template.name == "Test Template"
    assert template.description == "Test Description"
    assert template.version == 1
    assert template.is_active is True
    assert template.created_by == "test_user"


def test_get_template(test_db: Session):
    service = TemplateService(test_db)

    template_data = FolderTemplateCreate(
        name="Test Template",
        description="Test Description",
        template_type="standard",
        folder_structure={"root": {}},
    )
    created = service.create_template(template_data)

    retrieved = service.get_template(created.id)

    assert retrieved is not None
    assert retrieved.id == created.id
    assert retrieved.name == "Test Template"


def test_list_templates(test_db: Session):
    service = TemplateService(test_db)

    for i in range(5):
        template_data = FolderTemplateCreate(
            name=f"Template {i}",
            description=f"Description {i}",
            template_type="standard",
            folder_structure={"root": {}},
        )
        service.create_template(template_data)

    result = service.list_templates(page=1, page_size=3)

    assert len(result.templates) == 3
    assert result.total == 5
    assert result.page == 1
    assert result.page_size == 3


def test_update_template(test_db: Session):
    service = TemplateService(test_db)

    template_data = FolderTemplateCreate(
        name="Original Name",
        description="Original Description",
        template_type="standard",
        folder_structure={"root": {}},
    )
    created = service.create_template(template_data)

    update_data = FolderTemplateUpdate(name="Updated Name", description="Updated Description")
    updated = service.update_template(created.id, update_data, user_id="updater")

    assert updated is not None
    assert updated.name == "Updated Name"
    assert updated.description == "Updated Description"
    assert updated.updated_by == "updater"


def test_create_template_version(test_db: Session):
    service = TemplateService(test_db)

    template_data = FolderTemplateCreate(
        name="Versioned Template",
        description="Original Version",
        template_type="standard",
        folder_structure={"root": {"v1": {}}},
    )
    original = service.create_template(template_data)

    new_version = service.create_template_version(original.id, user_id="versioner")

    assert new_version is not None
    assert new_version.version == 2
    assert new_version.parent_id == original.id
    assert new_version.is_active is True

    original_updated = service.get_template(original.id)
    assert original_updated.is_active is False


def test_delete_template(test_db: Session):
    service = TemplateService(test_db)

    template_data = FolderTemplateCreate(
        name="To Delete",
        description="Will be deleted",
        template_type="standard",
        folder_structure={"root": {}},
    )
    created = service.create_template(template_data)

    success = service.delete_template(created.id)
    assert success is True

    deleted = service.get_template(created.id)
    assert deleted.is_active is False


def test_template_validation_errors(test_db: Session):
    TemplateService(test_db)

    with pytest.raises(Exception):
        FolderTemplateCreate(
            name="",
            description="Invalid template",
            template_type="standard",
            folder_structure={"root": {}},
        )
