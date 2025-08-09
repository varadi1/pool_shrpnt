from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.logging import get_logger
from api.models.contract import Contract
from api.schemas.contract import ContractCreate, ContractUpdate

logger = get_logger(__name__)


class ContractService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_contract(self, contract_data: ContractCreate, created_by: str) -> Contract:
        logger.info(f"Creating contract: {contract_data.contract_number}")

        existing = await self.session.execute(
            select(Contract).where(Contract.contract_number == contract_data.contract_number)
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Contract with number {contract_data.contract_number} already exists")

        contract = Contract(
            **contract_data.model_dump(),
            created_by=created_by,
            updated_by=created_by,
        )
        self.session.add(contract)
        await self.session.commit()
        await self.session.refresh(contract)

        logger.info(f"Contract created: {contract.id}")
        return contract

    async def get_contract(self, contract_id: int) -> Contract | None:
        result = await self.session.execute(select(Contract).where(Contract.id == contract_id))
        return result.scalar_one_or_none()

    async def get_contract_by_number(self, contract_number: str) -> Contract | None:
        result = await self.session.execute(
            select(Contract).where(Contract.contract_number == contract_number)
        )
        return result.scalar_one_or_none()

    async def list_contracts(
        self,
        page: int = 1,
        page_size: int = 50,
        status: str | None = None,
    ) -> tuple[list[Contract], int]:
        query = select(Contract)

        if status:
            query = query.where(Contract.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        total = await self.session.scalar(count_query)

        query = query.order_by(Contract.created_at.desc())
        query = query.limit(page_size).offset((page - 1) * page_size)

        result = await self.session.execute(query)
        contracts = result.scalars().all()

        return list(contracts), total or 0

    async def update_contract(
        self, contract_id: int, contract_update: ContractUpdate, updated_by: str
    ) -> Contract | None:
        contract = await self.get_contract(contract_id)
        if not contract:
            return None

        update_data = contract_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(contract, field, value)

        contract.updated_by = updated_by
        contract.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(contract)

        logger.info(f"Contract updated: {contract.id}")
        return contract

    async def delete_contract(self, contract_id: int) -> bool:
        contract = await self.get_contract(contract_id)
        if not contract:
            return False

        contract.status = "inactive"
        contract.updated_at = datetime.utcnow()
        await self.session.commit()

        logger.info(f"Contract deactivated: {contract.id}")
        return True
