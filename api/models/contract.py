from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, synonym

from api.core.database import Base


class Contract(Base):
    __tablename__ = "contract"

    id = Column(Integer, primary_key=True, index=True)
    contract_number = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True))
    status = Column(String(50), nullable=False, default="active")
    total_value = Column(Numeric(15, 2))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    created_by = Column(String(255))
    updated_by = Column(String(255))

    orders = relationship("OrderEm", back_populates="contract")


class PartnerCompany(Base):
    __tablename__ = "partner_company"

    id = Column(Integer, primary_key=True, index=True)
    company_code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    short_name = Column(String(50), nullable=False)
    # Optional fields used by tests and some integrations
    short_code = Column(String(50))
    domain = Column(String(255))
    tax_number = Column(String(50))
    address = Column(Text)
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    orders = relationship("OrderEm", back_populates="partner_company")


class OrderEm(Base):
    __tablename__ = "order_em"

    id = Column(Integer, primary_key=True, index=True)
    em_number = Column(String(50), unique=True, nullable=True, index=True)
    title = Column(String(255), nullable=True)
    description = Column(Text)
    status = Column(String(50), nullable=False, default="active")
    contract_id = Column(Integer, ForeignKey("contract.id"), nullable=True)
    partner_company_id = Column(Integer, ForeignKey("partner_company.id"), nullable=True)
    template_version_id = Column(
        UUID(as_uuid=True), ForeignKey("folder_template_version.id")
    )  # Lock to specific template version
    year = Column(Integer, nullable=True, index=True)
    part = Column(String(1), nullable=True)
    # SharePoint integration fields (used by permission reconciler/tests)
    sharepoint_site_id = Column(String(255))
    sharepoint_drive_id = Column(String(255))
    sharepoint_sync_status = Column(String(50))
    sharepoint_sync_at = Column(DateTime(timezone=True))
    folder_structure = Column(JSON)
    team_name = Column(String(255))
    site_url = Column(String(500))
    provisioning_status = Column(String(50), default="pending", nullable=False)
    provisioned_at = Column(DateTime(timezone=True))
    lock_status = Column(String(50), default="unlocked", nullable=False)
    locked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    created_by = Column(String(255))
    updated_by = Column(String(255))

    contract = relationship("Contract", back_populates="orders")
    partner_company = relationship("PartnerCompany", back_populates="orders")
    lock_rules = relationship("LockRule", back_populates="order_em", cascade="all, delete-orphan")
    # View-only relationship to avoid FK enforcement in tests creating orphan LockState rows
    from sqlalchemy.orm import foreign
    lock_states = relationship(
        "LockState",
        primaryjoin=lambda: foreign(__import__("api.models.lock", fromlist=["lock"]).lock.LockState.order_em_id) == OrderEm.id,
        viewonly=True,
    )

    # Backwards-compatible alias used throughout services/tests
    name = synonym("title")
