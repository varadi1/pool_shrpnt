import re
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.template import FolderTemplate, FolderTemplateVersion
from api.repositories.template import TemplateRepository
from api.schemas.template import (
    FolderTemplateCreate,
    FolderTemplateList,
    FolderTemplateResponse,
    FolderTemplateUpdate,
)
from api.services.audit import AuditService


class TemplateService:
    def __init__(self, db: Session):
        self.repository = TemplateRepository(db)
        self.db = db
        self.audit_service = AuditService(db)

    def get_template(self, template_id: int) -> FolderTemplateResponse | None:
        template = self.repository.get_by_id(template_id)
        if template:
            return FolderTemplateResponse.model_validate(template)
        return None

    def list_templates(
        self, page: int = 1, page_size: int = 20, is_active: bool | None = None
    ) -> FolderTemplateList:
        skip = (page - 1) * page_size
        templates = self.repository.get_all(skip=skip, limit=page_size, is_active=is_active)
        total = self.repository.count(is_active=is_active)

        return FolderTemplateList(
            templates=[FolderTemplateResponse.model_validate(t) for t in templates],
            total=total,
            page=page,
            page_size=page_size,
        )

    def create_template(
        self, template_data: FolderTemplateCreate, user_id: str | None = None
    ) -> FolderTemplateResponse:
        template = self.repository.create(template_data, created_by=user_id)

        # Log audit event for template creation
        self.audit_service.log_event(
            user_id=user_id or "system",
            action="create_template",
            entity_type="template",
            entity_id=str(template.id),
            correlation_id=str(uuid4()),
            after_state=template_data.model_dump(),
            metadata={
                "template_name": template.name,
                "template_type": template.template_type,
            },
        )

        return FolderTemplateResponse.model_validate(template)

    def update_template(
        self, template_id: int, template_data: FolderTemplateUpdate, user_id: str | None = None
    ) -> FolderTemplateResponse | None:
        # Check if template exists and is in draft status
        template = self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()
        if not template:
            return None

        if template.status == "published":
            raise HTTPException(
                status_code=400,
                detail="Cannot modify published template. Create a new draft version instead.",
            )

        template = self.repository.update(template_id, template_data, updated_by=user_id)
        if template:
            # Log audit event for template update
            self.audit_service.log_event(
                user_id=user_id or "system",
                action="update_template",
                entity_type="template",
                entity_id=str(template_id),
                correlation_id=str(uuid4()),
                before_state={"status": "draft"},
                after_state=template_data.model_dump(exclude_unset=True),
                metadata={"template_id": template_id},
            )
            return FolderTemplateResponse.model_validate(template)
        return None

    def create_template_version(
        self, template_id: int, user_id: str | None = None
    ) -> FolderTemplateResponse | None:
        template = self.repository.create_version(template_id, updated_by=user_id)
        if template:
            return FolderTemplateResponse.model_validate(template)
        return None

    def delete_template(self, template_id: int, user_id: str | None = None) -> bool:
        # Check if template has any versions
        version_count = (
            self.db.query(FolderTemplateVersion)
            .filter(FolderTemplateVersion.template_id == template_id)
            .count()
        )

        if version_count > 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot delete template with {version_count} existing versions. "
                    "Archive it instead."
                ),
            )

        template = self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()
        if not template:
            return False

        # Log audit event before deletion
        self.audit_service.log_event(
            user_id=user_id or "system",
            action="delete_template",
            entity_type="template",
            entity_id=str(template_id),
            correlation_id=str(uuid4()),
            before_state={
                "name": template.name,
                "status": template.status,
                "version": template.version_number,
            },
            metadata={"template_name": template.name},
        )

        return self.repository.delete(template_id)

    def _validate_template_fields(self, template: FolderTemplate) -> tuple[bool, list[str]]:
        """Validate required fields before publishing."""
        errors = []

        if not template.folder_structure:
            errors.append("Folder structure is required")
        elif not isinstance(template.folder_structure, dict):
            errors.append("Folder structure must be a valid JSON object")
        elif "folders" not in template.folder_structure:
            errors.append("Folder structure must contain 'folders' key")

        if template.permissions_template:
            if not isinstance(template.permissions_template, dict):
                errors.append("Permissions template must be a valid JSON object")

        return len(errors) == 0, errors

    def _increment_version(self, current_version: str, version_type: str = "patch") -> str:
        """Increment semantic version (MAJOR.MINOR.PATCH)."""
        match = re.match(r"^(\d+)\.(\d+)\.(\d+)$", current_version)
        if not match:
            return "1.0.0"

        major, minor, patch = map(int, match.groups())

        if version_type == "major":
            return f"{major + 1}.0.0"
        elif version_type == "minor":
            return f"{major}.{minor + 1}.0"
        else:  # patch
            return f"{major}.{minor}.{patch + 1}"

    def publish_template(
        self,
        template_id: int,
        change_description: str | None = None,
        version_type: str = "patch",
        user_id: str | None = None,
    ) -> FolderTemplateVersion:
        """Publish a draft template as a new immutable version."""
        template = self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()

        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        if template.status == "published":
            raise HTTPException(status_code=400, detail="Template is already published")

        # Validate required fields
        is_valid, errors = self._validate_template_fields(template)
        if not is_valid:
            raise HTTPException(
                status_code=400, detail=f"Template validation failed: {', '.join(errors)}"
            )

        # Get latest version for this template
        latest_version = (
            self.db.query(FolderTemplateVersion)
            .filter(FolderTemplateVersion.template_id == template_id)
            .order_by(FolderTemplateVersion.created_at.desc())
            .first()
        )

        # Determine new version number
        if latest_version:
            new_version = self._increment_version(latest_version.version, version_type)
            parent_version_id = latest_version.id
        else:
            new_version = "1.0.0"
            parent_version_id = None

        # Create version snapshot
        version = FolderTemplateVersion(
            id=uuid4(),
            template_id=template_id,
            version=new_version,
            content={
                "name": template.name,
                "description": template.description,
                "template_type": template.template_type,
                "folder_structure": template.folder_structure,
                "permissions_template": template.permissions_template,
            },
            author_id=user_id or "system",
            change_description=change_description,
            parent_version_id=parent_version_id,
            status="published",
            folder_structure=template.folder_structure,
            permissions_template=template.permissions_template,
        )

        # Add version first and flush to get its ID
        self.db.add(version)
        self.db.flush()

        # Update template status
        template.status = "published"
        template.version_number = new_version
        template.parent_version_id = version.id
        template.is_current = True
        template.updated_by = user_id

        # Mark other versions as not current
        self.db.query(FolderTemplate).filter(
            FolderTemplate.name == template.name, FolderTemplate.id != template_id
        ).update({"is_current": False})

        self.db.commit()

        # Log audit event
        self.audit_service.log_event(
            user_id=user_id or "system",
            action="publish",
            entity_type="template",
            entity_id=str(template_id),
            correlation_id=str(uuid4()),
            after_state=version.content,
            metadata={
                "version": new_version,
                "change_description": change_description,
                "template_snapshot": version.content,
            },
        )

        return version

    def list_template_versions(
        self, template_id: int, page: int = 1, page_size: int = 20
    ) -> dict | None:
        """List all versions of a template."""
        # Check template exists
        template = self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()
        if not template:
            return None

        skip = (page - 1) * page_size
        query = self.db.query(FolderTemplateVersion).filter(
            FolderTemplateVersion.template_id == template_id
        )

        total = query.count()
        versions = (
            query.order_by(FolderTemplateVersion.created_at.desc())
            .offset(skip)
            .limit(page_size)
            .all()
        )

        return {
            "versions": versions,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get_template_version(self, template_id: int, version: str) -> FolderTemplateVersion | None:
        """Get a specific version of a template."""
        return (
            self.db.query(FolderTemplateVersion)
            .filter(
                FolderTemplateVersion.template_id == template_id,
                FolderTemplateVersion.version == version,
            )
            .first()
        )
