import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_session
from api.core.logging import get_logger
from api.schemas.job import JobStatus
from api.services.provisioning import ProvisioningService

logger = get_logger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_user_id(request: Request) -> str:
    """Extract user ID from request (placeholder for actual auth)"""
    # TODO: Get from JWT token after auth implementation
    return request.headers.get("x-user-id", "system")


def get_correlation_id(request: Request) -> str:
    """Extract correlation ID from request"""
    correlation_id = request.headers.get("x-correlation-id")
    if not correlation_id:
        correlation_id = str(uuid.uuid4())
    return correlation_id


@router.get("/{job_id}/status", response_model=JobStatus)
async def get_job_status(
    job_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Get the current status of a provisioning job"""
    correlation_id = get_correlation_id(request)

    logger.info(f"Getting job status: {job_id}", extra={"correlation_id": correlation_id})

    service = ProvisioningService(session)
    job_data = await service.get_job_status(job_id)

    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    # Convert to response model
    return JobStatus(
        job_id=job_data["job_id"],
        status=job_data.get("status", "unknown"),
        phase=job_data.get("phase"),
        progress=job_data.get("progress", 0),
        message=job_data.get("message"),
        started_at=job_data.get("started_at"),
        completed_at=job_data.get("completed_at"),
        estimated_completion=job_data.get("estimated_completion"),
        error=job_data.get("error"),
        details=job_data.get("details"),
        correlation_id=job_data.get("correlation_id", correlation_id),
    )


@router.post("/{job_id}/cancel", status_code=204)
async def cancel_job(
    job_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Cancel a provisioning job"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Cancelling job: {job_id}",
        extra={"correlation_id": correlation_id, "user_id": user_id},
    )

    service = ProvisioningService(session)
    success = await service.cancel_job(job_id)

    if not success:
        raise HTTPException(status_code=404, detail="Job not found or already completed")

    return None
