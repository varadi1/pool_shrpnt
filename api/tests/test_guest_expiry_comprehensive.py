"""
Comprehensive tests for automatic guest expiry after configured period.
Tests expiry detection, enforcement, and policy-based configuration.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from freezegun import freeze_time
from sqlalchemy import select

from api.models.guest import GuestUser, GuestStatus, GuestLifecyclePolicy, GuestExtension
from api.services.guests.lifecycle_service import GuestLifecycleService
from api.services.audit import AuditEventType
from scheduler.tasks.guest_lifecycle_checker import GuestLifecycleCheckerTask


@pytest.fixture
def lifecycle_service():
    """Create GuestLifecycleService instance with mocked dependencies."""
    service = GuestLifecycleService()
    service.guest_service = AsyncMock()
    service.notification_service = AsyncMock()
    service.audit_service = AsyncMock()
    return service


@pytest.fixture
async def guest_policy(db_session: AsyncSession):
    """Create a test lifecycle policy."""
    policy = GuestLifecyclePolicy(
        id=uuid4(),
        partner_company_id=uuid4(),
        default_expiry_days=90,
        max_extensions=2,
        extension_period_days=30,
        auto_expire_enabled=True,
        grace_period_days=7,
    )
    db_session.add(policy)
    await db_session.commit()
    await db_session.refresh(policy)
    return policy


@pytest.fixture
async def expiring_guests(db_session: AsyncSession, guest_policy):
    """Create guests at various stages of expiry."""
    guests = []
    base_time = datetime.utcnow()

    # Guest expiring in 10 days
    guest1 = GuestUser(
        id=uuid4(),
        email="guest1@partner.com",
        display_name="Guest 1",
        partner_company_id=guest_policy.partner_company_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=base_time + timedelta(days=10),
        invited_at=base_time - timedelta(days=80),
        accepted_at=base_time - timedelta(days=79),
    )
    guests.append(guest1)

    # Guest expiring in 7 days (notification threshold)
    guest2 = GuestUser(
        id=uuid4(),
        email="guest2@partner.com",
        display_name="Guest 2",
        partner_company_id=guest_policy.partner_company_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=base_time + timedelta(days=7),
        invited_at=base_time - timedelta(days=83),
        accepted_at=base_time - timedelta(days=82),
    )
    guests.append(guest2)

    # Guest expiring today
    guest3 = GuestUser(
        id=uuid4(),
        email="guest3@partner.com",
        display_name="Guest 3",
        partner_company_id=guest_policy.partner_company_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=base_time,
        invited_at=base_time - timedelta(days=90),
        accepted_at=base_time - timedelta(days=89),
    )
    guests.append(guest3)

    # Guest already expired (3 days ago)
    guest4 = GuestUser(
        id=uuid4(),
        email="guest4@partner.com",
        display_name="Guest 4",
        partner_company_id=guest_policy.partner_company_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=base_time - timedelta(days=3),
        invited_at=base_time - timedelta(days=93),
        accepted_at=base_time - timedelta(days=92),
    )
    guests.append(guest4)

    # Guest with no expiry (permanent)
    guest5 = GuestUser(
        id=uuid4(),
        email="guest5@partner.com",
        display_name="Guest 5",
        partner_company_id=guest_policy.partner_company_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=None,
        invited_at=base_time - timedelta(days=100),
        accepted_at=base_time - timedelta(days=99),
    )
    guests.append(guest5)

    for guest in guests:
        db_session.add(guest)

    await db_session.commit()
    return guests


class TestAutomaticExpiry:
    """Test automatic expiry after configured period."""

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 00:00:00")
    async def test_detect_expired_guests(self, lifecycle_service, db_session, expiring_guests):
        """Test detection of expired guests."""
        # Find expired guests
        expired = await lifecycle_service.find_expired_guests(db_session)

        # Should find guests 3 and 4 (expiring today and already expired)
        assert len(expired) == 2
        expired_emails = {g.email for g in expired}
        assert "guest3@partner.com" in expired_emails
        assert "guest4@partner.com" in expired_emails

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 00:00:00")
    async def test_automatic_expiry_enforcement(
        self, lifecycle_service, db_session, expiring_guests, guest_policy
    ):
        """Test automatic expiry enforcement based on policy."""
        # Process expired guests
        expired = await lifecycle_service.find_expired_guests(db_session)

        for guest in expired:
            # Mock revocation
            lifecycle_service.guest_service.revoke_guest.return_value = guest

            # Enforce expiry
            result = await lifecycle_service.expire_guest(db_session, guest.id, "System")

            # Verify status change
            assert result.status == GuestStatus.EXPIRED
            assert result.expired_at is not None

            # Verify audit event
            lifecycle_service.audit_service.log_event.assert_called()
            audit_call = lifecycle_service.audit_service.log_event.call_args
            assert audit_call[1]["event_type"] == AuditEventType.GUEST_EXPIRED

    @pytest.mark.asyncio
    async def test_expiry_after_90_days_default(self, lifecycle_service, db_session, guest_policy):
        """Test that guests expire after default 90 days."""
        # Create guest with calculated expiry
        with freeze_time("2025-01-01 00:00:00") as frozen_time:
            guest = GuestUser(
                id=uuid4(),
                email="test@partner.com",
                display_name="Test Guest",
                partner_company_id=guest_policy.partner_company_id,
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
                invited_at=datetime.utcnow(),
                accepted_at=datetime.utcnow(),
            )

            # Apply policy expiry
            guest.expires_at = await lifecycle_service.calculate_expiry_date(
                db_session, guest_policy.partner_company_id
            )
            db_session.add(guest)
            await db_session.commit()

            # Verify 90 days expiry
            assert guest.expires_at == datetime(2025, 4, 1, 0, 0, 0)

            # Move forward 89 days - should not be expired
            frozen_time.move_to("2025-03-31 00:00:00")
            expired = await lifecycle_service.find_expired_guests(db_session)
            assert guest.id not in [g.id for g in expired]

            # Move forward to day 90 - should be expired
            frozen_time.move_to("2025-04-01 00:00:00")
            expired = await lifecycle_service.find_expired_guests(db_session)
            assert guest.id in [g.id for g in expired]

    @pytest.mark.asyncio
    async def test_custom_expiry_periods(self, lifecycle_service, db_session):
        """Test different expiry periods for different partners."""
        # Create policies with different expiry periods
        policy_30 = GuestLifecyclePolicy(
            id=uuid4(), partner_company_id=uuid4(), default_expiry_days=30, auto_expire_enabled=True
        )

        policy_180 = GuestLifecyclePolicy(
            id=uuid4(),
            partner_company_id=uuid4(),
            default_expiry_days=180,
            auto_expire_enabled=True,
        )

        db_session.add_all([policy_30, policy_180])
        await db_session.commit()

        with freeze_time("2025-01-01") as frozen_time:
            # Calculate expiry for each policy
            expiry_30 = await lifecycle_service.calculate_expiry_date(
                db_session, policy_30.partner_company_id
            )
            expiry_180 = await lifecycle_service.calculate_expiry_date(
                db_session, policy_180.partner_company_id
            )

            assert expiry_30 == datetime(2025, 1, 31, 0, 0, 0)
            assert expiry_180 == datetime(2025, 6, 30, 0, 0, 0)

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 00:00:00")
    async def test_expiry_respects_grace_period(self, lifecycle_service, db_session, guest_policy):
        """Test that grace period delays actual expiry enforcement."""
        # Create guest in grace period
        guest = GuestUser(
            id=uuid4(),
            email="grace@partner.com",
            display_name="Grace Guest",
            partner_company_id=guest_policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.ACTIVE,
            expires_at=datetime.utcnow() - timedelta(days=3),  # Expired 3 days ago
            grace_period_ends=datetime.utcnow() + timedelta(days=4),  # 4 days left
        )
        db_session.add(guest)
        await db_session.commit()

        # Should not enforce expiry yet (in grace period)
        result = await lifecycle_service.should_enforce_expiry(db_session, guest.id)
        assert result is False

        # Move past grace period
        with freeze_time("2025-03-05 00:00:00"):
            result = await lifecycle_service.should_enforce_expiry(db_session, guest.id)
            assert result is True

    @pytest.mark.asyncio
    async def test_scheduler_task_daily_execution(self, db_session, expiring_guests, guest_policy):
        """Test that scheduler task runs daily and processes expired guests."""
        task = GuestLifecycleCheckerTask()
        task.lifecycle_service = AsyncMock()
        task.notification_service = AsyncMock()

        # Mock expired guests
        task.lifecycle_service.find_expired_guests.return_value = [
            g for g in expiring_guests if g.expires_at and g.expires_at < datetime.utcnow()
        ]

        # Run task
        with freeze_time("2025-03-01 02:00:00"):  # Run at 2 AM
            await task.run(db_session)

        # Verify expired guests were processed
        assert task.lifecycle_service.expire_guest.call_count == 2

        # Verify notifications scheduled for guests expiring in 7 days
        assert task.notification_service.queue_notification.called

    @pytest.mark.asyncio
    async def test_expiry_disabled_by_policy(self, lifecycle_service, db_session):
        """Test that auto-expiry can be disabled by policy."""
        # Create policy with auto-expire disabled
        policy = GuestLifecyclePolicy(
            id=uuid4(),
            partner_company_id=uuid4(),
            default_expiry_days=90,
            auto_expire_enabled=False,  # Disabled
        )
        db_session.add(policy)

        # Create expired guest
        guest = GuestUser(
            id=uuid4(),
            email="no-expire@partner.com",
            display_name="No Expire",
            partner_company_id=policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.ACTIVE,
            expires_at=datetime.utcnow() - timedelta(days=10),
        )
        db_session.add(guest)
        await db_session.commit()

        # Should not be processed for auto-expiry
        should_expire = await lifecycle_service.should_auto_expire(db_session, guest.id)
        assert should_expire is False

    @pytest.mark.asyncio
    async def test_expiry_with_extensions(self, lifecycle_service, db_session, guest_policy):
        """Test that extensions affect expiry calculation."""
        original_expiry = datetime.utcnow() + timedelta(days=30)

        guest = GuestUser(
            id=uuid4(),
            email="extended@partner.com",
            display_name="Extended Guest",
            partner_company_id=guest_policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.ACTIVE,
            expires_at=original_expiry,
            extended_count=1,
            last_extended_at=datetime.utcnow(),
        )
        db_session.add(guest)

        # Add extension record
        extension = GuestExtension(
            id=uuid4(),
            guest_user_id=guest.id,
            extended_by=uuid4(),
            extended_at=datetime.utcnow(),
            previous_expiry_date=original_expiry,
            new_expiry_date=original_expiry + timedelta(days=30),
            justification="Project extended",
        )
        db_session.add(extension)
        await db_session.commit()

        # Update guest expiry
        guest.expires_at = extension.new_expiry_date
        await db_session.commit()

        # Should not be expired at original date
        with freeze_time(original_expiry + timedelta(days=1)):
            expired = await lifecycle_service.find_expired_guests(db_session)
            assert guest.id not in [g.id for g in expired]

        # Should be expired at extended date
        with freeze_time(extension.new_expiry_date + timedelta(days=1)):
            expired = await lifecycle_service.find_expired_guests(db_session)
            assert guest.id in [g.id for g in expired]

    @pytest.mark.asyncio
    async def test_expiry_preserves_data(self, lifecycle_service, db_session, guest_policy):
        """Test that expiry preserves guest data (soft delete)."""
        guest = GuestUser(
            id=uuid4(),
            email="preserve@partner.com",
            display_name="Preserve Guest",
            partner_company_id=guest_policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.ACTIVE,
            expires_at=datetime.utcnow() - timedelta(days=1),
            metadata={"original": "data"},
        )
        db_session.add(guest)
        await db_session.commit()

        original_id = guest.id
        original_email = guest.email
        original_metadata = guest.metadata

        # Expire the guest
        lifecycle_service.guest_service.revoke_guest.return_value = guest
        guest.status = GuestStatus.EXPIRED
        result = await lifecycle_service.expire_guest(db_session, guest.id, "System")

        # Verify data preserved
        await db_session.refresh(guest)
        assert guest.id == original_id
        assert guest.email == original_email
        assert guest.metadata == original_metadata
        assert guest.status == GuestStatus.EXPIRED

        # Guest should still be in database
        query = select(GuestUser).where(GuestUser.id == original_id)
        db_guest = await db_session.scalar(query)
        assert db_guest is not None
