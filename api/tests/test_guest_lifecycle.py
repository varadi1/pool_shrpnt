"""Tests for guest lifecycle management service."""

import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from api.models.guest import (
    GuestUser,
    GuestStatus,
    GuestExtension,
    GuestLifecyclePolicy,
)
from api.models.contract import PartnerCompany
from api.services.guests.lifecycle_service import GuestLifecycleService


@pytest.fixture
def mock_session():
    """Create mock async session."""
    session = AsyncMock(spec=AsyncSession)
    return session


@pytest.fixture
def mock_sync_session():
    """Create mock sync session."""
    session = MagicMock(spec=Session)
    return session


@pytest.fixture
def lifecycle_service(mock_session, mock_sync_session):
    """Create lifecycle service with mocked dependencies."""
    with patch('api.services.guests.lifecycle_service.GuestService'):
        service = GuestLifecycleService(mock_session, mock_sync_session)
        service.guest_service = MagicMock()
        service.audit_service = MagicMock()
        service.notification_service = AsyncMock()
        return service


@pytest.fixture
def sample_partner():
    """Create a sample partner company."""
    return PartnerCompany(
        id=1,
        name="Test Partner",
        short_code="TST",
        domain="testpartner.com"
    )


@pytest.fixture
def sample_guest(sample_partner):
    """Create a sample guest user."""
    return GuestUser(
        id=uuid4(),
        email="guest@example.com",
        display_name="Test Guest",
        partner_company_id=sample_partner.id,
        partner_company=sample_partner,
        status=GuestStatus.ACCEPTED.value,
        azure_ad_id="azure-id-123",
        created_by="admin@company.com",
        expires_at=datetime.now(UTC) + timedelta(days=30),
        extended_count=0,
    )


@pytest.fixture
def sample_policy():
    """Create a sample lifecycle policy."""
    return GuestLifecyclePolicy(
        id=uuid4(),
        partner_company_id=1,
        default_expiry_days=90,
        max_extensions=3,
        extension_period_days=90,
        auto_expire_enabled=True,
    )


class TestGuestLifecycleService:
    """Test guest lifecycle management functionality."""
    
    @pytest.mark.asyncio
    async def test_get_or_create_policy_existing(self, lifecycle_service, mock_session, sample_policy):
        """Test getting existing policy."""
        # Setup
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        
        # Execute
        result = await lifecycle_service.get_or_create_policy(
            partner_company_id=1
        )
        
        # Verify
        assert result == sample_policy
        mock_session.add.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_get_or_create_policy_new(self, lifecycle_service, mock_session):
        """Test creating new policy."""
        # Setup
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        # Execute
        result = await lifecycle_service.get_or_create_policy(
            partner_company_id=1,
            default_expiry_days=60,
            max_extensions=2,
            extension_period_days=30
        )
        
        # Verify
        assert result.partner_company_id == 1
        assert result.default_expiry_days == 60
        assert result.max_extensions == 2
        assert result.extension_period_days == 30
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_calculate_expiry_date(self, lifecycle_service, mock_session, sample_policy):
        """Test expiry date calculation."""
        # Setup
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        
        base_date = datetime.now(UTC)
        
        # Execute
        expiry_date = await lifecycle_service.calculate_expiry_date(
            partner_company_id=1,
            from_date=base_date
        )
        
        # Verify
        expected = base_date + timedelta(days=sample_policy.default_expiry_days)
        assert abs((expiry_date - expected).total_seconds()) < 1  # Within 1 second
    
    @pytest.mark.asyncio
    async def test_extend_guest_access_success(
        self, lifecycle_service, mock_session, sample_guest, sample_policy, sample_partner
    ):
        """Test successful guest access extension."""
        # Setup
        mock_session.get.side_effect = [sample_guest, sample_partner]
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        
        # Execute
        result = await lifecycle_service.extend_guest_access(
            guest_id=sample_guest.id,
            extended_by="admin@company.com",
            justification="Project extended",
            extension_days=30
        )
        
        # Verify
        assert isinstance(result, GuestExtension)
        assert result.guest_user_id == sample_guest.id
        assert result.justification == "Project extended"
        assert sample_guest.extended_count == 1
        assert sample_guest.last_extended_at is not None
        mock_session.commit.assert_called_once()
        
        # Verify audit logging
        lifecycle_service.audit_service.log_guest_event.assert_called_once()
        call_args = lifecycle_service.audit_service.log_guest_event.call_args
        assert call_args.kwargs['action'] == "GUEST_EXTENDED"
    
    @pytest.mark.asyncio
    async def test_extend_guest_max_extensions_reached(
        self, lifecycle_service, mock_session, sample_guest, sample_policy
    ):
        """Test extension fails when max extensions reached."""
        # Setup
        sample_guest.extended_count = 3  # Already at max
        mock_session.get.return_value = sample_guest
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        
        # Execute and verify
        with pytest.raises(ValueError, match="reached maximum extensions"):
            await lifecycle_service.extend_guest_access(
                guest_id=sample_guest.id,
                extended_by="admin@company.com",
                justification="Test"
            )
    
    @pytest.mark.asyncio
    async def test_extend_revoked_guest_fails(self, lifecycle_service, mock_session, sample_guest):
        """Test that extending revoked guest fails."""
        # Setup
        sample_guest.status = GuestStatus.REVOKED.value
        mock_session.get.return_value = sample_guest
        
        # Execute and verify
        with pytest.raises(ValueError, match="Cannot extend revoked or purged guest"):
            await lifecycle_service.extend_guest_access(
                guest_id=sample_guest.id,
                extended_by="admin@company.com",
                justification="Test"
            )
    
    @pytest.mark.asyncio
    async def test_find_expiring_guests(self, lifecycle_service, mock_session):
        """Test finding guests approaching expiry."""
        # Setup
        guest1 = MagicMock(expires_at=datetime.now(UTC) + timedelta(days=5))
        guest2 = MagicMock(expires_at=datetime.now(UTC) + timedelta(days=10))
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [guest1]
        mock_session.execute.return_value = mock_result
        
        # Execute
        result = await lifecycle_service.find_expiring_guests(days_until_expiry=7)
        
        # Verify
        assert len(result) == 1
        assert guest1 in result
    
    @pytest.mark.asyncio
    async def test_find_expired_guests(self, lifecycle_service, mock_session):
        """Test finding expired guests."""
        # Setup
        expired_guest = MagicMock(
            expires_at=datetime.now(UTC) - timedelta(days=1),
            status=GuestStatus.ACCEPTED.value
        )
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [expired_guest]
        mock_session.execute.return_value = mock_result
        
        # Execute
        result = await lifecycle_service.find_expired_guests()
        
        # Verify
        assert len(result) == 1
        assert expired_guest in result
    
    @pytest.mark.asyncio
    async def test_expire_guest(self, lifecycle_service, mock_session, sample_guest, sample_partner):
        """Test expiring a guest."""
        # Setup
        mock_session.get.side_effect = [sample_guest, sample_partner]
        lifecycle_service.guest_service._remove_from_all_groups = AsyncMock()
        
        # Execute
        result = await lifecycle_service.expire_guest(
            guest_id=sample_guest.id,
            correlation_id="test-correlation"
        )
        
        # Verify
        assert result.status == GuestStatus.EXPIRED.value
        lifecycle_service.guest_service._remove_from_all_groups.assert_called_once()
        mock_session.commit.assert_called_once()
        
        # Verify audit logging
        lifecycle_service.audit_service.log_guest_event.assert_called_once()
        call_args = lifecycle_service.audit_service.log_guest_event.call_args
        assert call_args.kwargs['action'] == "GUEST_EXPIRED"
    
    @pytest.mark.asyncio
    async def test_expire_already_expired_guest(self, lifecycle_service, mock_session, sample_guest):
        """Test expiring already expired guest returns without changes."""
        # Setup
        sample_guest.status = GuestStatus.EXPIRED.value
        mock_session.get.return_value = sample_guest
        
        # Execute
        result = await lifecycle_service.expire_guest(guest_id=sample_guest.id)
        
        # Verify
        assert result == sample_guest
        lifecycle_service.guest_service._remove_from_all_groups.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_process_automatic_expiry(self, lifecycle_service, mock_session, sample_policy):
        """Test automatic expiry processing."""
        # Setup
        expired_guest = MagicMock(
            id=uuid4(),
            email="expired@example.com",
            expires_at=datetime.now(UTC) - timedelta(days=1),
            status=GuestStatus.ACCEPTED.value,
            partner_company_id=1
        )
        
        # Mock find_expired_guests
        lifecycle_service.find_expired_guests = AsyncMock(return_value=[expired_guest])
        
        # Mock policy lookup
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        mock_session.get.return_value = expired_guest
        
        lifecycle_service.guest_service._remove_from_all_groups = AsyncMock()
        
        # Execute
        result = await lifecycle_service.process_automatic_expiry(dry_run=False)
        
        # Verify
        assert len(result['expired']) == 1
        assert len(result['errors']) == 0
        assert result['expired'][0]['email'] == "expired@example.com"
    
    @pytest.mark.asyncio
    async def test_process_automatic_expiry_dry_run(self, lifecycle_service):
        """Test automatic expiry in dry run mode."""
        # Setup
        expired_guest = MagicMock(
            id=uuid4(),
            email="expired@example.com",
            expires_at=datetime.now(UTC) - timedelta(days=1),
            partner_company_id=1
        )
        
        lifecycle_service.find_expired_guests = AsyncMock(return_value=[expired_guest])
        lifecycle_service.get_or_create_policy = AsyncMock(
            return_value=MagicMock(auto_expire_enabled=True)
        )
        
        # Execute
        result = await lifecycle_service.process_automatic_expiry(dry_run=True)
        
        # Verify
        assert result['dry_run'] is True
        assert len(result['expired']) == 1
        lifecycle_service.expire_guest = AsyncMock()
        lifecycle_service.expire_guest.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_send_expiry_notifications(
        self, lifecycle_service, mock_session, sample_guest, sample_partner
    ):
        """Test sending expiry notifications."""
        # Setup
        sample_guest.expires_at = datetime.now(UTC) + timedelta(days=5)
        lifecycle_service.find_expiring_guests = AsyncMock(return_value=[sample_guest])
        mock_session.get.return_value = sample_partner
        
        # Execute
        result = await lifecycle_service.send_expiry_notifications(days_before_expiry=7)
        
        # Verify
        assert len(result['notified']) == 1
        assert len(result['errors']) == 0
        lifecycle_service.notification_service.queue_notification.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_extension_history(self, lifecycle_service, mock_session):
        """Test getting extension history for a guest."""
        # Setup
        extension1 = MagicMock(extended_at=datetime.now(UTC) - timedelta(days=30))
        extension2 = MagicMock(extended_at=datetime.now(UTC) - timedelta(days=60))
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [extension1, extension2]
        mock_session.execute.return_value = mock_result
        
        # Execute
        result = await lifecycle_service.get_extension_history(guest_id=uuid4())
        
        # Verify
        assert len(result) == 2
        assert extension1 in result
        assert extension2 in result
    
    @pytest.mark.asyncio
    async def test_can_extend_guest(self, lifecycle_service, mock_session, sample_guest, sample_policy):
        """Test checking if guest can be extended."""
        # Setup
        mock_session.get.return_value = sample_guest
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        
        # Execute
        can_extend, reason = await lifecycle_service.can_extend_guest(sample_guest.id)
        
        # Verify
        assert can_extend is True
        assert reason == "Guest can be extended"
    
    @pytest.mark.asyncio
    async def test_can_extend_guest_max_reached(
        self, lifecycle_service, mock_session, sample_guest, sample_policy
    ):
        """Test checking extension when max reached."""
        # Setup
        sample_guest.extended_count = 3
        mock_session.get.return_value = sample_guest
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_policy
        mock_session.execute.return_value = mock_result
        
        # Execute
        can_extend, reason = await lifecycle_service.can_extend_guest(sample_guest.id)
        
        # Verify
        assert can_extend is False
        assert "Maximum extensions" in reason
    
    @pytest.mark.asyncio
    async def test_apply_grace_period(self, lifecycle_service, mock_session, sample_guest):
        """Test applying grace period to a guest."""
        # Setup
        original_expiry = sample_guest.expires_at
        mock_session.get.return_value = sample_guest
        
        # Execute
        result = await lifecycle_service.apply_grace_period(
            guest_id=sample_guest.id,
            grace_days=7
        )
        
        # Verify
        assert result.expires_at > original_expiry
        expected_new_expiry = original_expiry + timedelta(days=7)
        assert abs((result.expires_at - expected_new_expiry).total_seconds()) < 1
        mock_session.commit.assert_called_once()
        
        # Verify audit logging
        lifecycle_service.audit_service.log_guest_event.assert_called_once()
        call_args = lifecycle_service.audit_service.log_guest_event.call_args
        assert call_args.kwargs['action'] == "GUEST_GRACE_PERIOD"