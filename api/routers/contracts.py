from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_session
from api.core.logging import get_logger
from api.schemas.contract import Contract, ContractCreate, ContractList, ContractUpdate
from api.services.contracts import ContractService

logger = get_logger(__name__)

router = APIRouter(prefix="/contracts", tags=["contracts"])


@router.get("")
async def list_contracts(
    status: str = Query(None, description="Filter by status"),
    session: AsyncSession = Depends(get_session),
):
    """List contracts with optional filters - stub implementation"""
    # Return mock data for dashboard
    if status == "active":
        return {"count": 0, "items": []}
    else:
        return {"count": 0, "items": []}


def get_user_id(request: Request) -> str:
    """Extract user ID from request (placeholder for actual auth)"""
    # TODO: Get from JWT token after auth implementation
    return request.headers.get("x-user-id", "system")


def get_correlation_id(request: Request) -> str:
    """Extract correlation ID from request"""
    return request.headers.get("x-correlation-id", "unknown")


@router.post("", response_model=Contract, status_code=201)
async def create_contract(
    contract_data: ContractCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Create a new contract"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Creating contract: {contract_data.contract_number}",
        extra={"correlation_id": correlation_id, "user_id": user_id},
    )

    try:
        service = ContractService(session)
        contract = await service.create_contract(contract_data, user_id)
        return contract
    except ValueError as e:
        logger.error(
            f"Contract creation failed: {str(e)}", extra={"correlation_id": correlation_id}
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            f"Unexpected error creating contract: {str(e)}",
            extra={"correlation_id": correlation_id},
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "correlation_id": correlation_id,
            },
        )


@router.get("/{contract_id}", response_model=Contract)
async def get_contract(
    contract_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Get a contract by ID"""
    service = ContractService(session)
    contract = await service.get_contract(contract_id)

    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    return contract


@router.get("", response_model=ContractList)
async def list_contracts(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: str | None = Query(None, pattern="^(active|inactive|expired)$"),
    session: AsyncSession = Depends(get_session),
):
    """List contracts with pagination"""
    service = ContractService(session)
    contracts, total = await service.list_contracts(page, page_size, status)

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return ContractList(
        items=contracts,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.patch("/{contract_id}", response_model=Contract)
async def update_contract(
    contract_id: int,
    contract_update: ContractUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Update a contract"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Updating contract: {contract_id}",
        extra={"correlation_id": correlation_id, "user_id": user_id},
    )

    service = ContractService(session)
    contract = await service.update_contract(contract_id, contract_update, user_id)

    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    return contract


@router.delete("/{contract_id}", status_code=204)
async def delete_contract(
    contract_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Deactivate a contract (soft delete)"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Deactivating contract: {contract_id}",
        extra={"correlation_id": correlation_id, "user_id": user_id},
    )

    service = ContractService(session)
    success = await service.delete_contract(contract_id)

    if not success:
        raise HTTPException(status_code=404, detail="Contract not found")

    return None
