from sqlalchemy.orm import Session

from api.models.template import FolderTemplate
from api.schemas.template import FolderTemplateCreate, FolderTemplateUpdate


class TemplateRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, template_id: int) -> FolderTemplate | None:
        return self.db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()

    def get_all(
        self, skip: int = 0, limit: int = 100, is_active: bool | None = None
    ) -> list[FolderTemplate]:
        query = self.db.query(FolderTemplate)

        if is_active is not None:
            query = query.filter(FolderTemplate.is_active == is_active)

        return query.offset(skip).limit(limit).all()

    def count(self, is_active: bool | None = None) -> int:
        query = self.db.query(FolderTemplate)

        if is_active is not None:
            query = query.filter(FolderTemplate.is_active == is_active)

        return query.count()

    def create(
        self, template_data: FolderTemplateCreate, created_by: str | None = None
    ) -> FolderTemplate:
        db_template = FolderTemplate(
            **template_data.model_dump(), created_by=created_by, updated_by=created_by
        )
        self.db.add(db_template)
        self.db.commit()
        self.db.refresh(db_template)
        return db_template

    def update(
        self,
        template_id: int,
        template_data: FolderTemplateUpdate,
        updated_by: str | None = None,
    ) -> FolderTemplate | None:
        db_template = self.get_by_id(template_id)
        if not db_template:
            return None

        update_data = template_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_template, field, value)

        db_template.updated_by = updated_by
        self.db.commit()
        self.db.refresh(db_template)
        return db_template

    def create_version(
        self, template_id: int, updated_by: str | None = None
    ) -> FolderTemplate | None:
        source_template = self.get_by_id(template_id)
        if not source_template:
            return None

        source_template.is_active = False

        # Calculate new version number
        new_version = source_template.version + 1
        new_version_number = f"{new_version}.0.0"

        new_template = FolderTemplate(
            name=source_template.name,
            description=source_template.description,
            template_type=source_template.template_type,
            folder_structure=source_template.folder_structure,
            permissions_template=source_template.permissions_template,
            version=new_version,
            version_number=new_version_number,
            parent_id=source_template.id,
            is_active=True,
            created_by=updated_by,
            updated_by=updated_by,
        )

        self.db.add(new_template)
        self.db.commit()
        self.db.refresh(new_template)
        return new_template

    def delete(self, template_id: int) -> bool:
        db_template = self.get_by_id(template_id)
        if not db_template:
            return False

        db_template.is_active = False
        self.db.commit()
        return True
