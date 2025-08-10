"""Tests for guest lifecycle model fields and tables."""

import pytest
from datetime import datetime, timedelta
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.models.guest import GuestUser, GuestStatus, GuestExtension, GuestLifecyclePolicy
from api.models.contract import PartnerCompany
from api.core.database import Base


@pytest.fixture
def test_db():
    """Create a PostgreSQL test database session."""
    import os
    from sqlalchemy.pool import NullPool

    url = os.getenv("TEST_DATABASE_URL", "postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test")
    engine = create_engine(url, poolclass=NullPool)
    Base.metadata.create_all(engine)
    try:
        TestSession = sessionmaker(bind=engine)
        session = TestSession()
        yield session
        session.close()
    finally:
        Base.metadata.drop_all(engine)


@pytest.fixture
def partner_company(test_db):
    """Create a test partner company."""
    company = PartnerCompany(id=1, name="Test Partner", short_code="TST", domain="testpartner.com")
    test_db.add(company)
    test_db.commit()
    return company


class TestGuestLifecycleModels:
    """Test guest lifecycle model extensions."""

    def test_guest_user_lifecycle_fields(self, test_db, partner_company):
        """Test that GuestUser has all lifecycle fields."""
        now = datetime.utcnow()
        expires = now + timedelta(days=90)

        guest = GuestUser(
            email="guest@example.com",
            display_name="Test Guest",
            partner_company_id=partner_company.id,
            status=GuestStatus.ACCEPTED,
            expires_at=expires,
            extended_count=1,
            last_extended_at=now,
            revoked_at=None,
            revoked_by=None,
            revocation_reason=None,
        )

        test_db.add(guest)
        test_db.commit()

        # Verify fields are set correctly
        assert guest.expires_at == expires
        assert guest.extended_count == 1
        assert guest.last_extended_at == now
        assert guest.revoked_at is None
        assert guest.revoked_by is None
        assert guest.revocation_reason is None

    def test_guest_status_enum_includes_purged(self):
        """Test that GuestStatus enum includes PURGED value."""
        assert GuestStatus.PURGED == "purged"
        assert "purged" in [s.value for s in GuestStatus]

    def test_guest_extension_creation(self, test_db, partner_company):
        """Test creating a guest extension record."""
        guest = GuestUser(
            email="guest@example.com",
            partner_company_id=partner_company.id,
            expires_at=datetime.utcnow() + timedelta(days=90),
        )
        test_db.add(guest)
        test_db.commit()

        old_expiry = guest.expires_at
        new_expiry = old_expiry + timedelta(days=90)

        extension = GuestExtension(
            guest_user_id=guest.id,
            extended_by="admin@company.com",
            extended_at=datetime.utcnow(),
            previous_expiry_date=old_expiry,
            new_expiry_date=new_expiry,
            justification="Project extended for 3 more months",
        )

        test_db.add(extension)
        test_db.commit()

        # Verify extension is created
        assert extension.id is not None
        assert extension.guest_user_id == guest.id
        assert extension.justification == "Project extended for 3 more months"
        assert extension.new_expiry_date == new_expiry

    def test_guest_lifecycle_policy_creation(self, test_db, partner_company):
        """Test creating a lifecycle policy for a partner."""
        policy = GuestLifecyclePolicy(
            partner_company_id=partner_company.id,
            default_expiry_days=60,
            max_extensions=2,
            extension_period_days=30,
            auto_expire_enabled=True,
        )

        test_db.add(policy)
        test_db.commit()

        # Verify policy is created
        assert policy.id is not None
        assert policy.partner_company_id == partner_company.id
        assert policy.default_expiry_days == 60
        assert policy.max_extensions == 2
        assert policy.extension_period_days == 30
        assert policy.auto_expire_enabled is True

    def test_guest_revocation_fields(self, test_db, partner_company):
        """Test setting revocation fields on a guest user."""
        guest = GuestUser(
            email="guest@example.com",
            partner_company_id=partner_company.id,
            status=GuestStatus.ACCEPTED,
        )
        test_db.add(guest)
        test_db.commit()

        # Revoke the guest
        revoke_time = datetime.utcnow()
        guest.status = GuestStatus.REVOKED
        guest.revoked_at = revoke_time
        guest.revoked_by = "admin@company.com"
        guest.revocation_reason = "Contract ended"
        test_db.commit()

        # Verify revocation fields
        assert guest.status == GuestStatus.REVOKED
        assert guest.revoked_at == revoke_time
        assert guest.revoked_by == "admin@company.com"
        assert guest.revocation_reason == "Contract ended"

    def test_guest_extension_relationship(self, test_db, partner_company):
        """Test the relationship between GuestUser and GuestExtension."""
        guest = GuestUser(
            email="guest@example.com",
            partner_company_id=partner_company.id,
            expires_at=datetime.utcnow() + timedelta(days=90),
        )
        test_db.add(guest)
        test_db.commit()

        # Add multiple extensions
        for i in range(3):
            extension = GuestExtension(
                guest_user_id=guest.id,
                extended_by=f"admin{i}@company.com",
                extended_at=datetime.utcnow() + timedelta(days=i),
                previous_expiry_date=datetime.utcnow() + timedelta(days=90 * i),
                new_expiry_date=datetime.utcnow() + timedelta(days=90 * (i + 1)),
                justification=f"Extension {i + 1}",
            )
            test_db.add(extension)

        test_db.commit()

        # Verify relationship works
        extensions = test_db.query(GuestExtension).filter_by(guest_user_id=guest.id).all()
        assert len(extensions) == 3
        assert all(ext.guest_user_id == guest.id for ext in extensions)
