from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.core.database import get_db
from api.schemas.template import (
    FolderTemplateCreate,
    FolderTemplateList,
    FolderTemplateResponse,
    FolderTemplateUpdate,
)
from api.schemas.template_version import (
    TemplatePublishRequest,
    TemplateRollbackRequest,
    TemplateRollbackValidation,
    TemplateVersionList,
    TemplateVersionResponse,
)
from api.services.template_diff import TemplateDiffService
from api.services.template_rollback import TemplateRollbackService
from api.services.templates import TemplateService

router = APIRouter(
    prefix="/templates",
    tags=["templates"],
    responses={404: {"description": "Not found"}},
)


@router.get("/", response_model=FolderTemplateList)
async def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    service = TemplateService(db)
    return service.list_templates(page=page, page_size=page_size, is_active=is_active)


@router.get("/{template_id}", response_model=FolderTemplateResponse)
async def get_template(template_id: int, db: Session = Depends(get_db)):
    service = TemplateService(db)
    template = service.get_template(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found",
        )
    return template


@router.post("/", response_model=FolderTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(template_data: FolderTemplateCreate, db: Session = Depends(get_db)):
    service = TemplateService(db)
    return service.create_template(template_data)


@router.put("/{template_id}", response_model=FolderTemplateResponse)
async def update_template(
    template_id: int, template_data: FolderTemplateUpdate, db: Session = Depends(get_db)
):
    service = TemplateService(db)
    template = service.update_template(template_id, template_data)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found",
        )
    return template


@router.post(
    "/{template_id}/version",
    response_model=FolderTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template_version(template_id: int, db: Session = Depends(get_db)):
    service = TemplateService(db)
    template = service.create_template_version(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found",
        )
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: int, db: Session = Depends(get_db)):
    service = TemplateService(db)
    try:
        success = service.delete_template(
            template_id, user_id="system"
        )  # TODO: Use current_user.id
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template with id {template_id} not found",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    return None


# Version management endpoints
@router.get("/{template_id}/versions", response_model=TemplateVersionList)
async def list_template_versions(
    template_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List all versions of a template."""
    service = TemplateService(db)
    versions = service.list_template_versions(template_id, page=page, page_size=page_size)
    if not versions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found",
        )
    return versions


@router.get("/{template_id}/versions/{version}", response_model=TemplateVersionResponse)
async def get_template_version(
    template_id: int,
    version: str,
    db: Session = Depends(get_db),
):
    """Get a specific version of a template."""
    service = TemplateService(db)
    version_obj = service.get_template_version(template_id, version)
    if not version_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version} not found for template {template_id}",
        )
    return version_obj


@router.post("/{template_id}/publish", response_model=TemplateVersionResponse)
async def publish_template(
    template_id: int,
    request: TemplatePublishRequest,
    db: Session = Depends(get_db),
    # TODO: Add user context from auth
    # current_user: User = Depends(get_current_user),
):
    """Publish a draft template as a new immutable version."""
    service = TemplateService(db)
    try:
        version = service.publish_template(
            template_id=template_id,
            change_description=request.change_description,
            version_type=request.version_type,
            user_id="system",  # TODO: Use current_user.id
        )
        return TemplateVersionResponse.model_validate(version)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{template_id}/diff")
async def get_template_diff(
    template_id: int,
    from_version: str = Query(..., description="Source version"),
    to_version: str = Query(..., description="Target version"),
    output_format: str = Query("json", pattern="^(json|text)$"),
    db: Session = Depends(get_db),
):
    """Get diff between two template versions."""
    diff_service = TemplateDiffService(db)
    try:
        diff = diff_service.get_diff(
            template_id=template_id,
            from_version=from_version,
            to_version=to_version,
            output_format=output_format,
        )
        return diff
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/{template_id}/rollback", response_model=TemplateVersionResponse)
async def rollback_template(
    template_id: int,
    request: TemplateRollbackRequest,
    db: Session = Depends(get_db),
    # TODO: Add user context from auth
    # current_user: User = Depends(get_current_user),
):
    """Rollback to a previous template version."""
    rollback_service = TemplateRollbackService(db)
    try:
        new_version = rollback_service.rollback_to_version(
            template_id=template_id,
            target_version=request.target_version,
            rollback_reason=request.rollback_reason,
            user_id="system",  # TODO: Use current_user.id
        )
        return TemplateVersionResponse.model_validate(new_version)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/{template_id}/rollback/validate", response_model=TemplateRollbackValidation)
async def validate_rollback(
    template_id: int,
    target_version: str = Query(..., description="Version to rollback to"),
    db: Session = Depends(get_db),
):
    """Validate if a rollback is safe to perform."""
    rollback_service = TemplateRollbackService(db)
    validation = rollback_service.validate_rollback(template_id, target_version)
    return TemplateRollbackValidation(**validation)
