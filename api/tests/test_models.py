from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.models.contract import Contract, OrderEm, PartnerCompany
from api.models.idempotency import IdempotentOperation
from api.models.template import FolderTemplate


def test_create_contract(test_db: Session):
    contract = Contract(
        contract_number="C2024001",
        name="Test Contract",
        description="Test Description",
        start_date=datetime.utcnow(),
        status="active",
        total_value=100000.00,
        created_by="test_user",
    )

    test_db.add(contract)
    test_db.commit()

    assert contract.id is not None
    assert contract.contract_number == "C2024001"
    assert contract.status == "active"
    assert contract.created_at is not None


def test_contract_unique_constraint(test_db: Session):
    contract1 = Contract(
        contract_number="C2024001", name="Contract 1", start_date=datetime.utcnow(), status="active"
    )
    test_db.add(contract1)
    test_db.commit()

    contract2 = Contract(
        contract_number="C2024001", name="Contract 2", start_date=datetime.utcnow(), status="active"
    )
    test_db.add(contract2)

    with pytest.raises(IntegrityError):
        test_db.commit()


def test_create_partner_company(test_db: Session):
    partner = PartnerCompany(
        company_code="COMP001",
        name="Test Company",
        short_name="TC",
        tax_number="12345678",
        address="123 Test Street",
        contact_email="test@company.com",
        contact_phone="+1234567890",
        is_active=True,
    )

    test_db.add(partner)
    test_db.commit()

    assert partner.id is not None
    assert partner.company_code == "COMP001"
    assert partner.is_active is True


def test_create_order_em(test_db: Session):
    contract = Contract(
        contract_number="C2024001",
        name="Test Contract",
        start_date=datetime.utcnow(),
        status="active",
    )
    test_db.add(contract)

    partner = PartnerCompany(
        company_code="COMP001", name="Test Company", short_name="TC", is_active=True
    )
    test_db.add(partner)
    test_db.commit()

    order = OrderEm(
        em_number="EM2024001",
        title="Test Order",
        description="Test Order Description",
        contract_id=contract.id,
        partner_company_id=partner.id,
        year=2024,
        part="A",
        team_name="Test Team",
        provisioning_status="pending",
        lock_status="unlocked",
        created_by="test_user",
    )

    test_db.add(order)
    test_db.commit()

    assert order.id is not None
    assert order.em_number == "EM2024001"
    assert order.contract_id == contract.id
    assert order.partner_company_id == partner.id
    assert order.year == 2024
    assert order.part == "A"


def test_order_relationships(test_db: Session):
    contract = Contract(
        contract_number="C2024001",
        name="Test Contract",
        start_date=datetime.utcnow(),
        status="active",
    )
    test_db.add(contract)

    partner = PartnerCompany(
        company_code="COMP001", name="Test Company", short_name="TC", is_active=True
    )
    test_db.add(partner)
    test_db.commit()

    order = OrderEm(
        em_number="EM2024001",
        title="Test Order",
        contract_id=contract.id,
        partner_company_id=partner.id,
        year=2024,
        part="A",
    )
    test_db.add(order)
    test_db.commit()

    test_db.refresh(order)

    assert order.contract.contract_number == "C2024001"
    assert order.partner_company.company_code == "COMP001"
    assert len(contract.orders) == 1
    assert contract.orders[0].em_number == "EM2024001"


def test_folder_template_versioning(test_db: Session):
    template1 = FolderTemplate(
        name="Template v1",
        description="Version 1",
        template_type="standard",
        folder_structure={"root": {"folder1": {}}},
        version=1,
        version_number="1.0.0",
        is_active=False,
    )
    test_db.add(template1)
    test_db.commit()

    template2 = FolderTemplate(
        name="Template v1",
        description="Version 2",
        template_type="standard",
        folder_structure={"root": {"folder1": {}, "folder2": {}}},
        version=2,
        version_number="2.0.0",
        parent_id=template1.id,
        is_active=True,
    )
    test_db.add(template2)
    test_db.commit()

    assert template2.parent_id == template1.id
    assert template2.version == 2
    assert template2.is_active is True
    assert template1.is_active is False


def test_idempotent_operation_composite_index(test_db: Session):
    operation = IdempotentOperation(
        idempotency_key="test_key_123",
        em_id="EM001",
        operation="provision",
        scope="sharepoint",
        timestamp_window=datetime.utcnow(),
        status="pending",
    )

    test_db.add(operation)
    test_db.commit()

    assert operation.id is not None
    assert operation.idempotency_key == "test_key_123"
    assert operation.status == "pending"
    assert operation.completed_at is None
