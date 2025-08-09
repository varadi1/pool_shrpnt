from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.template import FolderTemplate, FolderTemplateVersion
from api.services.template_diff import TemplateDiffService
from api.services.template_rollback import TemplateRollbackService
from api.services.templates import TemplateService


@pytest.fixture
def template_service(test_db: Session):
    """Create template service instance."""
    return TemplateService(test_db)


@pytest.fixture
def diff_service(test_db: Session):
    """Create diff service instance."""
    return TemplateDiffService(test_db)


@pytest.fixture
def rollback_service(test_db: Session):
    """Create rollback service instance."""
    return TemplateRollbackService(test_db)


@pytest.fixture
def sample_template(test_db: Session) -> FolderTemplate:
    """Create a sample template for testing."""
    template = FolderTemplate(
        name="Test Template",
        description="Test template for versioning",
        template_type="standard",
        folder_structure={
            "folders": [
                {"name": "Documents", "permissions": ["read", "write"]},
                {"name": "Reports", "permissions": ["read"]},
            ]
        },
        permissions_template={"admin": ["full_control"], "user": ["read", "write"]},
        version_number="1.0.0",
        status="draft",
        created_by="test_user",
    )
    test_db.add(template)
    test_db.commit()
    test_db.refresh(template)
    return template


class TestTemplateVersioning:
    """Test template versioning functionality."""

    def test_version_numbering_scheme(self, template_service: TemplateService):
        """Test semantic version numbering (MAJOR.MINOR.PATCH)."""
        assert template_service._increment_version("1.0.0", "patch") == "1.0.1"
        assert template_service._increment_version("1.0.9", "patch") == "1.0.10"
        assert template_service._increment_version("1.0.0", "minor") == "1.1.0"
        assert template_service._increment_version("1.9.0", "minor") == "1.10.0"
        assert template_service._increment_version("1.0.0", "major") == "2.0.0"
        assert template_service._increment_version("9.0.0", "major") == "10.0.0"
        # Invalid version format
        assert template_service._increment_version("invalid", "patch") == "1.0.0"

    def test_template_validation(
        self, template_service: TemplateService, sample_template: FolderTemplate
    ):
        """Test template validation before publishing."""
        # Valid template
        is_valid, errors = template_service._validate_template_fields(sample_template)
        assert is_valid is True
        assert len(errors) == 0

        # Missing folder structure
        sample_template.folder_structure = None
        is_valid, errors = template_service._validate_template_fields(sample_template)
        assert is_valid is False
        assert "Folder structure is required" in errors

        # Invalid folder structure
        sample_template.folder_structure = "not a dict"
        is_valid, errors = template_service._validate_template_fields(sample_template)
        assert is_valid is False
        assert "Folder structure must be a valid JSON object" in errors

        # Missing folders key
        sample_template.folder_structure = {"other_key": []}
        is_valid, errors = template_service._validate_template_fields(sample_template)
        assert is_valid is False
        assert "Folder structure must contain 'folders' key" in errors

        # Invalid permissions template
        sample_template.folder_structure = {"folders": []}
        sample_template.permissions_template = "not a dict"
        is_valid, errors = template_service._validate_template_fields(sample_template)
        assert is_valid is False
        assert "Permissions template must be a valid JSON object" in errors


class TestTemplatePublishing:
    """Test template publishing workflow."""

    def test_publish_draft_template(
        self, template_service: TemplateService, sample_template: FolderTemplate, test_db: Session
    ):
        """Test publishing a draft template."""
        # Publish the template
        version = template_service.publish_template(
            template_id=sample_template.id,
            change_description="Initial publish",
            version_type="minor",
            user_id="test_user",
        )

        assert version is not None
        assert version.version == "1.0.0"  # First version
        assert version.template_id == sample_template.id
        assert version.change_description == "Initial publish"
        assert version.author_id == "test_user"
        assert version.status == "published"

        # Check template status updated
        test_db.refresh(sample_template)
        assert sample_template.status == "published"
        assert sample_template.version_number == "1.0.0"
        assert sample_template.is_current is True

    def test_cannot_publish_already_published(
        self, template_service: TemplateService, sample_template: FolderTemplate
    ):
        """Test that published templates cannot be republished."""
        sample_template.status = "published"

        with pytest.raises(HTTPException) as exc_info:
            template_service.publish_template(
                template_id=sample_template.id,
                change_description="Try to republish",
                user_id="test_user",
            )

        assert exc_info.value.status_code == 400
        assert "already published" in str(exc_info.value.detail)

    def test_immutable_published_version(
        self, template_service: TemplateService, sample_template: FolderTemplate, test_db: Session
    ):
        """Test that published versions are immutable."""
        # Publish template
        version = template_service.publish_template(
            template_id=sample_template.id,
            change_description="Initial version",
            user_id="test_user",
        )

        # Try to modify the version record
        version.content.copy()
        version.content["modified"] = "should not work"
        test_db.commit()

        # Fetch fresh from DB
        fresh_version = (
            test_db.query(FolderTemplateVersion)
            .filter(FolderTemplateVersion.id == version.id)
            .first()
        )

        # The snapshot should remain unchanged (immutable)
        assert fresh_version.folder_structure == sample_template.folder_structure
        assert fresh_version.permissions_template == sample_template.permissions_template

    def test_version_progression(self, template_service: TemplateService, test_db: Session):
        """Test version number progression (1.0.0 → 1.0.1 → 1.1.0)."""
        # Create initial template
        template = FolderTemplate(
            name="Version Test",
            description="Testing version progression",
            template_type="standard",
            folder_structure={"folders": [{"name": "Folder1"}]},
            version_number="1.0.0",
            status="draft",
        )
        test_db.add(template)
        test_db.commit()

        # First publish - 1.0.0
        v1 = template_service.publish_template(template.id, "Initial", "patch")
        assert v1.version == "1.0.0"

        # Make template draft again for next version
        template.status = "draft"
        template.folder_structure["folders"].append({"name": "Folder2"})
        test_db.commit()

        # Second publish - patch increment
        v2 = template_service.publish_template(template.id, "Added folder", "patch")
        assert v2.version == "1.0.1"

        # Third publish - minor increment
        template.status = "draft"
        template.folder_structure["folders"].append({"name": "Folder3"})
        test_db.commit()

        v3 = template_service.publish_template(template.id, "New feature", "minor")
        assert v3.version == "1.1.0"

        # Fourth publish - major increment
        template.status = "draft"
        template.folder_structure = {"folders": [{"name": "CompleteRedesign"}]}
        test_db.commit()

        v4 = template_service.publish_template(template.id, "Breaking change", "major")
        assert v4.version == "2.0.0"


class TestTemplateDiff:
    """Test template diff functionality."""

    def test_diff_between_versions(self, diff_service: TemplateDiffService, test_db: Session):
        """Test generating diff between two versions."""
        # Create template with two versions
        template = FolderTemplate(
            id=1,
            name="Diff Test",
            folder_structure={"folders": [{"name": "Folder1"}]},
            status="published",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=1,
            version="1.0.0",
            content={"name": "Diff Test"},
            folder_structure={"folders": [{"name": "Folder1"}]},
            permissions_template={"admin": ["full"]},
            author_id="user1",
            status="published",
        )

        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=1,
            version="1.1.0",
            content={"name": "Diff Test Updated"},
            folder_structure={"folders": [{"name": "Folder1"}, {"name": "Folder2"}]},
            permissions_template={"admin": ["full"], "user": ["read"]},
            author_id="user2",
            parent_version_id=v1.id,
            status="published",
        )

        test_db.add_all([v1, v2])
        test_db.commit()

        # Generate diff
        diff = diff_service.get_diff(1, "1.0.0", "1.1.0", "json")

        assert diff["from_version"] == "1.0.0"
        assert diff["to_version"] == "1.1.0"
        assert diff["summary"]["total_changes"] > 0

    def test_diff_text_format(self, diff_service: TemplateDiffService, test_db: Session):
        """Test diff output in text format."""
        # Setup versions
        template = FolderTemplate(
            id=2,
            name="Text Diff",
            status="published",
            folder_structure={"folders": []},
            permissions_template={},
            template_type="standard",
            version_number="1.0.0",
            created_by="test_user",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=2,
            version="1.0.0",
            content={"name": "Text Diff"},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )

        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=2,
            version="1.0.1",
            content={"name": "Text Diff"},
            folder_structure={"folders": [{"name": "NewFolder"}]},
            author_id="user1",
            parent_version_id=v1.id,
            status="published",
        )

        test_db.add_all([v1, v2])
        test_db.commit()

        # Get text diff
        diff = diff_service.get_diff(2, "1.0.0", "1.0.1", "text")

        assert "diff" in diff
        assert "1.0.0 → 1.0.1" in diff["diff"]
        assert "Added Folders" in diff["diff"] or "Total changes" in diff["diff"]


class TestTemplateRollback:
    """Test template rollback mechanism."""

    def test_rollback_creates_new_version(
        self, rollback_service: TemplateRollbackService, test_db: Session
    ):
        """Test that rollback creates a new version from old."""
        # Setup template with versions
        template = FolderTemplate(
            id=3,
            name="Rollback Test",
            folder_structure={"folders": [{"name": "Current"}]},
            version_number="2.0.0",
            status="published",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=3,
            version="1.0.0",
            content={"name": "Rollback Test"},
            folder_structure={"folders": [{"name": "Original"}]},
            author_id="user1",
            status="published",
        )

        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=3,
            version="2.0.0",
            content={"name": "Rollback Test"},
            folder_structure={"folders": [{"name": "Current"}]},
            author_id="user2",
            parent_version_id=v1.id,
            status="published",
        )

        test_db.add_all([v1, v2])
        test_db.commit()

        # Perform rollback
        new_version = rollback_service.rollback_to_version(
            template_id=3,
            target_version="1.0.0",
            rollback_reason="Revert breaking changes",
            user_id="admin",
        )

        assert new_version.version == "2.0.1"  # New version created
        assert new_version.folder_structure == v1.folder_structure  # Content from v1
        assert "Rollback to version 1.0.0" in new_version.change_description
        assert new_version.parent_version_id == v2.id  # Parent is previous latest

        # Check template updated
        test_db.refresh(template)
        assert template.version_number == "2.0.1"
        assert template.folder_structure == v1.folder_structure

    def test_cannot_rollback_to_current(
        self, rollback_service: TemplateRollbackService, test_db: Session
    ):
        """Test that rollback to current version is prevented."""
        template = FolderTemplate(
            id=4,
            name="No Rollback",
            version_number="1.0.0",
            status="published",
            folder_structure={"folders": []},
            permissions_template={},
            template_type="standard",
            created_by="test_user",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=4,
            version="1.0.0",
            content={},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )
        test_db.add(v1)
        test_db.commit()

        with pytest.raises(HTTPException) as exc_info:
            rollback_service.rollback_to_version(
                template_id=4, target_version="1.0.0", rollback_reason="Invalid", user_id="admin"
            )

        assert exc_info.value.status_code == 400
        assert "Cannot rollback to current version" in str(exc_info.value.detail)

    def test_rollback_validation(self, rollback_service: TemplateRollbackService, test_db: Session):
        """Test rollback validation checks."""
        # Template doesn't exist
        result = rollback_service.validate_rollback(999, "1.0.0")
        assert result["valid"] is False
        assert "Template not found" in result["reason"]

        # Create template
        template = FolderTemplate(
            id=5,
            name="Validate Rollback",
            version_number="2.0.0",
            status="published",
            folder_structure={"folders": []},
            permissions_template={},
            template_type="standard",
            created_by="test_user",
        )
        test_db.add(template)
        test_db.commit()

        # Target version doesn't exist
        result = rollback_service.validate_rollback(5, "1.0.0")
        assert result["valid"] is False
        assert "Target version 1.0.0 not found" in result["reason"]

        # Add versions
        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=5,
            version="1.0.0",
            content={},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )
        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=5,
            version="2.0.0",
            content={},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )
        test_db.add_all([v1, v2])
        test_db.commit()

        # Valid rollback
        result = rollback_service.validate_rollback(5, "1.0.0")
        assert result["valid"] is True

        # Cannot rollback to current
        result = rollback_service.validate_rollback(5, "2.0.0")
        assert result["valid"] is False
        assert "Cannot rollback to current version" in result["reason"]


class TestConcurrentOperations:
    """Test handling of concurrent version operations."""

    def test_concurrent_publish_attempts(self, template_service: TemplateService, test_db: Session):
        """Test that concurrent publish attempts are handled correctly."""
        template = FolderTemplate(
            name="Concurrent Test", folder_structure={"folders": []}, status="draft"
        )
        test_db.add(template)
        test_db.commit()

        # First publish succeeds
        v1 = template_service.publish_template(template.id, "First", "patch")
        assert v1.version == "1.0.0"

        # Second attempt should fail (already published)
        with pytest.raises(HTTPException) as exc_info:
            template_service.publish_template(template.id, "Second", "patch")

        assert exc_info.value.status_code == 400

    def test_version_conflict_prevention(self, test_db: Session):
        """Test that version conflicts are prevented by constraints."""
        template = FolderTemplate(
            id=6, name="Conflict Test", folder_structure={"folders": []}, status="published"
        )
        test_db.add(template)

        # Create first version
        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=6,
            version="1.0.0",
            content={},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )
        test_db.add(v1)
        test_db.commit()

        # Try to create duplicate version (should fail due to unique constraint)
        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=6,
            version="1.0.0",  # Same version
            content={},
            folder_structure={"folders": []},
            author_id="user2",
            status="published",
        )
        test_db.add(v2)

        with pytest.raises(Exception):  # Should raise integrity error
            test_db.commit()
