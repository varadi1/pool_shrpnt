from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.logging import get_logger
from api.models.contract import Contract, OrderEm, PartnerCompany
from api.schemas.order import OrderEmCreate, OrderEmUpdate

logger = get_logger(__name__)


class OrderService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_order(self, order_data: OrderEmCreate, created_by: str) -> OrderEm:
        logger.info(f"Creating order: {order_data.em_number}")

        # Validate contract exists and is active
        contract = await self.session.execute(
            select(Contract).where(Contract.id == order_data.contract_id)
        )
        contract = contract.scalar_one_or_none()
        if not contract:
            raise ValueError(f"Contract with id {order_data.contract_id} not found")
        if contract.status != "active":
            raise ValueError(f"Contract {contract.id} is not active")

        # Validate partner company exists
        partner = await self.session.execute(
            select(PartnerCompany).where(PartnerCompany.id == order_data.partner_company_id)
        )
        partner = partner.scalar_one_or_none()
        if not partner:
            raise ValueError(f"Partner company with id {order_data.partner_company_id} not found")
        if not partner.is_active:
            raise ValueError(f"Partner company {partner.id} is not active")

        # Check for duplicate EM number
        existing = await self.session.execute(
            select(OrderEm).where(OrderEm.em_number == order_data.em_number)
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Order with EM number {order_data.em_number} already exists")

        order = OrderEm(
            **order_data.model_dump(),
            created_by=created_by,
            updated_by=created_by,
        )
        self.session.add(order)
        await self.session.commit()
        await self.session.refresh(order)

        logger.info(f"Order created: {order.id}")
        return order

    async def get_order(self, order_id: int) -> OrderEm | None:
        result = await self.session.execute(select(OrderEm).where(OrderEm.id == order_id))
        return result.scalar_one_or_none()

    async def get_order_by_em_number(self, em_number: str) -> OrderEm | None:
        result = await self.session.execute(select(OrderEm).where(OrderEm.em_number == em_number))
        return result.scalar_one_or_none()

    async def list_orders(
        self,
        page: int = 1,
        page_size: int = 50,
        contract_id: int | None = None,
        partner_company_id: int | None = None,
        provisioning_status: str | None = None,
    ) -> tuple[list[OrderEm], int]:
        query = select(OrderEm)

        if contract_id:
            query = query.where(OrderEm.contract_id == contract_id)
        if partner_company_id:
            query = query.where(OrderEm.partner_company_id == partner_company_id)
        if provisioning_status:
            query = query.where(OrderEm.provisioning_status == provisioning_status)

        count_query = select(func.count()).select_from(query.subquery())
        total = await self.session.scalar(count_query)

        query = query.order_by(OrderEm.created_at.desc())
        query = query.limit(page_size).offset((page - 1) * page_size)

        result = await self.session.execute(query)
        orders = result.scalars().all()

        return list(orders), total or 0

    async def update_order(
        self, order_id: int, order_update: OrderEmUpdate, updated_by: str
    ) -> OrderEm | None:
        order = await self.get_order(order_id)
        if not order:
            return None

        update_data = order_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(order, field, value)

        order.updated_by = updated_by
        order.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(order)

        logger.info(f"Order updated: {order.id}")
        return order

    async def can_provision_order(self, order_id: int) -> tuple[bool, str]:
        """Check if an order can be provisioned"""
        order = await self.get_order(order_id)
        if not order:
            return False, "Order not found"

        if order.provisioning_status not in ["pending", "failed"]:
            return False, f"Order is already {order.provisioning_status}"

        # Load contract to check validity
        contract = await self.session.execute(
            select(Contract).where(Contract.id == order.contract_id)
        )
        contract = contract.scalar_one_or_none()
        if not contract or contract.status != "active":
            return False, "Contract is not active"

        return True, "Order can be provisioned"

    async def start_provisioning(self, order_id: int, job_id: str) -> OrderEm:
        """Mark order as provisioning started"""
        order = await self.get_order(order_id)
        if not order:
            raise ValueError(f"Order {order_id} not found")

        order.provisioning_status = "in_progress"
        order.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(order)

        logger.info(f"Order {order_id} provisioning started with job {job_id}")
        return order

    async def complete_provisioning(self, order_id: int, team_name: str, site_url: str) -> OrderEm:
        """Mark order as successfully provisioned"""
        order = await self.get_order(order_id)
        if not order:
            raise ValueError(f"Order {order_id} not found")

        order.provisioning_status = "completed"
        order.provisioned_at = datetime.utcnow()
        order.team_name = team_name
        order.site_url = site_url
        order.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(order)

        logger.info(f"Order {order_id} provisioning completed")
        return order

    async def fail_provisioning(self, order_id: int, error: str) -> OrderEm:
        """Mark order as failed provisioning"""
        order = await self.get_order(order_id)
        if not order:
            raise ValueError(f"Order {order_id} not found")

        order.provisioning_status = "failed"
        order.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(order)

        logger.error(f"Order {order_id} provisioning failed: {error}")
        return order
