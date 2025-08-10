from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.models.template import FolderTemplate, FolderTemplateVersion


@pytest.fixture
def create_test_template(test_db: Session):
    """Create a test template for endpoint testing."""
    template = FolderTemplate(
        name="Test API Template",
        description="Template for API testing",
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


@pytest.fixture
def create_published_template(test_db: Session):
    """Create a published template with version history."""
    template = FolderTemplate(
        name="Published Template",
        description="Published template for testing",
        template_type="standard",
        folder_structure={"folders": [{"name": "Folder1"}]},
        version_number="1.0.0",
        status="published",
        is_current=True,
        created_by="test_user",
    )
    test_db.add(template)
    test_db.commit()
    test_db.refresh(template)

    # Create version history
    version = FolderTemplateVersion(
        id=uuid4(),
        template_id=template.id,
        version="1.0.0",
        content={
            "name": template.name,
            "description": template.description,
            "template_type": template.template_type,
            "folder_structure": template.folder_structure,
        },
        author_id="test_user",
        status="published",
        folder_structure=template.folder_structure,
        permissions_template=template.permissions_template or {},
    )
    test_db.add(version)
    test_db.commit()

    # Update template with version reference
    template.parent_version_id = version.id
    test_db.commit()
    test_db.refresh(template)

    return template, version


class TestTemplateVersionEndpoints:
    """Test template version management endpoints."""

    def test_list_template_versions(self, client: TestClient, create_published_template):
        """Test listing all versions of a template."""
        template, version = create_published_template

        response = client.get(f"/api/templates/{template.id}/versions")
        assert response.status_code == 200

        data = response.json()
        assert "versions" in data
        assert "total" in data
        assert data["total"] == 1
        assert len(data["versions"]) == 1
        assert data["versions"][0]["version"] == "1.0.0"

    def test_list_versions_nonexistent_template(self, client: TestClient):
        """Test listing versions for non-existent template."""
        response = client.get("/api/templates/99999/versions")
        assert response.status_code == 404

    def test_get_specific_version(self, client: TestClient, create_published_template):
        """Test getting a specific version of a template."""
        template, version = create_published_template

        response = client.get(f"/api/templates/{template.id}/versions/1.0.0")
        assert response.status_code == 200

        data = response.json()
        assert data["version"] == "1.0.0"
        assert data["template_id"] == template.id
        assert data["author_id"] == "test_user"

    def test_get_nonexistent_version(self, client: TestClient, create_published_template):
        """Test getting non-existent version."""
        template, _ = create_published_template

        response = client.get(f"/api/templates/{template.id}/versions/2.0.0")
        assert response.status_code == 404


class TestTemplatePublishEndpoint:
    """Test template publishing endpoint."""

    def test_publish_draft_template(self, client: TestClient, create_test_template):
        """Test publishing a draft template."""
        template = create_test_template

        response = client.post(
            f"/api/templates/{template.id}/publish",
            json={"change_description": "Initial release", "version_type": "minor"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["version"] == "1.0.0"  # First version
        assert data["status"] == "published"
        assert "Initial release" in data["change_description"]

    def test_cannot_publish_already_published(self, client: TestClient, create_published_template):
        """Test that published templates cannot be republished."""
        template, _ = create_published_template

        response = client.post(
            f"/api/templates/{template.id}/publish",
            json={"change_description": "Try to republish", "version_type": "patch"},
        )
        assert response.status_code == 400
        assert "already published" in response.json()["detail"]

    def test_publish_validation_failure(self, client: TestClient, test_db: Session):
        """Test publishing fails when template validation fails."""
        # Create invalid template (missing folders key)
        template = FolderTemplate(
            name="Invalid Template", folder_structure={"invalid": "structure"}, status="draft"
        )
        test_db.add(template)
        test_db.commit()

        response = client.post(
            f"/api/templates/{template.id}/publish", json={"change_description": "Publish invalid"}
        )
        assert response.status_code == 400
        assert "validation failed" in response.json()["detail"]


class TestTemplateDiffEndpoint:
    """Test template diff endpoint."""

    def test_get_diff_between_versions(self, client: TestClient, test_db: Session):
        """Test getting diff between two versions."""
        # Create template with two versions
        template = FolderTemplate(
            id=100,
            name="Diff Test Template",
            folder_structure={"folders": [{"name": "v2folder"}]},
            version_number="2.0.0",
            status="published",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=100,
            version="1.0.0",
            content={"name": "Diff Test Template"},
            folder_structure={"folders": [{"name": "v1folder"}]},
            author_id="user1",
            status="published",
        )

        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=100,
            version="2.0.0",
            content={"name": "Diff Test Template"},
            folder_structure={"folders": [{"name": "v2folder"}]},
            author_id="user2",
            parent_version_id=v1.id,
            status="published",
        )

        test_db.add_all([v1, v2])
        test_db.commit()

        # Get JSON diff
        response = client.get(
            "/api/templates/100/diff", params={"from_version": "1.0.0", "to_version": "2.0.0"}
        )
        assert response.status_code == 200

        data = response.json()
        assert data["from_version"] == "1.0.0"
        assert data["to_version"] == "2.0.0"
        assert "folder_structure" in data
        assert "summary" in data

    def test_get_diff_text_format(self, client: TestClient, test_db: Session):
        """Test getting diff in text format."""
        # Setup template with versions (reuse from above)
        template = FolderTemplate(
            id=101,
            name="Text Diff",
            folder_structure={"folders": []},
            version_number="1.0.1",
            status="published",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=101,
            version="1.0.0",
            content={"name": "Text Diff"},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )

        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=101,
            version="1.0.1",
            content={"name": "Text Diff"},
            folder_structure={"folders": [{"name": "NewFolder"}]},
            author_id="user1",
            parent_version_id=v1.id,
            status="published",
        )

        test_db.add_all([v1, v2])
        test_db.commit()

        response = client.get(
            "/api/templates/101/diff",
            params={"from_version": "1.0.0", "to_version": "1.0.1", "output_format": "text"},
        )
        assert response.status_code == 200

        data = response.json()
        assert "diff" in data
        assert "1.0.0 → 1.0.1" in data["diff"]


class TestTemplateRollbackEndpoint:
    """Test template rollback endpoint."""

    def test_rollback_to_previous_version(self, client: TestClient, test_db: Session):
        """Test rolling back to a previous version."""
        # Setup template with multiple versions
        template = FolderTemplate(
            id=200,
            name="Rollback Test",
            folder_structure={"folders": [{"name": "v2"}]},
            version_number="2.0.0",
            status="published",
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=200,
            version="1.0.0",
            content={"name": "Rollback Test"},
            folder_structure={"folders": [{"name": "v1"}]},
            author_id="user1",
            status="published",
        )

        v2 = FolderTemplateVersion(
            id=uuid4(),
            template_id=200,
            version="2.0.0",
            content={"name": "Rollback Test"},
            folder_structure={"folders": [{"name": "v2"}]},
            author_id="user2",
            parent_version_id=v1.id,
            status="published",
        )

        test_db.add_all([v1, v2])
        test_db.commit()

        # Perform rollback
        response = client.post(
            "/api/templates/200/rollback",
            json={"target_version": "1.0.0", "rollback_reason": "Reverting breaking changes"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["version"] == "2.0.1"  # New version created
        assert "Rollback to version 1.0.0" in data["change_description"]

    def test_validate_rollback(self, client: TestClient, test_db: Session):
        """Test rollback validation endpoint."""
        # Setup template
        template = FolderTemplate(
            id=201,
            name="Validate Test",
            version_number="2.0.0",
            status="published",
            folder_structure={"folders": []},
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=201,
            version="1.0.0",
            content={},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )
        test_db.add(v1)
        test_db.commit()

        # Validate rollback
        response = client.post(
            "/api/templates/201/rollback/validate", params={"target_version": "1.0.0"}
        )
        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is True

    def test_cannot_rollback_to_current(self, client: TestClient, test_db: Session):
        """Test cannot rollback to current version."""
        template = FolderTemplate(
            id=202,
            name="Current Version",
            version_number="1.0.0",
            status="published",
            folder_structure={"folders": []},
        )
        test_db.add(template)

        v1 = FolderTemplateVersion(
            id=uuid4(),
            template_id=202,
            version="1.0.0",
            content={},
            folder_structure={"folders": []},
            author_id="user1",
            status="published",
        )
        test_db.add(v1)
        test_db.commit()

        response = client.post(
            "/api/templates/202/rollback",
            json={"target_version": "1.0.0", "rollback_reason": "Invalid rollback"},
        )
        assert response.status_code == 400
        assert "Cannot rollback to current version" in response.json()["detail"]


class TestTemplateVersioningCRUD:
    """Test CRUD operations with versioning."""

    def test_cannot_update_published_template(self, client: TestClient, create_published_template):
        """Test that published templates cannot be updated."""
        template, _ = create_published_template

        response = client.put(
            f"/api/templates/{template.id}", json={"description": "Try to update published"}
        )
        assert response.status_code == 400
        assert "Cannot modify published template" in response.json()["detail"]

    def test_can_update_draft_template(self, client: TestClient, create_test_template):
        """Test that draft templates can be updated."""
        template = create_test_template

        response = client.put(
            f"/api/templates/{template.id}", json={"description": "Updated description"}
        )
        assert response.status_code == 200

        data = response.json()
        assert data["description"] == "Updated description"
        assert data["status"] == "draft"

    def test_cannot_delete_template_with_versions(
        self, client: TestClient, create_published_template
    ):
        """Test that templates with versions cannot be deleted."""
        template, _ = create_published_template

        response = client.delete(f"/api/templates/{template.id}")
        assert response.status_code == 400
        assert "Cannot delete template with" in response.json()["detail"]
        assert "existing versions" in response.json()["detail"]

    def test_can_delete_template_without_versions(self, client: TestClient, create_test_template):
        """Test that templates without versions can be deleted."""
        template = create_test_template

        response = client.delete(f"/api/templates/{template.id}")
        assert response.status_code == 204


class TestAuditLogging:
    """Test audit logging for template operations."""

    def test_create_template_audit(self, client: TestClient, test_db: Session):
        """Test audit log created for template creation."""
        response = client.post(
            "/api/templates/",
            json={
                "name": "Audit Test Template",
                "description": "Testing audit",
                "template_type": "standard",
                "folder_structure": {"folders": []},
            },
        )
        assert response.status_code == 201

        # Check audit log was created
        from api.models.audit import AuditLog

        audit = test_db.query(AuditLog).filter(AuditLog.action == "create_template").first()

        assert audit is not None
        assert audit.entity_type == "template"
        assert audit.user_id == "system"

    def test_publish_template_audit(
        self, client: TestClient, create_test_template, test_db: Session
    ):
        """Test audit log created for template publishing."""
        template = create_test_template

        response = client.post(
            f"/api/templates/{template.id}/publish",
            json={"change_description": "Audit test publish"},
        )
        assert response.status_code == 200

        # Check audit log
        from api.models.audit import AuditLog

        audit = (
            test_db.query(AuditLog)
            .filter(AuditLog.action == "publish", AuditLog.entity_id == str(template.id))
            .first()
        )

        assert audit is not None
        assert audit.entity_type == "template"
