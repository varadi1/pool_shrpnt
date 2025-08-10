"""
Comprehensive tests for guest lifecycle notification scheduling.
Tests expiry warnings, revocation notices, and extension confirmations.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from freezegun import freeze_time
from sqlalchemy import select

from api.models.guest import GuestUser, GuestStatus, GuestLifecyclePolicy
from api.services.notifications.guest_notification_service import GuestNotificationService
from api.services.notifications.guest_notification_templates import (
    GuestNotificationTemplates,
    NotificationLanguage,
    RecipientType,
)
from scheduler.tasks.guest_lifecycle_checker import GuestLifecycleCheckerTask
from api.core.exceptions import NotificationError


@pytest.fixture
def notification_service():
    """Create GuestNotificationService with mocked dependencies."""
    service = GuestNotificationService()
    service.email_service = AsyncMock()
    service.queue_service = AsyncMock()
    service.template_service = GuestNotificationTemplates()
    return service


@pytest.fixture
async def guests_for_notification(db_session: AsyncSession):
    """Create guests at various notification stages."""
    guests = {}
    partner_id = uuid4()

    # Guest expiring in 7 days (warning threshold)
    guests["warning"] = GuestUser(
        id=uuid4(),
        email="warning@partner.com",
        display_name="Warning Guest",
        partner_company_id=partner_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=datetime.utcnow() + timedelta(days=7),
        invited_by=uuid4(),
    )

    # Guest expiring in 3 days (urgent)
    guests["urgent"] = GuestUser(
        id=uuid4(),
        email="urgent@partner.com",
        display_name="Urgent Guest",
        partner_company_id=partner_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=datetime.utcnow() + timedelta(days=3),
        invited_by=uuid4(),
    )

    # Guest expiring tomorrow (critical)
    guests["critical"] = GuestUser(
        id=uuid4(),
        email="critical@partner.com",
        display_name="Critical Guest",
        partner_company_id=partner_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=datetime.utcnow() + timedelta(days=1),
        invited_by=uuid4(),
    )

    # Guest being revoked
    guests["revoked"] = GuestUser(
        id=uuid4(),
        email="revoked@partner.com",
        display_name="Revoked Guest",
        partner_company_id=partner_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.REVOKED,
        expires_at=datetime.utcnow() + timedelta(days=30),
        revoked_at=datetime.utcnow(),
        revoked_by=uuid4(),
        revocation_reason="Policy violation",
    )

    # Guest being extended
    guests["extended"] = GuestUser(
        id=uuid4(),
        email="extended@partner.com",
        display_name="Extended Guest",
        partner_company_id=partner_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=datetime.utcnow() + timedelta(days=90),
        extended_count=1,
        last_extended_at=datetime.utcnow(),
    )

    for guest in guests.values():
        db_session.add(guest)

    await db_session.commit()
    return guests


class TestNotificationScheduling:
    """Test notification scheduling for guest lifecycle events."""

    @pytest.mark.asyncio
    @freeze_time("2025-03-01 02:00:00")
    async def test_expiry_warning_notification_7_days(
        self, notification_service, guests_for_notification
    ):
        """Test that expiry warnings are sent 7 days before expiry."""
        guest = guests_for_notification["warning"]
        admin_email = "admin@company.com"

        # Queue expiry warning
        await notification_service.queue_expiry_warning(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email=admin_email,
            language=NotificationLanguage.EN,
        )

        # Verify notification queued
        notification_service.queue_service.enqueue.assert_called_once()
        call_args = notification_service.queue_service.enqueue.call_args

        assert call_args[1]["queue"] == "notifications"
        assert call_args[1]["priority"] == "high"

        task_data = call_args[1]["task_data"]
        assert task_data["template"] == "guest_expiry_warning"
        assert task_data["recipient"] == admin_email
        assert "7 days" in task_data["context"]["subject"]
        assert guest.email in task_data["context"]["body"]

    @pytest.mark.asyncio
    async def test_expiry_warning_escalation(self, notification_service, guests_for_notification):
        """Test escalating urgency as expiry approaches."""
        # Test different urgency levels
        test_cases = [
            (guests_for_notification["warning"], 7, "normal"),
            (guests_for_notification["urgent"], 3, "high"),
            (guests_for_notification["critical"], 1, "critical"),
        ]

        for guest, days, expected_priority in test_cases:
            notification_service.queue_service.enqueue.reset_mock()

            await notification_service.queue_expiry_warning(
                guest_id=guest.id,
                guest_email=guest.email,
                guest_name=guest.display_name,
                expiry_date=guest.expires_at,
                days_until_expiry=days,
                admin_email="admin@company.com",
                language=NotificationLanguage.EN,
            )

            call_args = notification_service.queue_service.enqueue.call_args
            assert call_args[1]["priority"] == expected_priority

    @pytest.mark.asyncio
    async def test_revocation_notification(self, notification_service, guests_for_notification):
        """Test revocation notification to admin and guest."""
        guest = guests_for_notification["revoked"]
        admin_email = "admin@company.com"

        # Queue revocation notifications
        await notification_service.queue_revocation_notice(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            revoked_by_email=admin_email,
            revocation_reason=guest.revocation_reason,
            revocation_date=guest.revoked_at,
            language=NotificationLanguage.EN,
        )

        # Should queue two notifications (admin and guest)
        assert notification_service.queue_service.enqueue.call_count == 2

        calls = notification_service.queue_service.enqueue.call_args_list

        # Admin notification
        admin_call = calls[0]
        assert admin_call[1]["task_data"]["recipient"] == admin_email
        assert admin_call[1]["task_data"]["template"] == "guest_revoked_admin"
        assert guest.revocation_reason in admin_call[1]["task_data"]["context"]["body"]

        # Guest notification
        guest_call = calls[1]
        assert guest_call[1]["task_data"]["recipient"] == guest.email
        assert guest_call[1]["task_data"]["template"] == "guest_revoked_guest"
        assert "access has been revoked" in guest_call[1]["task_data"]["context"]["body"].lower()

    @pytest.mark.asyncio
    async def test_extension_confirmation(self, notification_service, guests_for_notification):
        """Test extension confirmation notifications."""
        guest = guests_for_notification["extended"]
        admin_email = "admin@company.com"
        justification = "Project timeline extended for additional requirements"

        # Queue extension confirmation
        await notification_service.queue_extension_confirmation(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            extended_by_email=admin_email,
            new_expiry_date=guest.expires_at,
            justification=justification,
            language=NotificationLanguage.EN,
        )

        # Verify notification details
        notification_service.queue_service.enqueue.assert_called()
        call_args = notification_service.queue_service.enqueue.call_args

        task_data = call_args[1]["task_data"]
        assert task_data["template"] == "guest_extended"
        assert task_data["recipient"] == admin_email
        assert justification in task_data["context"]["body"]
        assert guest.expires_at.strftime("%Y-%m-%d") in task_data["context"]["body"]

    @pytest.mark.asyncio
    async def test_scheduler_daily_notification_run(self, db_session, guests_for_notification):
        """Test scheduler task sends notifications daily."""
        task = GuestLifecycleCheckerTask()
        task.notification_service = AsyncMock()

        with freeze_time("2025-03-01 02:00:00"):  # 2 AM daily run
            # Find guests needing notifications
            expiring_soon = []
            for guest in guests_for_notification.values():
                if guest.status == GuestStatus.ACTIVE and guest.expires_at:
                    days_until = (guest.expires_at - datetime.utcnow()).days
                    if 0 < days_until <= 7:
                        expiring_soon.append((guest, days_until))

            # Process notifications
            for guest, days in expiring_soon:
                await task.send_expiry_warning(db_session, guest, days)

            # Verify notifications sent
            assert task.notification_service.queue_expiry_warning.call_count == len(expiring_soon)

    @pytest.mark.asyncio
    async def test_notification_localization(self, notification_service, guests_for_notification):
        """Test notifications in different languages (EN/HU)."""
        guest = guests_for_notification["warning"]
        admin_email = "admin@company.com"

        # Test English notification
        await notification_service.queue_expiry_warning(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email=admin_email,
            language=NotificationLanguage.EN,
        )

        en_call = notification_service.queue_service.enqueue.call_args
        assert "expires in 7 days" in en_call[1]["task_data"]["context"]["subject"].lower()

        # Reset and test Hungarian notification
        notification_service.queue_service.enqueue.reset_mock()

        await notification_service.queue_expiry_warning(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email=admin_email,
            language=NotificationLanguage.HU,
        )

        hu_call = notification_service.queue_service.enqueue.call_args
        assert "7 nap múlva lejár" in hu_call[1]["task_data"]["context"]["subject"].lower()

    @pytest.mark.asyncio
    async def test_notification_retry_on_failure(
        self, notification_service, guests_for_notification
    ):
        """Test notification retry logic on failure."""
        guest = guests_for_notification["warning"]

        # Mock initial failure then success
        call_count = 0

        async def mock_enqueue(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise NotificationError("SMTP connection failed")
            return {"message_id": str(uuid4())}

        notification_service.queue_service.enqueue = mock_enqueue

        # Queue with retry
        result = await notification_service.queue_expiry_warning_with_retry(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email="admin@company.com",
            max_retries=3,
        )

        # Should succeed after retry
        assert result is not None
        assert call_count == 2  # Failed once, succeeded on retry

    @pytest.mark.asyncio
    async def test_bulk_notification_batching(self, notification_service, db_session):
        """Test batching of bulk notifications."""
        # Create many guests expiring on same day
        partner_id = uuid4()
        expiry_date = datetime.utcnow() + timedelta(days=7)
        guests = []

        for i in range(50):
            guest = GuestUser(
                id=uuid4(),
                email=f"bulk{i}@partner.com",
                display_name=f"Bulk Guest {i}",
                partner_company_id=partner_id,
                azure_ad_id=str(uuid4()),
                status=GuestStatus.ACTIVE,
                expires_at=expiry_date,
            )
            guests.append(guest)
            db_session.add(guest)

        await db_session.commit()

        # Queue bulk expiry warning
        await notification_service.queue_bulk_expiry_warning(
            guests=guests, admin_email="admin@company.com", language=NotificationLanguage.EN
        )

        # Should batch into single notification
        notification_service.queue_service.enqueue.assert_called_once()
        call_args = notification_service.queue_service.enqueue.call_args

        task_data = call_args[1]["task_data"]
        assert task_data["template"] == "bulk_expiry_warning"
        assert task_data["context"]["guest_count"] == 50
        assert expiry_date.strftime("%Y-%m-%d") in task_data["context"]["body"]

    @pytest.mark.asyncio
    async def test_notification_deduplication(self, notification_service, guests_for_notification):
        """Test that duplicate notifications are prevented."""
        guest = guests_for_notification["warning"]
        admin_email = "admin@company.com"

        # Track sent notifications
        notification_service.sent_notifications = set()

        # First notification
        notification_id1 = await notification_service.queue_expiry_warning(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email=admin_email,
            language=NotificationLanguage.EN,
        )

        # Duplicate notification (within dedup window)
        notification_id2 = await notification_service.queue_expiry_warning(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email=admin_email,
            language=NotificationLanguage.EN,
        )

        # Should only send once
        assert notification_service.queue_service.enqueue.call_count == 1
        assert notification_id1 == notification_id2  # Same ID (deduplicated)

    @pytest.mark.asyncio
    async def test_notification_action_links(self, notification_service, guests_for_notification):
        """Test that notifications include proper action links."""
        guest = guests_for_notification["warning"]
        admin_email = "admin@company.com"
        base_url = "https://pooldrv.example.com"

        with patch.dict("os.environ", {"POOLDRV_BASE_URL": base_url}):
            await notification_service.queue_expiry_warning(
                guest_id=guest.id,
                guest_email=guest.email,
                guest_name=guest.display_name,
                expiry_date=guest.expires_at,
                days_until_expiry=7,
                admin_email=admin_email,
                language=NotificationLanguage.EN,
            )

        call_args = notification_service.queue_service.enqueue.call_args
        task_data = call_args[1]["task_data"]

        # Should include action links
        assert f"{base_url}/guests/{guest.id}/extend" in task_data["context"]["extend_link"]
        assert f"{base_url}/guests/{guest.id}" in task_data["context"]["view_link"]

    @pytest.mark.asyncio
    async def test_notification_scheduling_windows(
        self, notification_service, guests_for_notification
    ):
        """Test notifications respect scheduling windows."""
        guest = guests_for_notification["warning"]

        # Test during business hours (should send immediately)
        with freeze_time("2025-03-01 10:00:00"):  # 10 AM
            await notification_service.queue_expiry_warning(
                guest_id=guest.id,
                guest_email=guest.email,
                guest_name=guest.display_name,
                expiry_date=guest.expires_at,
                days_until_expiry=7,
                admin_email="admin@company.com",
                language=NotificationLanguage.EN,
            )

            call_args = notification_service.queue_service.enqueue.call_args
            assert call_args[1]["delay_seconds"] == 0  # No delay

        # Reset and test after hours (should delay)
        notification_service.queue_service.enqueue.reset_mock()

        with freeze_time("2025-03-01 22:00:00"):  # 10 PM
            await notification_service.queue_expiry_warning(
                guest_id=guest.id,
                guest_email=guest.email,
                guest_name=guest.display_name,
                expiry_date=guest.expires_at,
                days_until_expiry=7,
                admin_email="admin@company.com",
                language=NotificationLanguage.EN,
                respect_quiet_hours=True,
            )

            call_args = notification_service.queue_service.enqueue.call_args
            # Should delay until next business day
            assert call_args[1]["delay_seconds"] > 0

    @pytest.mark.asyncio
    async def test_notification_audit_trail(self, notification_service, guests_for_notification):
        """Test that all notifications are audited."""
        guest = guests_for_notification["warning"]
        audit_service = AsyncMock()
        notification_service.audit_service = audit_service

        await notification_service.queue_expiry_warning(
            guest_id=guest.id,
            guest_email=guest.email,
            guest_name=guest.display_name,
            expiry_date=guest.expires_at,
            days_until_expiry=7,
            admin_email="admin@company.com",
            language=NotificationLanguage.EN,
        )

        # Verify audit event created
        audit_service.log_event.assert_called_once()
        audit_call = audit_service.log_event.call_args

        assert audit_call[1]["event_type"] == "NOTIFICATION_QUEUED"
        assert audit_call[1]["details"]["template"] == "guest_expiry_warning"
        assert audit_call[1]["details"]["recipient"] == "admin@company.com"
        assert audit_call[1]["details"]["guest_id"] == str(guest.id)
