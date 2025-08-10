"""
Comprehensive tests for bulk guest revocation operations.
Tests mass revocation, partner-based revocation, and performance.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
from typing import List

from api.models.guest import GuestUser, GuestStatus, GuestGroupAssignment
from api.services.guests.guest_service import GuestService
from api.services.audit import AuditEventType
from api.core.exceptions import GraphAPIException, PartialFailureError


@pytest.fixture
def guest_service():
    """Create GuestService instance with mocked dependencies."""
    service = GuestService()
    service.graph_client = AsyncMock()
    service.audit_service = AsyncMock()
    service.notification_service = AsyncMock()
    return service


@pytest.fixture
async def partner_guests(db_session: AsyncSession) -> tuple[uuid4, List[GuestUser]]:
    """Create multiple guests from same partner company."""
    partner_id = uuid4()
    guests = []

    # Create 25 guests from same partner
    for i in range(25):
        guest = GuestUser(
            id=uuid4(),
            email=f"guest{i}@partner.com",
            display_name=f"Partner Guest {i}",
            partner_company_id=partner_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.ACTIVE,
            invited_at=datetime.utcnow() - timedelta(days=30),
            accepted_at=datetime.utcnow() - timedelta(days=29),
            expires_at=datetime.utcnow() + timedelta(days=60),
        )

        # Add group assignments for some guests
        if i % 3 == 0:  # Every third guest has groups
            for j in range(2):
                assignment = GuestGroupAssignment(
                    id=uuid4(),
                    guest_user_id=guest.id,
                    azure_group_id=str(uuid4()),
                    group_name=f"Group{j}",
                    assigned_at=datetime.utcnow(),
                )
                db_session.add(assignment)

        guests.append(guest)
        db_session.add(guest)

    await db_session.commit()
    return partner_id, guests


@pytest.fixture
async def mixed_partner_guests(db_session: AsyncSession) -> dict:
    """Create guests from multiple partner companies."""
    partners = {}

    for p in range(3):
        partner_id = uuid4()
        partners[partner_id] = []

        for i in range(10):
            guest = GuestUser(
                id=uuid4(),
                email=f"guest{i}@partner{p}.com",
                display_name=f"Guest {i} Partner {p}",
                partner_company_id=partner_id,
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
                invited_at=datetime.utcnow() - timedelta(days=20),
                accepted_at=datetime.utcnow() - timedelta(days=19),
            )
            partners[partner_id].append(guest)
            db_session.add(guest)

    await db_session.commit()
    return partners


class TestBulkRevocation:
    """Test bulk revocation operations."""

    @pytest.mark.asyncio
    async def test_bulk_revoke_multiple_guests(self, guest_service, db_session, partner_guests):
        """Test revoking multiple guests in single operation."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        reason = "Partner contract terminated"

        # Select first 10 guests for revocation
        guest_ids = [g.id for g in guests[:10]]

        # Mock Graph API responses
        guest_service.graph_client.remove_group_member.return_value = True

        # Perform bulk revocation
        results = await guest_service.bulk_revoke_guests(db_session, guest_ids, revoked_by, reason)

        # Verify all guests revoked
        assert len(results["succeeded"]) == 10
        assert len(results["failed"]) == 0

        # Check database status
        for guest_id in guest_ids:
            query = select(GuestUser).where(GuestUser.id == guest_id)
            guest = await db_session.scalar(query)
            assert guest.status == GuestStatus.REVOKED
            assert guest.revoked_by == revoked_by
            assert guest.revocation_reason == reason

    @pytest.mark.asyncio
    async def test_bulk_revoke_by_partner(self, guest_service, db_session, partner_guests):
        """Test revoking all guests from specific partner company."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        reason = "Partner security breach"

        # Mock Graph API
        guest_service.graph_client.remove_group_member.return_value = True

        # Get all guests from partner
        partner_guest_ids = await guest_service.list_guests_by_partner(db_session, partner_id)

        assert len(partner_guest_ids) == len(guests)

        # Bulk revoke all partner guests
        results = await guest_service.bulk_revoke_guests(
            db_session, partner_guest_ids, revoked_by, reason
        )

        # Verify all revoked
        assert len(results["succeeded"]) == len(guests)
        assert results["total"] == len(guests)

        # Verify no active guests remain for partner
        query = select(GuestUser).where(
            GuestUser.partner_company_id == partner_id, GuestUser.status == GuestStatus.ACTIVE
        )
        active_guests = await db_session.scalars(query)
        assert len(list(active_guests)) == 0

    @pytest.mark.asyncio
    async def test_bulk_revoke_performance(self, guest_service, db_session):
        """Test bulk revocation performance with 100+ guests."""
        # Create 100 guests
        partner_id = uuid4()
        guests = []

        for i in range(100):
            guest = GuestUser(
                id=uuid4(),
                email=f"perf{i}@test.com",
                display_name=f"Perf Guest {i}",
                partner_company_id=partner_id,
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
            )
            guests.append(guest)
            db_session.add(guest)

        await db_session.commit()

        guest_ids = [g.id for g in guests]
        revoked_by = uuid4()

        # Mock Graph API with minimal delay
        async def mock_remove(group_id, user_id):
            await asyncio.sleep(0.001)  # 1ms per operation
            return True

        guest_service.graph_client.remove_group_member = mock_remove

        # Measure performance
        start_time = datetime.utcnow()

        results = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "Performance test"
        )

        elapsed = (datetime.utcnow() - start_time).total_seconds()

        # Should complete within reasonable time (< 30 seconds for 100 guests)
        assert elapsed < 30, f"Bulk revocation took {elapsed}s for 100 guests"
        assert results["succeeded_count"] == 100

    @pytest.mark.asyncio
    async def test_bulk_revoke_with_partial_failures(
        self, guest_service, db_session, partner_guests
    ):
        """Test bulk revocation with some failures."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        guest_ids = [g.id for g in guests[:10]]

        # Mock mixed success/failure responses
        call_count = 0

        async def mock_graph_call(*args):
            nonlocal call_count
            call_count += 1
            if call_count in [3, 7]:  # Fail for 3rd and 7th guest
                raise GraphAPIException("User not found", status_code=404)
            return True

        guest_service.graph_client.remove_group_member = mock_graph_call
        guest_service.graph_client.delete_user = mock_graph_call

        # Perform bulk revocation
        results = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "Partial failure test"
        )

        # Should have both successes and failures
        assert len(results["succeeded"]) == 8
        assert len(results["failed"]) == 2
        assert results["total"] == 10

        # Failed guests should still be marked in DB but with error flag
        for failed_id in results["failed"]:
            query = select(GuestUser).where(GuestUser.id == failed_id["guest_id"])
            guest = await db_session.scalar(query)
            # Guest might be partially revoked (DB updated but Graph failed)
            assert guest.revocation_attempt_at is not None

    @pytest.mark.asyncio
    async def test_bulk_revoke_correlation_id(self, guest_service, db_session, partner_guests):
        """Test that bulk operations use consistent correlation ID."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        guest_ids = [g.id for g in guests[:5]]

        # Perform bulk revocation
        results = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "Correlation test"
        )

        # Check correlation ID in results
        assert "correlation_id" in results
        correlation_id = results["correlation_id"]
        assert correlation_id is not None

        # Verify all audit events use same correlation ID
        audit_calls = guest_service.audit_service.log_event.call_args_list
        for call in audit_calls:
            assert call[1]["correlation_id"] == correlation_id

    @pytest.mark.asyncio
    async def test_bulk_revoke_idempotency(self, guest_service, db_session, partner_guests):
        """Test that bulk revocation is idempotent."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        guest_ids = [g.id for g in guests[:5]]

        guest_service.graph_client.remove_group_member.return_value = True

        # First bulk revocation
        results1 = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "First bulk"
        )
        assert len(results1["succeeded"]) == 5

        # Second bulk revocation (should be idempotent)
        results2 = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "Second bulk"
        )

        # All should still succeed (idempotent)
        assert len(results2["succeeded"]) == 5
        assert results2["already_revoked_count"] == 5

    @pytest.mark.asyncio
    async def test_bulk_revoke_transaction_rollback(
        self, guest_service, db_session, partner_guests
    ):
        """Test transaction rollback on critical failure."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        guest_ids = [g.id for g in guests[:5]]

        # Mock critical failure during processing
        with patch.object(db_session, "commit", side_effect=Exception("DB Error")):
            with pytest.raises(Exception):
                await guest_service.bulk_revoke_guests(
                    db_session, guest_ids, revoked_by, "Rollback test"
                )

        # Verify no guests were revoked (rollback)
        for guest_id in guest_ids:
            query = select(GuestUser).where(GuestUser.id == guest_id)
            guest = await db_session.scalar(query)
            assert guest.status == GuestStatus.ACTIVE  # Still active
            assert guest.revoked_at is None

    @pytest.mark.asyncio
    async def test_bulk_revoke_with_filters(self, guest_service, db_session, mixed_partner_guests):
        """Test bulk revocation with various filters."""
        revoked_by = uuid4()

        # Revoke guests matching specific criteria
        # Example: All guests with email domain @partner1.com
        target_domain = "@partner1.com"

        query = select(GuestUser).where(
            GuestUser.email.like(f"%{target_domain}"), GuestUser.status == GuestStatus.ACTIVE
        )
        matching_guests = await db_session.scalars(query)
        guest_ids = [g.id for g in matching_guests]

        guest_service.graph_client.remove_group_member.return_value = True

        results = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, f"All {target_domain} users"
        )

        # Verify only matching guests revoked
        assert len(results["succeeded"]) == len(guest_ids)

        # Verify other partners unaffected
        other_query = select(GuestUser).where(
            ~GuestUser.email.like(f"%{target_domain}"), GuestUser.status == GuestStatus.ACTIVE
        )
        other_guests = await db_session.scalars(other_query)
        assert len(list(other_guests)) > 0  # Others still active

    @pytest.mark.asyncio
    async def test_bulk_revoke_progress_tracking(self, guest_service, db_session, partner_guests):
        """Test progress tracking during bulk revocation."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        guest_ids = [g.id for g in guests]

        progress_updates = []

        # Mock progress callback
        async def progress_callback(current, total, guest_id):
            progress_updates.append(
                {
                    "current": current,
                    "total": total,
                    "guest_id": guest_id,
                    "percentage": (current / total) * 100,
                }
            )

        guest_service.graph_client.remove_group_member.return_value = True

        # Perform bulk revocation with progress tracking
        results = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "Progress test", progress_callback=progress_callback
        )

        # Verify progress updates
        assert len(progress_updates) == len(guests)
        assert progress_updates[-1]["percentage"] == 100
        assert progress_updates[-1]["current"] == len(guests)

    @pytest.mark.asyncio
    async def test_bulk_revoke_notification_batching(
        self, guest_service, db_session, partner_guests
    ):
        """Test that bulk revocation batches notifications efficiently."""
        partner_id, guests = partner_guests
        revoked_by = uuid4()
        guest_ids = [g.id for g in guests[:20]]

        guest_service.graph_client.remove_group_member.return_value = True

        # Perform bulk revocation
        results = await guest_service.bulk_revoke_guests(
            db_session, guest_ids, revoked_by, "Notification batch test"
        )

        # Should create batched notification instead of individual ones
        notification_calls = (
            guest_service.notification_service.queue_bulk_notification.call_args_list
        )

        # Should use bulk notification
        assert len(notification_calls) == 1
        bulk_call = notification_calls[0]
        assert bulk_call[1]["template"] == "bulk_guests_revoked"
        assert bulk_call[1]["context"]["count"] == 20
        assert bulk_call[1]["context"]["reason"] == "Notification batch test"

    @pytest.mark.asyncio
    async def test_bulk_revoke_concurrent_safety(self, guest_service, db_session, partner_guests):
        """Test concurrent bulk revocation operations."""
        partner_id, guests = partner_guests

        # Split guests into two groups
        group1_ids = [g.id for g in guests[:10]]
        group2_ids = [g.id for g in guests[10:20]]

        admin1 = uuid4()
        admin2 = uuid4()

        guest_service.graph_client.remove_group_member.return_value = True

        # Run concurrent bulk revocations
        async def bulk1():
            return await guest_service.bulk_revoke_guests(
                db_session, group1_ids, admin1, "Concurrent group 1"
            )

        async def bulk2():
            return await guest_service.bulk_revoke_guests(
                db_session, group2_ids, admin2, "Concurrent group 2"
            )

        results = await asyncio.gather(bulk1(), bulk2())

        # Both should succeed without conflicts
        assert results[0]["succeeded_count"] == 10
        assert results[1]["succeeded_count"] == 10

        # Verify different correlation IDs
        assert results[0]["correlation_id"] != results[1]["correlation_id"]
