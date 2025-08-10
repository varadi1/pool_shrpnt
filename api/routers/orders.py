import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_session
from api.core.logging import get_logger
from api.schemas.order import (
    OrderEm,
    OrderEmCreate,
    OrderEmList,
    OrderEmUpdate,
    ProvisionRequest,
    ProvisionResponse,
)
from api.services.orders import OrderService
from api.services.provisioning import ProvisioningService

logger = get_logger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


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


@router.post("", response_model=OrderEm, status_code=201)
async def create_order(
    order_data: OrderEmCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Create a new order/EM"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Creating order: {order_data.em_number}",
        extra={"correlation_id": correlation_id, "user_id": user_id},
    )

    try:
        service = OrderService(session)
        order = await service.create_order(order_data, user_id)
        return order
    except ValueError as e:
        logger.error(f"Order creation failed: {str(e)}", extra={"correlation_id": correlation_id})
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            f"Unexpected error creating order: {str(e)}", extra={"correlation_id": correlation_id}
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "correlation_id": correlation_id,
            },
        )


@router.get("/{order_id}", response_model=OrderEm)
async def get_order(
    order_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Get an order by ID"""
    service = OrderService(session)
    order = await service.get_order(order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order


@router.get("", response_model=OrderEmList)
async def list_orders(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    contract_id: int | None = None,
    partner_company_id: int | None = None,
    provisioning_status: str | None = Query(
        None, pattern="^(pending|in_progress|completed|failed)$"
    ),
    session: AsyncSession = Depends(get_session),
):
    """List orders with pagination and filters"""
    service = OrderService(session)
    orders, total = await service.list_orders(
        page, page_size, contract_id, partner_company_id, provisioning_status
    )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return OrderEmList(
        items=orders,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.patch("/{order_id}", response_model=OrderEm)
async def update_order(
    order_id: int,
    order_update: OrderEmUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Update an order"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Updating order: {order_id}",
        extra={"correlation_id": correlation_id, "user_id": user_id},
    )

    service = OrderService(session)
    order = await service.update_order(order_id, order_update, user_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order


@router.post("/{order_id}/provision", response_model=ProvisionResponse)
async def provision_order(
    order_id: int,
    provision_request: ProvisionRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Trigger provisioning for an order"""
    correlation_id = get_correlation_id(request)
    user_id = get_user_id(request)

    logger.info(
        f"Triggering provisioning for order: {order_id}",
        extra={
            "correlation_id": correlation_id,
            "user_id": user_id,
            "template_id": provision_request.template_id,
        },
    )

    try:
        service = ProvisioningService(session)
        job_id = await service.trigger_provisioning(
            order_id=order_id,
            template_id=provision_request.template_id,
            priority=provision_request.priority,
            correlation_id=correlation_id,
            user_id=user_id,
        )

        return ProvisionResponse(
            job_id=job_id,
            status="in_progress",
            message="Provisioning job created successfully",
            correlation_id=correlation_id,
        )
    except ValueError as e:
        logger.error(
            f"Provisioning trigger failed: {str(e)}", extra={"correlation_id": correlation_id}
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            f"Unexpected error triggering provisioning: {str(e)}",
            extra={"correlation_id": correlation_id},
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "correlation_id": correlation_id,
            },
        )
