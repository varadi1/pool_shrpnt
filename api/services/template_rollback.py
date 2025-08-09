from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.template import FolderTemplate, FolderTemplateVersion
from api.services.audit import AuditService


class TemplateRollbackService:
    """Service for rolling back template versions."""

    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def rollback_to_version(
        self,
        template_id: int,
        target_version: str,
        rollback_reason: str,
        user_id: str | None = None,
    ) -> FolderTemplateVersion:
        """Rollback to a previous template version by creating a new version from it."""

        # Get current template
        template = self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        # Get target version
        target_version_obj = self._get_version(template_id, target_version)
        if not target_version_obj:
            raise HTTPException(
                status_code=404, detail=f"Target version {target_version} not found"
            )

        # Validate target version is not the current version
        if template.version_number == target_version:
            raise HTTPException(status_code=400, detail="Cannot rollback to current version")

        # Get latest version to determine new version number
        latest_version = (
            self.db.query(FolderTemplateVersion)
            .filter(FolderTemplateVersion.template_id == template_id)
            .order_by(FolderTemplateVersion.created_at.desc())
            .first()
        )

        # Create new version number (increment patch)
        new_version = self._increment_rollback_version(latest_version.version)

        # Create new version from target (forward-only rollback)
        new_version_obj = FolderTemplateVersion(
            id=uuid4(),
            template_id=template_id,
            version=new_version,
            content=target_version_obj.content.copy(),  # Copy content from target
            author_id=user_id or "system",
            change_description=f"Rollback to version {target_version}: {rollback_reason}",
            parent_version_id=latest_version.id,  # Parent is current latest, not target
            status="published",
            folder_structure=target_version_obj.folder_structure.copy(),
            permissions_template=(
                target_version_obj.permissions_template.copy()
                if target_version_obj.permissions_template
                else None
            ),
        )

        # Update main template record
        template.folder_structure = target_version_obj.folder_structure.copy()
        template.permissions_template = (
            target_version_obj.permissions_template.copy()
            if target_version_obj.permissions_template
            else None
        )
        # Save new version first and flush to get its ID
        self.db.add(new_version_obj)
        self.db.flush()

        template.version_number = new_version
        template.parent_version_id = new_version_obj.id
        template.status = "published"
        template.is_current = True
        template.updated_by = user_id

        # Mark other templates with same name as not current
        self.db.query(FolderTemplate).filter(
            FolderTemplate.name == template.name, FolderTemplate.id != template_id
        ).update({"is_current": False})

        self.db.commit()

        # Log audit event
        self.audit_service.log_event(
            user_id=user_id or "system",
            action="rollback",
            entity_type="template",
            entity_id=str(template_id),
            correlation_id=str(uuid4()),
            before_state={"version": latest_version.version},
            after_state={"version": new_version},
            metadata={
                "from_version": latest_version.version,
                "to_version": target_version,
                "new_version": new_version,
                "rollback_reason": rollback_reason,
                "target_snapshot": target_version_obj.content,
            },
        )

        return new_version_obj

    def _get_version(self, template_id: int, version: str) -> FolderTemplateVersion | None:
        """Get specific template version."""
        return (
            self.db.query(FolderTemplateVersion)
            .filter(
                FolderTemplateVersion.template_id == template_id,
                FolderTemplateVersion.version == version,
            )
            .first()
        )

    def _increment_rollback_version(self, current_version: str) -> str:
        """Generate version number for rollback (always increment patch)."""
        import re

        match = re.match(r"^(\d+)\.(\d+)\.(\d+)$", current_version)
        if not match:
            # If version format is invalid, start fresh
            return "1.0.1"

        major, minor, patch = map(int, match.groups())
        return f"{major}.{minor}.{patch + 1}"

    def validate_rollback(self, template_id: int, target_version: str) -> dict:
        """Validate if rollback is possible and safe."""

        # Check template exists
        template = self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()
        if not template:
            return {"valid": False, "reason": "Template not found"}

        # Check target version exists
        target_version_obj = self._get_version(template_id, target_version)
        if not target_version_obj:
            return {"valid": False, "reason": f"Target version {target_version} not found"}

        # Check not rolling back to current version
        if template.version_number == target_version:
            return {"valid": False, "reason": "Cannot rollback to current version"}

        # Check for provisioned EMs using current version
        from api.models.contract import OrderEm

        current_version_obj = self._get_version(template_id, template.version_number)
        if current_version_obj:
            em_count = (
                self.db.query(OrderEm)
                .filter(OrderEm.template_version_id == current_version_obj.id)
                .count()
            )

            if em_count > 0:
                return {
                    "valid": True,
                    "warning": (
                        f"{em_count} EMs are using the current version. "
                        "They will not be affected by this rollback."
                    ),
                    "provisioned_ems": em_count,
                }

        return {"valid": True, "reason": "Rollback is safe to perform"}
