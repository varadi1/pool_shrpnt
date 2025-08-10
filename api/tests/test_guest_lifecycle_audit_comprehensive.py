"""
Comprehensive tests for audit event generation in guest lifecycle.
Tests all lifecycle events: GUEST_REVOKED, GUEST_EXPIRED, GUEST_EXTENDED, GUEST_PURGED.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from freezegun import freeze_time
from sqlalchemy import select
import json

from api.models.guest import GuestUser, GuestStatus, GuestExtension
from api.models.audit import AuditLog
from api.services.guests.guest_service import GuestService
from api.services.guests.lifecycle_service import GuestLifecycleService
from api.services.audit import AuditService, AuditEventType


@pytest.fixture
def audit_service(db_session):
    """Create real AuditService instance."""
    service = AuditService()
    service.db_session = db_session
    return service


@pytest.fixture
def guest_service(audit_service):
    """Create GuestService with real audit service."""
    service = GuestService()
    service.audit_service = audit_service
    service.graph_client = AsyncMock()
    service.notification_service = AsyncMock()
    return service


@pytest.fixture
def lifecycle_service(audit_service):
    """Create LifecycleService with real audit service."""
    service = GuestLifecycleService()
    service.audit_service = audit_service
    service.guest_service = AsyncMock()
    service.notification_service = AsyncMock()
    return service


@pytest.fixture
async def test_guest(db_session: AsyncSession):
    """Create a test guest for audit testing."""
    guest = GuestUser(
        id=uuid4(),
        email="audit@test.com",
        display_name="Audit Test Guest",
        partner_company_id=uuid4(),
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        invited_by=uuid4(),
        invited_at=datetime.utcnow() - timedelta(days=30),
        accepted_at=datetime.utcnow() - timedelta(days=29),
        expires_at=datetime.utcnow() + timedelta(days=60),
    )
    db_session.add(guest)
    await db_session.commit()
    await db_session.refresh(guest)
    return guest


class TestLifecycleAuditEvents:
    """Test audit event generation for all lifecycle events."""

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 10:00:00")
    async def test_guest_revoked_audit_event(
        self, guest_service, audit_service, db_session, test_guest
    ):
        """Test GUEST_REVOKED audit event generation."""
        revoked_by = uuid4()
        reason = "Contract terminated"
        correlation_id = str(uuid4())

        # Perform revocation
        await guest_service.revoke_guest(
            db_session, test_guest.id, revoked_by, reason, correlation_id=correlation_id
        )

        # Query audit log
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_REVOKED, AuditLog.entity_id == test_guest.id
        )
        audit_event = await db_session.scalar(query)

        # Verify audit event details
        assert audit_event is not None
        assert audit_event.actor_id == revoked_by
        assert audit_event.entity_type == "GuestUser"
        assert audit_event.correlation_id == correlation_id
        assert audit_event.timestamp == datetime(2025, 3, 1, 10, 0, 0)

        # Verify event details
        details = json.loads(audit_event.details)
        assert details["guest_id"] == str(test_guest.id)
        assert details["guest_email"] == test_guest.email
        assert details["partner_company_id"] == str(test_guest.partner_company_id)
        assert details["reason"] == reason
        assert details["revoked_by"] == str(revoked_by)
        assert "revocation_timestamp" in details

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 10:00:00")
    async def test_guest_expired_audit_event(
        self, lifecycle_service, audit_service, db_session, test_guest
    ):
        """Test GUEST_EXPIRED audit event generation."""
        # Set guest as expired
        test_guest.expires_at = datetime.utcnow() - timedelta(days=1)
        await db_session.commit()

        # Mock guest service
        lifecycle_service.guest_service.revoke_guest.return_value = test_guest

        # Expire the guest
        await lifecycle_service.expire_guest(db_session, test_guest.id, actor_id="System")

        # Query audit log
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_EXPIRED, AuditLog.entity_id == test_guest.id
        )
        audit_event = await db_session.scalar(query)

        # Verify audit event
        assert audit_event is not None
        assert audit_event.actor_id == "System"
        assert audit_event.entity_type == "GuestUser"

        # Verify event details
        details = json.loads(audit_event.details)
        assert details["guest_id"] == str(test_guest.id)
        assert details["guest_email"] == test_guest.email
        assert details["expiry_date"] == test_guest.expires_at.isoformat()
        assert details["days_past_expiry"] == 1
        assert details["auto_expired"] is True

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 10:00:00")
    async def test_guest_extended_audit_event(
        self, lifecycle_service, audit_service, db_session, test_guest
    ):
        """Test GUEST_EXTENDED audit event generation."""
        extended_by = uuid4()
        original_expiry = test_guest.expires_at
        new_expiry = original_expiry + timedelta(days=30)
        justification = "Project timeline extended for additional requirements"

        # Perform extension
        await lifecycle_service.extend_guest(
            db_session, test_guest.id, extended_by, new_expiry, justification
        )

        # Query audit log
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_EXTENDED,
            AuditLog.entity_id == test_guest.id,
        )
        audit_event = await db_session.scalar(query)

        # Verify audit event
        assert audit_event is not None
        assert audit_event.actor_id == extended_by
        assert audit_event.entity_type == "GuestUser"

        # Verify event details
        details = json.loads(audit_event.details)
        assert details["guest_id"] == str(test_guest.id)
        assert details["guest_email"] == test_guest.email
        assert details["partner_company_id"] == str(test_guest.partner_company_id)
        assert details["previous_expiry"] == original_expiry.isoformat()
        assert details["new_expiry"] == new_expiry.isoformat()
        assert details["extension_days"] == 30
        assert details["justification"] == justification
        assert details["extension_count"] == 1

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 10:00:00")
    async def test_guest_purged_audit_event(
        self, guest_service, audit_service, db_session, test_guest
    ):
        """Test GUEST_PURGED audit event generation."""
        # Set guest as revoked 35 days ago
        test_guest.status = GuestStatus.REVOKED
        test_guest.revoked_at = datetime.utcnow() - timedelta(days=35)
        test_guest.revoked_by = uuid4()
        await db_session.commit()

        original_azure_ad_id = test_guest.azure_ad_id

        # Perform purge
        await guest_service.purge_revoked_guest(db_session, test_guest.id)

        # Query audit log
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_PURGED, AuditLog.entity_id == test_guest.id
        )
        audit_event = await db_session.scalar(query)

        # Verify audit event
        assert audit_event is not None
        assert audit_event.actor_id == "System"
        assert audit_event.entity_type == "GuestUser"

        # Verify event details
        details = json.loads(audit_event.details)
        assert details["guest_id"] == str(test_guest.id)
        assert details["guest_email"] == test_guest.email
        assert details["partner_company_id"] == str(test_guest.partner_company_id)
        assert details["azure_ad_id"] == original_azure_ad_id
        assert details["days_after_revocation"] == 35
        assert details["purge_timestamp"] == datetime(2025, 3, 1, 10, 0, 0).isoformat()

    @pytest.mark.asyncio
    async def test_bulk_revocation_audit_correlation(
        self, guest_service, audit_service, db_session
    ):
        """Test correlation ID for bulk operations."""
        # Create multiple guests
        guests = []
        for i in range(5):
            guest = GuestUser(
                id=uuid4(),
                email=f"bulk{i}@test.com",
                display_name=f"Bulk Guest {i}",
                partner_company_id=uuid4(),
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
            )
            guests.append(guest)
            db_session.add(guest)

        await db_session.commit()

        # Perform bulk revocation
        correlation_id = str(uuid4())
        revoked_by = uuid4()

        for guest in guests:
            await guest_service.revoke_guest(
                db_session,
                guest.id,
                revoked_by,
                "Bulk revocation test",
                correlation_id=correlation_id,
            )

        # Query all audit events
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_REVOKED,
            AuditLog.correlation_id == correlation_id,
        )
        audit_events = await db_session.scalars(query)
        audit_list = list(audit_events)

        # All should have same correlation ID
        assert len(audit_list) == 5
        for event in audit_list:
            assert event.correlation_id == correlation_id
            assert event.actor_id == revoked_by

    @pytest.mark.asyncio
    async def test_audit_event_immutability(
        self, guest_service, audit_service, db_session, test_guest
    ):
        """Test that audit events are immutable."""
        # Create audit event
        await guest_service.revoke_guest(db_session, test_guest.id, uuid4(), "Test immutability")

        # Get audit event
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_REVOKED, AuditLog.entity_id == test_guest.id
        )
        audit_event = await db_session.scalar(query)
        original_details = audit_event.details

        # Attempt to modify (should fail or not persist)
        audit_event.details = '{"modified": true}'

        with pytest.raises(Exception):
            await db_session.commit()

        # Rollback and verify unchanged
        await db_session.rollback()
        await db_session.refresh(audit_event)
        assert audit_event.details == original_details

    @pytest.mark.asyncio
    async def test_audit_event_comprehensive_context(
        self, lifecycle_service, audit_service, db_session, test_guest
    ):
        """Test that audit events capture comprehensive context."""
        extended_by = uuid4()
        admin_email = "admin@company.com"
        client_ip = "192.168.1.100"
        user_agent = "Mozilla/5.0"

        # Mock request context
        with patch("api.services.audit.get_request_context") as mock_context:
            mock_context.return_value = {
                "ip_address": client_ip,
                "user_agent": user_agent,
                "session_id": str(uuid4()),
                "request_id": str(uuid4()),
            }

            # Perform extension with context
            await lifecycle_service.extend_guest(
                db_session,
                test_guest.id,
                extended_by,
                test_guest.expires_at + timedelta(days=30),
                "Extension with full context",
            )

        # Query audit event
        query = select(AuditLog).where(
            AuditLog.event_type == AuditEventType.GUEST_EXTENDED,
            AuditLog.entity_id == test_guest.id,
        )
        audit_event = await db_session.scalar(query)

        # Verify comprehensive context
        details = json.loads(audit_event.details)
        assert details["ip_address"] == client_ip
        assert details["user_agent"] == user_agent
        assert "session_id" in details
        assert "request_id" in details

    @pytest.mark.asyncio
    async def test_audit_event_search_and_filter(self, guest_service, audit_service, db_session):
        """Test searching and filtering audit events."""
        partner_id = uuid4()
        actor_id = uuid4()

        # Create events for different guests
        for i in range(10):
            guest = GuestUser(
                id=uuid4(),
                email=f"search{i}@test.com",
                display_name=f"Search Guest {i}",
                partner_company_id=partner_id if i < 5 else uuid4(),
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
            )
            db_session.add(guest)
            await db_session.commit()

            # Create different event types
            if i % 2 == 0:
                await guest_service.revoke_guest(db_session, guest.id, actor_id, "Search test")
            else:
                guest.status = GuestStatus.EXPIRED
                await db_session.commit()
                lifecycle_service.guest_service.revoke_guest.return_value = guest
                await lifecycle_service.expire_guest(db_session, guest.id, "System")

        # Search by event type
        revoked_query = select(AuditLog).where(AuditLog.event_type == AuditEventType.GUEST_REVOKED)
        revoked_events = await db_session.scalars(revoked_query)
        assert len(list(revoked_events)) == 5

        # Search by actor
        actor_query = select(AuditLog).where(AuditLog.actor_id == actor_id)
        actor_events = await db_session.scalars(actor_query)
        assert len(list(actor_events)) == 5

        # Search by date range
        date_query = select(AuditLog).where(
            AuditLog.timestamp >= datetime.utcnow() - timedelta(hours=1)
        )
        recent_events = await db_session.scalars(date_query)
        assert len(list(recent_events)) >= 10

    @pytest.mark.asyncio
    async def test_audit_event_retention(self, audit_service, db_session):
        """Test audit event retention policies."""
        # Create old audit events
        retention_days = 365  # 1 year retention

        # Create events at different ages
        events = []
        for days_ago in [30, 180, 365, 400]:
            event = AuditLog(
                id=uuid4(),
                event_type=AuditEventType.GUEST_REVOKED,
                actor_id=uuid4(),
                entity_type="GuestUser",
                entity_id=uuid4(),
                timestamp=datetime.utcnow() - timedelta(days=days_ago),
                details=json.dumps({"test": f"event_{days_ago}_days_old"}),
            )
            events.append(event)
            db_session.add(event)

        await db_session.commit()

        # Apply retention policy (keep only last year)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        # Count events within retention
        retention_query = select(AuditLog).where(AuditLog.timestamp >= cutoff_date)
        retained = await db_session.scalars(retention_query)
        retained_list = list(retained)

        # Should keep events within retention period
        assert len([e for e in events if e.timestamp >= cutoff_date]) == len(retained_list)

    @pytest.mark.asyncio
    async def test_audit_event_performance(self, guest_service, audit_service, db_session):
        """Test audit event generation performance."""
        # Create many guests
        guests = []
        for i in range(100):
            guest = GuestUser(
                id=uuid4(),
                email=f"perf{i}@test.com",
                display_name=f"Perf Guest {i}",
                partner_company_id=uuid4(),
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
            )
            guests.append(guest)
            db_session.add(guest)

        await db_session.commit()

        # Measure audit generation time
        start_time = datetime.utcnow()

        for guest in guests:
            await audit_service.log_event(
                db_session,
                event_type=AuditEventType.GUEST_REVOKED,
                actor_id=uuid4(),
                entity_type="GuestUser",
                entity_id=guest.id,
                details={"reason": "Performance test"},
            )

        await db_session.commit()
        elapsed = (datetime.utcnow() - start_time).total_seconds()

        # Should complete quickly
        assert elapsed < 10, f"Audit generation took {elapsed}s for 100 events"

        # Verify all events created
        query = select(AuditLog).where(AuditLog.details.like("%Performance test%"))
        events = await db_session.scalars(query)
        assert len(list(events)) == 100
