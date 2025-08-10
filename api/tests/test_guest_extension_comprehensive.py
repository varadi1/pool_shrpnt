"""
Comprehensive tests for guest extension logic with policy validation.
Tests extension limits, justification requirements, and date calculations.
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
from api.core.exceptions import ValidationError, PolicyViolationError


@pytest.fixture
def lifecycle_service():
    """Create GuestLifecycleService instance with mocked dependencies."""
    service = GuestLifecycleService()
    service.audit_service = AsyncMock()
    service.notification_service = AsyncMock()
    return service


@pytest.fixture
async def extension_policy(db_session: AsyncSession):
    """Create a test lifecycle policy with extension limits."""
    policy = GuestLifecyclePolicy(
        id=uuid4(),
        partner_company_id=uuid4(),
        default_expiry_days=90,
        max_extensions=3,  # Allow up to 3 extensions
        extension_period_days=30,  # 30 days per extension
        min_extension_days=7,  # Minimum 7 days
        max_extension_days=180,  # Maximum 180 days
        require_justification=True,
        min_justification_length=20,
    )
    db_session.add(policy)
    await db_session.commit()
    await db_session.refresh(policy)
    return policy


@pytest.fixture
async def extendable_guest(db_session: AsyncSession, extension_policy):
    """Create a guest that can be extended."""
    guest = GuestUser(
        id=uuid4(),
        email="extend@partner.com",
        display_name="Extendable Guest",
        partner_company_id=extension_policy.partner_company_id,
        azure_ad_id=str(uuid4()),
        status=GuestStatus.ACTIVE,
        expires_at=datetime.utcnow() + timedelta(days=10),
        extended_count=0,
        invited_at=datetime.utcnow() - timedelta(days=80),
        accepted_at=datetime.utcnow() - timedelta(days=79),
    )
    db_session.add(guest)
    await db_session.commit()
    await db_session.refresh(guest)
    return guest


class TestExtensionLogic:
    """Test extension logic with policy validation."""

    @pytest.mark.asyncio
    async def test_extend_guest_basic(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test basic guest extension functionality."""
        extended_by = uuid4()
        new_expiry = datetime.utcnow() + timedelta(days=40)
        justification = "Project timeline extended due to additional requirements"

        # Perform extension
        result = await lifecycle_service.extend_guest(
            db_session, extendable_guest.id, extended_by, new_expiry, justification
        )

        # Verify extension applied
        assert result.expires_at == new_expiry
        assert result.extended_count == 1
        assert result.last_extended_at is not None

        # Verify extension record created
        query = select(GuestExtension).where(GuestExtension.guest_user_id == extendable_guest.id)
        extension = await db_session.scalar(query)
        assert extension is not None
        assert extension.new_expiry_date == new_expiry
        assert extension.justification == justification
        assert extension.extended_by == extended_by

    @pytest.mark.asyncio
    async def test_extension_respects_max_limit(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test that extensions respect maximum count policy."""
        extended_by = uuid4()

        # Perform maximum allowed extensions
        for i in range(extension_policy.max_extensions):
            new_expiry = extendable_guest.expires_at + timedelta(days=30)
            result = await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                new_expiry,
                f"Extension {i+1}: Valid business reason with sufficient detail",
            )
            extendable_guest = result  # Update for next iteration
            assert result.extended_count == i + 1

        # Attempt one more extension (should fail)
        with pytest.raises(PolicyViolationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                extendable_guest.expires_at + timedelta(days=30),
                "Another extension attempt that should be rejected",
            )

        assert "maximum extensions" in str(exc_info.value).lower()
        assert f"limit: {extension_policy.max_extensions}" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_extension_date_validation(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test extension date validation rules."""
        extended_by = uuid4()
        current_expiry = extendable_guest.expires_at

        # Test: Extension date must be after current expiry
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                current_expiry - timedelta(days=1),  # Before current expiry
                "Valid justification for testing date validation",
            )
        assert "must be after current expiry" in str(exc_info.value).lower()

        # Test: Minimum extension period (7 days)
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                current_expiry + timedelta(days=3),  # Only 3 days extension
                "Valid justification for testing minimum period",
            )
        assert "minimum extension" in str(exc_info.value).lower()

        # Test: Maximum extension period (180 days)
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                current_expiry + timedelta(days=200),  # 200 days extension
                "Valid justification for testing maximum period",
            )
        assert "maximum extension" in str(exc_info.value).lower()

        # Test: Valid extension (within limits)
        valid_expiry = current_expiry + timedelta(days=30)
        result = await lifecycle_service.extend_guest(
            db_session,
            extendable_guest.id,
            extended_by,
            valid_expiry,
            "Valid extension within all policy limits",
        )
        assert result.expires_at == valid_expiry

    @pytest.mark.asyncio
    async def test_justification_requirements(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test justification validation for extensions."""
        extended_by = uuid4()
        new_expiry = extendable_guest.expires_at + timedelta(days=30)

        # Test: Empty justification
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session, extendable_guest.id, extended_by, new_expiry, ""  # Empty justification
            )
        assert "justification required" in str(exc_info.value).lower()

        # Test: Too short justification
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                new_expiry,
                "Too short",  # Less than 20 characters
            )
        assert "minimum length" in str(exc_info.value).lower()

        # Test: Valid justification
        valid_justification = "Project requires additional time for security review and compliance"
        result = await lifecycle_service.extend_guest(
            db_session, extendable_guest.id, extended_by, new_expiry, valid_justification
        )
        assert result.expires_at == new_expiry

        # Verify justification stored
        query = select(GuestExtension).where(GuestExtension.guest_user_id == extendable_guest.id)
        extension = await db_session.scalar(query)
        assert extension.justification == valid_justification

    @pytest.mark.asyncio
    async def test_extension_for_expired_guest(
        self, lifecycle_service, db_session, extension_policy
    ):
        """Test that expired guests cannot be extended."""
        # Create expired guest
        expired_guest = GuestUser(
            id=uuid4(),
            email="expired@partner.com",
            display_name="Expired Guest",
            partner_company_id=extension_policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.EXPIRED,
            expires_at=datetime.utcnow() - timedelta(days=5),
            expired_at=datetime.utcnow() - timedelta(days=5),
        )
        db_session.add(expired_guest)
        await db_session.commit()

        # Attempt to extend expired guest
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                expired_guest.id,
                uuid4(),
                datetime.utcnow() + timedelta(days=30),
                "Trying to extend expired guest",
            )

        assert "expired guest" in str(exc_info.value).lower()
        assert "cannot be extended" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_extension_for_revoked_guest(
        self, lifecycle_service, db_session, extension_policy
    ):
        """Test that revoked guests cannot be extended."""
        # Create revoked guest
        revoked_guest = GuestUser(
            id=uuid4(),
            email="revoked@partner.com",
            display_name="Revoked Guest",
            partner_company_id=extension_policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.REVOKED,
            expires_at=datetime.utcnow() + timedelta(days=10),
            revoked_at=datetime.utcnow() - timedelta(days=1),
            revoked_by=uuid4(),
            revocation_reason="Security violation",
        )
        db_session.add(revoked_guest)
        await db_session.commit()

        # Attempt to extend revoked guest
        with pytest.raises(ValidationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                revoked_guest.id,
                uuid4(),
                datetime.utcnow() + timedelta(days=30),
                "Trying to extend revoked guest",
            )

        assert "revoked guest" in str(exc_info.value).lower()
        assert "cannot be extended" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_extension_audit_trail(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test that extensions create proper audit trail."""
        extended_by = uuid4()
        original_expiry = extendable_guest.expires_at
        new_expiry = original_expiry + timedelta(days=30)
        justification = "Audit trail test: project timeline extended"

        # Perform extension
        result = await lifecycle_service.extend_guest(
            db_session, extendable_guest.id, extended_by, new_expiry, justification
        )

        # Verify audit event logged
        lifecycle_service.audit_service.log_event.assert_called_once()
        audit_call = lifecycle_service.audit_service.log_event.call_args

        assert audit_call[1]["event_type"] == AuditEventType.GUEST_EXTENDED
        assert audit_call[1]["actor_id"] == extended_by
        assert audit_call[1]["entity_id"] == extendable_guest.id
        assert audit_call[1]["details"]["previous_expiry"] == original_expiry.isoformat()
        assert audit_call[1]["details"]["new_expiry"] == new_expiry.isoformat()
        assert audit_call[1]["details"]["justification"] == justification
        assert audit_call[1]["details"]["extension_count"] == 1

    @pytest.mark.asyncio
    async def test_extension_history(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test tracking of extension history."""
        extended_by1 = uuid4()
        extended_by2 = uuid4()

        # First extension
        expiry1 = extendable_guest.expires_at + timedelta(days=30)
        await lifecycle_service.extend_guest(
            db_session,
            extendable_guest.id,
            extended_by1,
            expiry1,
            "First extension: initial project delay",
        )

        # Second extension
        expiry2 = expiry1 + timedelta(days=45)
        await lifecycle_service.extend_guest(
            db_session,
            extendable_guest.id,
            extended_by2,
            expiry2,
            "Second extension: additional requirements",
        )

        # Get extension history
        history = await lifecycle_service.get_extension_history(db_session, extendable_guest.id)

        assert len(history) == 2

        # Verify first extension
        assert history[0].extended_by == extended_by1
        assert history[0].new_expiry_date == expiry1
        assert "initial project delay" in history[0].justification

        # Verify second extension
        assert history[1].extended_by == extended_by2
        assert history[1].new_expiry_date == expiry2
        assert "additional requirements" in history[1].justification

    @pytest.mark.asyncio
    async def test_extension_with_notification(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test that extensions trigger notifications."""
        extended_by = uuid4()
        admin_email = "admin@company.com"
        new_expiry = extendable_guest.expires_at + timedelta(days=30)

        # Mock admin lookup
        with patch("api.services.guests.lifecycle_service.get_user_email") as mock_get_email:
            mock_get_email.return_value = admin_email

            # Perform extension
            await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                extended_by,
                new_expiry,
                "Extension with notification test",
            )

        # Verify notification queued
        lifecycle_service.notification_service.queue_notification.assert_called()
        notification_call = lifecycle_service.notification_service.queue_notification.call_args

        assert notification_call[1]["template"] == "guest_extended"
        assert notification_call[1]["recipient"] == admin_email
        assert extendable_guest.email in str(notification_call[1]["context"])
        assert new_expiry.isoformat() in str(notification_call[1]["context"])

    @pytest.mark.asyncio
    async def test_concurrent_extensions(
        self, lifecycle_service, db_session, extendable_guest, extension_policy
    ):
        """Test handling of concurrent extension attempts."""
        import asyncio

        admin1 = uuid4()
        admin2 = uuid4()

        async def extend1():
            return await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                admin1,
                extendable_guest.expires_at + timedelta(days=30),
                "First concurrent extension attempt",
            )

        async def extend2():
            await asyncio.sleep(0.01)  # Small delay
            return await lifecycle_service.extend_guest(
                db_session,
                extendable_guest.id,
                admin2,
                extendable_guest.expires_at + timedelta(days=45),
                "Second concurrent extension attempt",
            )

        # Run concurrently
        results = await asyncio.gather(extend1(), extend2(), return_exceptions=True)

        # One should succeed, one might fail or get different result
        successful = [r for r in results if not isinstance(r, Exception)]
        assert len(successful) >= 1

        # Check final state
        await db_session.refresh(extendable_guest)
        assert extendable_guest.extended_count == 1

    @pytest.mark.asyncio
    async def test_extension_with_custom_policy(self, lifecycle_service, db_session):
        """Test extension with custom policy per partner."""
        # Create custom policy with no extension allowed
        no_extension_policy = GuestLifecyclePolicy(
            id=uuid4(),
            partner_company_id=uuid4(),
            default_expiry_days=30,
            max_extensions=0,  # No extensions allowed
            extension_period_days=0,
        )
        db_session.add(no_extension_policy)

        # Create guest under this policy
        guest = GuestUser(
            id=uuid4(),
            email="no-extend@partner.com",
            display_name="No Extension Guest",
            partner_company_id=no_extension_policy.partner_company_id,
            azure_ad_id=str(uuid4()),
            status=GuestStatus.ACTIVE,
            expires_at=datetime.utcnow() + timedelta(days=10),
            extended_count=0,
        )
        db_session.add(guest)
        await db_session.commit()

        # Attempt extension (should fail)
        with pytest.raises(PolicyViolationError) as exc_info:
            await lifecycle_service.extend_guest(
                db_session,
                guest.id,
                uuid4(),
                guest.expires_at + timedelta(days=10),
                "Should not be allowed",
            )

        assert "extensions not allowed" in str(exc_info.value).lower()
