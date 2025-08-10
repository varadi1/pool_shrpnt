"""
Comprehensive tests for Azure AD guest purge after 30 days.
Tests purge detection, execution, and data retention policies.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from freezegun import freeze_time
from sqlalchemy import select

from api.models.guest import GuestUser, GuestStatus, GuestGroupAssignment
from api.services.guests.guest_service import GuestService
from api.services.audit import AuditEventType
from scheduler.tasks.guest_lifecycle_checker import GuestLifecycleCheckerTask
from api.core.exceptions import GraphAPIException


@pytest.fixture
def guest_service():
    """Create GuestService instance with mocked dependencies."""
    service = GuestService()
    service.graph_client = AsyncMock()
    service.audit_service = AsyncMock()
    service.notification_service = AsyncMock()
    return service


@pytest.fixture
async def purgeable_guests(db_session: AsyncSession):
    """Create guests at various stages of purge eligibility."""
    guests = {}
    base_time = datetime.utcnow()

    # Guest revoked 35 days ago (eligible for purge)
    guests["eligible"] = GuestUser(
        id=uuid4(),
        email="eligible@partner.com",
        display_name="Eligible for Purge",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.REVOKED,
        revoked_at=base_time - timedelta(days=35),
        revoked_by=uuid4(),
        revocation_reason="Contract ended",
    )

    # Guest revoked exactly 30 days ago (boundary case)
    guests["boundary"] = GuestUser(
        id=uuid4(),
        email="boundary@partner.com",
        display_name="Boundary Case",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.REVOKED,
        revoked_at=base_time - timedelta(days=30),
        revoked_by=uuid4(),
        revocation_reason="Access no longer needed",
    )

    # Guest revoked 25 days ago (not yet eligible)
    guests["not_eligible"] = GuestUser(
        id=uuid4(),
        email="not_eligible@partner.com",
        display_name="Not Eligible",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.REVOKED,
        revoked_at=base_time - timedelta(days=25),
        revoked_by=uuid4(),
        revocation_reason="Security review",
    )

    # Guest expired 40 days ago (eligible)
    guests["expired_eligible"] = GuestUser(
        id=uuid4(),
        email="expired@partner.com",
        display_name="Expired Eligible",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.EXPIRED,
        expired_at=base_time - timedelta(days=40),
        expires_at=base_time - timedelta(days=40),
    )

    # Already purged guest
    guests["already_purged"] = GuestUser(
        id=uuid4(),
        email="purged@partner.com",
        display_name="Already Purged",
        partner_company_id=uuid4(),
        azure_ad_id=None,  # Azure AD ID removed after purge
        status=GuestStatus.PURGED,
        revoked_at=base_time - timedelta(days=60),
        purged_at=base_time - timedelta(days=30),
    )

    # Active guest (should never be purged)
    guests["active"] = GuestUser(
        id=uuid4(),
        email="active@partner.com",
        display_name="Active Guest",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        accepted_at=base_time - timedelta(days=10),
    )

    for guest in guests.values():
        db_session.add(guest)

    await db_session.commit()
    return guests


class TestAzureADPurge:
    """Test Azure AD purge after 30 days."""

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 00:00:00")
    async def test_identify_purgeable_guests(self, guest_service, db_session, purgeable_guests):
        """Test identification of guests eligible for purge."""
        # Find guests eligible for purge
        eligible = await guest_service.find_purgeable_guests(db_session, days_after_revocation=30)

        # Should find eligible and boundary case
        eligible_ids = {g.id for g in eligible}
        assert purgeable_guests["eligible"].id in eligible_ids
        assert purgeable_guests["boundary"].id in eligible_ids
        assert purgeable_guests["expired_eligible"].id in eligible_ids

        # Should not include these
        assert purgeable_guests["not_eligible"].id not in eligible_ids
        assert purgeable_guests["already_purged"].id not in eligible_ids
        assert purgeable_guests["active"].id not in eligible_ids

    @pytest.mark.asyncio
    async def test_purge_from_azure_ad(self, guest_service, db_session, purgeable_guests):
        """Test actual purge from Azure AD."""
        guest = purgeable_guests["eligible"]

        # Mock Graph API delete
        guest_service.graph_client.delete_guest_user.return_value = True

        # Perform purge
        result = await guest_service.purge_revoked_guest(db_session, guest.id)

        # Verify Graph API called
        guest_service.graph_client.delete_guest_user.assert_called_once_with(guest.azure_ad_id)

        # Verify database updates
        assert result.status == GuestStatus.PURGED
        assert result.purged_at is not None
        assert result.azure_ad_id is None  # Cleared after purge

        # Verify audit event
        guest_service.audit_service.log_event.assert_called()
        audit_call = guest_service.audit_service.log_event.call_args
        assert audit_call[1]["event_type"] == AuditEventType.GUEST_PURGED

    @pytest.mark.asyncio
    async def test_purge_preserves_database_record(
        self, guest_service, db_session, purgeable_guests
    ):
        """Test that purge preserves guest record in database."""
        guest = purgeable_guests["eligible"]
        original_id = guest.id
        original_email = guest.email
        original_revocation_reason = guest.revocation_reason

        # Mock Graph API
        guest_service.graph_client.delete_guest_user.return_value = True

        # Perform purge
        await guest_service.purge_revoked_guest(db_session, guest.id)

        # Verify record still exists
        query = select(GuestUser).where(GuestUser.id == original_id)
        db_guest = await db_session.scalar(query)

        assert db_guest is not None
        assert db_guest.email == original_email
        assert db_guest.revocation_reason == original_revocation_reason
        assert db_guest.status == GuestStatus.PURGED
        assert db_guest.azure_ad_id is None

    @pytest.mark.asyncio
    async def test_scheduler_daily_purge_task(self, db_session, purgeable_guests):
        """Test scheduler task for daily purge operations."""
        task = GuestLifecycleCheckerTask()
        task.guest_service = AsyncMock()

        with freeze_time("2025-03-01 03:00:00"):  # 3 AM daily run
            # Mock finding purgeable guests
            task.guest_service.find_purgeable_guests.return_value = [
                purgeable_guests["eligible"],
                purgeable_guests["boundary"],
                purgeable_guests["expired_eligible"],
            ]

            # Run purge task
            await task.run_purge_task(db_session)

            # Verify purge called for each eligible guest
            assert task.guest_service.purge_revoked_guest.call_count == 3

    @pytest.mark.asyncio
    async def test_purge_30_day_retention_policy(self, guest_service, db_session):
        """Test strict 30-day retention policy before purge."""
        # Create guests at various days after revocation
        test_cases = [
            (29, False),  # 29 days - not eligible
            (30, True),  # 30 days - eligible
            (31, True),  # 31 days - eligible
            (60, True),  # 60 days - eligible
            (90, True),  # 90 days - eligible
        ]

        for days_ago, should_be_eligible in test_cases:
            guest = GuestUser(
                id=uuid4(),
                email=f"test{days_ago}@partner.com",
                display_name=f"Test {days_ago} Days",
                partner_company_id=uuid4(),
                azure_ad_id=str(uuid4()),
                status=GuestStatus.REVOKED,
                revoked_at=datetime.utcnow() - timedelta(days=days_ago),
            )
            db_session.add(guest)

        await db_session.commit()

        # Find purgeable with 30-day policy
        eligible = await guest_service.find_purgeable_guests(db_session, days_after_revocation=30)

        eligible_emails = {g.email for g in eligible}

        for days_ago, should_be_eligible in test_cases:
            email = f"test{days_ago}@partner.com"
            if should_be_eligible:
                assert email in eligible_emails
            else:
                assert email not in eligible_emails

    @pytest.mark.asyncio
    async def test_purge_idempotency(self, guest_service, db_session, purgeable_guests):
        """Test that purge operations are idempotent."""
        guest = purgeable_guests["eligible"]

        # Mock Graph API
        guest_service.graph_client.delete_guest_user.return_value = True

        # First purge
        result1 = await guest_service.purge_revoked_guest(db_session, guest.id)
        assert result1.status == GuestStatus.PURGED

        # Second purge attempt (should be idempotent)
        result2 = await guest_service.purge_revoked_guest(db_session, guest.id)
        assert result2.status == GuestStatus.PURGED

        # Graph API should only be called once
        assert guest_service.graph_client.delete_guest_user.call_count == 1

    @pytest.mark.asyncio
    async def test_purge_with_graph_api_failure(self, guest_service, db_session, purgeable_guests):
        """Test handling of Graph API failures during purge."""
        guest = purgeable_guests["eligible"]

        # Mock Graph API failure
        guest_service.graph_client.delete_guest_user.side_effect = GraphAPIException(
            "User not found", status_code=404
        )

        # Attempt purge
        result = await guest_service.purge_revoked_guest(db_session, guest.id)

        # Should still mark as purged (user already gone from Azure AD)
        assert result.status == GuestStatus.PURGED
        assert result.purged_at is not None

        # Test different error (should not purge)
        guest2 = purgeable_guests["boundary"]
        guest_service.graph_client.delete_guest_user.side_effect = GraphAPIException(
            "Internal error", status_code=500
        )

        with pytest.raises(GraphAPIException):
            await guest_service.purge_revoked_guest(db_session, guest2.id)

        # Guest should not be marked as purged
        await db_session.refresh(guest2)
        assert guest2.status == GuestStatus.REVOKED

    @pytest.mark.asyncio
    async def test_purge_cleanup_related_data(self, guest_service, db_session):
        """Test that purge cleans up related data."""
        # Create guest with related data
        guest = GuestUser(
            id=uuid4(),
            email="cleanup@partner.com",
            display_name="Cleanup Test",
            partner_company_id=uuid4(),
            azure_ad_id=str(uuid4()),
            status=GuestStatus.REVOKED,
            revoked_at=datetime.utcnow() - timedelta(days=35),
        )

        # Add group assignments
        for i in range(3):
            assignment = GuestGroupAssignment(
                id=uuid4(),
                guest_user_id=guest.id,
                azure_group_id=str(uuid4()),
                group_name=f"Group{i}",
                assigned_at=datetime.utcnow() - timedelta(days=40),
                removed_at=datetime.utcnow() - timedelta(days=35),
            )
            db_session.add(assignment)

        db_session.add(guest)
        await db_session.commit()

        # Mock Graph API
        guest_service.graph_client.delete_guest_user.return_value = True

        # Perform purge
        await guest_service.purge_revoked_guest(db_session, guest.id)

        # Verify group assignments marked as purged
        query = select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest.id)
        assignments = await db_session.scalars(query)

        for assignment in assignments:
            assert assignment.purged_at is not None

    @pytest.mark.asyncio
    async def test_purge_batch_processing(self, guest_service, db_session):
        """Test batch processing of multiple purges."""
        # Create 50 purgeable guests
        guests = []
        for i in range(50):
            guest = GuestUser(
                id=uuid4(),
                email=f"batch{i}@partner.com",
                display_name=f"Batch Guest {i}",
                partner_company_id=uuid4(),
                azure_ad_id=str(uuid4()),
                status=GuestStatus.REVOKED,
                revoked_at=datetime.utcnow() - timedelta(days=35),
            )
            guests.append(guest)
            db_session.add(guest)

        await db_session.commit()

        # Mock Graph API
        guest_service.graph_client.delete_guest_user.return_value = True

        # Process batch purge
        start_time = datetime.utcnow()
        results = await guest_service.batch_purge_guests(
            db_session, [g.id for g in guests], batch_size=10
        )
        elapsed = (datetime.utcnow() - start_time).total_seconds()

        # Verify all purged
        assert results["succeeded"] == 50
        assert results["failed"] == 0

        # Should complete in reasonable time
        assert elapsed < 30, f"Batch purge took {elapsed}s for 50 guests"

    @pytest.mark.asyncio
    async def test_purge_audit_compliance(self, guest_service, db_session, purgeable_guests):
        """Test audit trail for compliance requirements."""
        guest = purgeable_guests["eligible"]

        # Mock Graph API
        guest_service.graph_client.delete_guest_user.return_value = True

        # Perform purge
        await guest_service.purge_revoked_guest(db_session, guest.id)

        # Verify comprehensive audit event
        guest_service.audit_service.log_event.assert_called()
        audit_call = guest_service.audit_service.log_event.call_args

        event_details = audit_call[1]["details"]
        assert event_details["guest_id"] == str(guest.id)
        assert event_details["guest_email"] == guest.email
        assert event_details["days_after_revocation"] == 35
        assert event_details["azure_ad_id"] == guest.azure_ad_id
        assert "purge_timestamp" in event_details

    @pytest.mark.asyncio
    async def test_purge_configuration(self, guest_service, db_session):
        """Test configurable purge retention periods."""
        # Test with different retention periods
        retention_configs = [
            (7, "aggressive"),  # 7 days
            (30, "standard"),  # 30 days (default)
            (90, "conservative"),  # 90 days
        ]

        for days, policy_name in retention_configs:
            # Create guest revoked exactly at retention boundary
            guest = GuestUser(
                id=uuid4(),
                email=f"{policy_name}@partner.com",
                display_name=f"{policy_name.title()} Policy",
                partner_company_id=uuid4(),
                azure_ad_id=str(uuid4()),
                status=GuestStatus.REVOKED,
                revoked_at=datetime.utcnow() - timedelta(days=days),
            )
            db_session.add(guest)

        await db_session.commit()

        # Test each retention policy
        for days, policy_name in retention_configs:
            eligible = await guest_service.find_purgeable_guests(
                db_session, days_after_revocation=days
            )

            eligible_emails = {g.email for g in eligible}

            # Should find guests at or beyond retention period
            for check_days, check_policy in retention_configs:
                email = f"{check_policy}@partner.com"
                if check_days <= days:
                    assert email in eligible_emails

    @pytest.mark.asyncio
    async def test_prevent_active_guest_purge(self, guest_service, db_session, purgeable_guests):
        """Test that active guests are never purged."""
        active_guest = purgeable_guests["active"]

        # Attempt to purge active guest (should fail)
        with pytest.raises(ValueError) as exc_info:
            await guest_service.purge_revoked_guest(db_session, active_guest.id)

        assert "cannot purge active guest" in str(exc_info.value).lower()

        # Verify guest unchanged
        await db_session.refresh(active_guest)
        assert active_guest.status == GuestStatus.ACTIVE
        assert active_guest.azure_ad_id is not None
