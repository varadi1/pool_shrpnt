"""
Tests for guest lifecycle audit event generation.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from freezegun import freeze_time
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.guest import GuestStatus, GuestUser
from api.services.audit import AuditService
from api.services.guests.guest_service import GuestService
from api.services.guests.lifecycle_service import GuestLifecycleService


@pytest.fixture
def mock_session():
    """Mock database session."""
    session = MagicMock(spec=AsyncSession)
    session.get = AsyncMock()
    session.execute = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    return session


@pytest.fixture
def mock_audit_service():
    """Mock audit service."""
    service = MagicMock(spec=AuditService)
    service.log_event = MagicMock()
    service.log_guest_event = MagicMock()
    return service


@pytest.fixture
def guest_service(mock_session, mock_audit_service):
    """Create guest service with mocked dependencies."""
    service = GuestService(mock_session)
    service.audit_service = mock_audit_service
    service.graph_auth = MagicMock()
    service._remove_from_all_groups = AsyncMock()
    return service


@pytest.fixture
def lifecycle_service(mock_session, mock_audit_service):
    """Create lifecycle service with mocked dependencies."""
    service = GuestLifecycleService(mock_session)
    service.audit_service = mock_audit_service
    return service


@pytest.fixture
def mock_guest():
    """Create mock guest user."""
    guest = MagicMock(spec=GuestUser)
    guest.id = uuid4()
    guest.email = "test.guest@example.com"
    guest.display_name = "Test Guest"
    guest.partner_company_id = 1
    guest.status = GuestStatus.ACCEPTED.value
    guest.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    guest.extended_count = 0
    guest.revoked_at = None
    guest.revoked_by = None
    guest.revocation_reason = None
    guest.azure_ad_id = "azure-123"
    return guest


@pytest.fixture
def mock_partner():
    """Create mock partner company."""
    partner = MagicMock()
    partner.id = 1
    partner.name = "Test Partner Company"
    return partner


@pytest.mark.asyncio
class TestGuestRevocationAudit:
    """Test audit events for guest revocation."""
    
    async def test_guest_revoked_audit_event(self, guest_service, mock_guest, mock_partner, mock_audit_service, mock_session):
        """Test GUEST_REVOKED audit event includes reason and admin info."""
        mock_session.get.side_effect = [mock_guest, mock_partner]
        mock_guest.partner_company = mock_partner
        
        correlation_id = str(uuid4())
        
        await guest_service.revoke_guest(
            guest_id=mock_guest.id,
            revoked_by="admin@example.com",
            revocation_reason="Security policy violation",
            correlation_id=correlation_id
        )
        
        # Verify audit event was logged
        mock_audit_service.log_guest_event.assert_called_once()
        call_args = mock_audit_service.log_guest_event.call_args
        
        assert call_args[1]["user_id"] == "admin@example.com"
        assert call_args[1]["guest_id"] == str(mock_guest.id)
        assert call_args[1]["guest_email"] == "test.guest@example.com"
        assert call_args[1]["action"] == "GUEST_REVOKED"
        assert call_args[1]["correlation_id"] == correlation_id
        assert call_args[1]["partner_company"] == "Test Partner Company"
        
        metadata = call_args[1]["metadata"]
        assert metadata["reason"] == "Security policy violation"
        assert metadata["revoked_by"] == "admin@example.com"
        assert metadata["partner_company_id"] == 1
        assert "revoked_at" in metadata
    
    async def test_bulk_revocation_audit_with_correlation(self, guest_service, mock_audit_service):
        """Test bulk revocation includes correlation ID for all operations."""
        guest_ids = [uuid4() for _ in range(3)]
        correlation_id = str(uuid4())
        
        # Mock individual revocations
        with patch.object(guest_service, 'revoke_guest', new_callable=AsyncMock) as mock_revoke:
            mock_revoke.side_effect = [
                MagicMock(email="guest1@example.com"),
                MagicMock(email="guest2@example.com"),
                Exception("Failed to revoke"),
            ]
            
            results = await guest_service.bulk_revoke_guests(
                guest_ids=guest_ids,
                revoked_by="admin@example.com",
                revocation_reason="Partner contract expired",
                correlation_id=correlation_id
            )
            
            # Verify individual revocations used same correlation ID
            assert mock_revoke.call_count == 3
            for call in mock_revoke.call_args_list:
                assert call[1]["correlation_id"] == correlation_id
            
            # Verify bulk operation audit event
            bulk_audit_call = mock_audit_service.log_guest_event.call_args_list[-1]
            assert bulk_audit_call[1]["action"] == "GUEST_BULK_REVOKED"
            assert bulk_audit_call[1]["correlation_id"] == correlation_id
            
            metadata = bulk_audit_call[1]["metadata"]
            assert metadata["total"] == 3
            assert metadata["succeeded"] == 2
            assert metadata["failed"] == 1
            assert metadata["reason"] == "Partner contract expired"
    
    async def test_guest_purged_audit_event(self, guest_service, mock_guest, mock_partner, mock_audit_service, mock_session):
        """Test GUEST_PURGED audit event when removed from Azure AD."""
        mock_guest.status = GuestStatus.REVOKED.value
        mock_guest.revoked_at = datetime.now(timezone.utc) - timedelta(days=35)
        mock_session.get.side_effect = [mock_guest, mock_partner]
        
        # Mock Graph API delete
        mock_client = AsyncMock()
        mock_response = MagicMock(status_code=204)
        mock_client.delete.return_value = mock_response
        guest_service.graph_auth.get_graph_client.return_value.__aenter__.return_value = mock_client
        
        correlation_id = str(uuid4())
        
        await guest_service.purge_revoked_guest(
            guest_id=mock_guest.id,
            correlation_id=correlation_id
        )
        
        # Verify audit event
        mock_audit_service.log_guest_event.assert_called_once()
        call_args = mock_audit_service.log_guest_event.call_args
        
        assert call_args[1]["user_id"] == "system"
        assert call_args[1]["action"] == "GUEST_PURGED"
        assert call_args[1]["correlation_id"] == correlation_id
        assert call_args[1]["partner_company"] == "Test Partner Company"
        
        metadata = call_args[1]["metadata"]
        assert metadata["azure_ad_id"] == "azure-123"
        assert metadata["partner_company_id"] == 1
        assert "purged_at" in metadata


@pytest.mark.asyncio
class TestGuestExtensionAudit:
    """Test audit events for guest extensions."""
    
    async def test_guest_extended_audit_event(self, lifecycle_service, mock_guest, mock_partner, mock_audit_service, mock_session):
        """Test GUEST_EXTENDED audit event includes justification."""
        mock_session.get.side_effect = [mock_guest, mock_partner]
        
        # Mock policy
        mock_policy = MagicMock()
        mock_policy.max_extensions = 3
        mock_policy.extension_period_days = 90
        
        with patch.object(lifecycle_service, 'get_or_create_policy', new_callable=AsyncMock) as mock_get_policy:
            mock_get_policy.return_value = mock_policy
            
            correlation_id = str(uuid4())
            
            extension = await lifecycle_service.extend_guest_access(
                guest_id=mock_guest.id,
                extended_by="admin@example.com",
                justification="Project extension required",
                extension_days=90,
                correlation_id=correlation_id
            )
            
            # Verify audit event
            mock_audit_service.log_guest_event.assert_called_once()
            call_args = mock_audit_service.log_guest_event.call_args
            
            assert call_args[1]["user_id"] == "admin@example.com"
            assert call_args[1]["action"] == "GUEST_EXTENDED"
            assert call_args[1]["correlation_id"] == correlation_id
            assert call_args[1]["partner_company"] == "Test Partner Company"
            
            metadata = call_args[1]["metadata"]
            assert metadata["justification"] == "Project extension required"
            assert metadata["extended_by"] == "admin@example.com"
            assert metadata["extension_days"] == 90
            assert metadata["extension_count"] == 1
            assert metadata["partner_company_id"] == 1
            assert "previous_expiry" in metadata
            assert "new_expiry" in metadata


@pytest.mark.asyncio
class TestGuestExpiryAudit:
    """Test audit events for guest expiry."""
    
    @freeze_time("2025-01-15 02:00:00")
    async def test_guest_expired_auto_revocation_audit(self):
        """Test GUEST_EXPIRED audit event when auto-expiry triggers."""
        from scheduler.tasks.guest_lifecycle_checker import GuestLifecycleCheckerTask
        
        # Create task with mocked dependencies
        task = GuestLifecycleCheckerTask()
        task.guest_service = MagicMock()
        task.guest_service.revoke_guest = AsyncMock()
        task.guest_service.audit_service = MagicMock()
        task.guest_service.audit_service.log_guest_event = MagicMock()
        
        # Create expired guest
        expired_guest = MagicMock()
        expired_guest.id = uuid4()
        expired_guest.email = "expired@example.com"
        expired_guest.expires_at = datetime(2025, 1, 14, 0, 0, 0, tzinfo=timezone.utc)
        expired_guest.status = GuestStatus.ACCEPTED.value
        expired_guest.partner_company_id = 1
        expired_guest.partner_company = MagicMock(name="Partner Co")
        
        # Mock database session
        mock_session = AsyncMock()
        mock_query_result = MagicMock()
        mock_query_result.scalars.return_value.all.return_value = [expired_guest]
        mock_session.execute.return_value = mock_query_result
        
        # Mock partner company fetch
        mock_partner = MagicMock(name="Partner Co")
        mock_session.get.return_value = mock_partner
        
        with patch("scheduler.tasks.guest_lifecycle_checker.get_db_session") as mock_get_session:
            mock_get_session.return_value.__aenter__.return_value = mock_session
            mock_get_session.return_value.__aexit__.return_value = None
            
            correlation_id = "test-expiry-123"
            results = await task._process_expired_guests(correlation_id)
            
            # Verify GUEST_EXPIRED audit event was logged
            audit_calls = task.guest_service.audit_service.log_guest_event.call_args_list
            
            # Should have one call for GUEST_EXPIRED
            expired_event_call = None
            for call in audit_calls:
                if call[1]["action"] == "GUEST_EXPIRED":
                    expired_event_call = call
                    break
            
            assert expired_event_call is not None
            assert expired_event_call[1]["user_id"] == "system"
            assert expired_event_call[1]["guest_id"] == str(expired_guest.id)
            assert expired_event_call[1]["correlation_id"] == correlation_id
            
            metadata = expired_event_call[1]["metadata"]
            assert metadata["auto_revoked"] is True
            assert "expires_at" in metadata


@pytest.mark.asyncio
class TestAuditEventPartnerContext:
    """Test that all lifecycle events include partner company context."""
    
    async def test_all_events_include_partner_context(self, guest_service, lifecycle_service, mock_guest, mock_partner, mock_audit_service, mock_session):
        """Verify all lifecycle events include partner company information."""
        mock_session.get.return_value = mock_partner
        
        # Test events that should include partner context
        events_to_test = [
            ("GUEST_REVOKED", guest_service.revoke_guest),
            ("GUEST_EXTENDED", lifecycle_service.extend_guest_access),
            ("GUEST_PURGED", guest_service.purge_revoked_guest),
        ]
        
        for event_name, method in events_to_test:
            mock_audit_service.log_guest_event.reset_mock()
            
            # Set up specific mocks for each method
            if event_name == "GUEST_REVOKED":
                mock_session.get.side_effect = [mock_guest, mock_partner]
                await method(
                    guest_id=mock_guest.id,
                    revoked_by="admin@example.com",
                    revocation_reason="Test reason"
                )
            elif event_name == "GUEST_EXTENDED":
                mock_session.get.side_effect = [mock_guest, mock_partner]
                with patch.object(lifecycle_service, 'get_or_create_policy', new_callable=AsyncMock):
                    await method(
                        guest_id=mock_guest.id,
                        extended_by="admin@example.com",
                        justification="Test justification"
                    )
            elif event_name == "GUEST_PURGED":
                mock_guest.status = GuestStatus.REVOKED.value
                mock_session.get.side_effect = [mock_guest, mock_partner]
                mock_client = AsyncMock()
                mock_client.delete.return_value = MagicMock(status_code=204)
                guest_service.graph_auth.get_graph_client.return_value.__aenter__.return_value = mock_client
                await method(guest_id=mock_guest.id)
            
            # Verify partner context was included
            assert mock_audit_service.log_guest_event.called
            call_args = mock_audit_service.log_guest_event.call_args
            
            assert call_args[1]["partner_company"] == "Test Partner Company"
            metadata = call_args[1].get("metadata", {})
            assert metadata.get("partner_company_id") == 1


@pytest.mark.asyncio
class TestAuditEventCorrelation:
    """Test correlation ID tracking across operations."""
    
    async def test_correlation_id_propagation(self, guest_service, mock_audit_service):
        """Test that correlation IDs are properly propagated through operations."""
        correlation_id = str(uuid4())
        
        # Mock a chain of operations
        with patch.object(guest_service, 'revoke_guest', new_callable=AsyncMock) as mock_revoke:
            mock_revoke.return_value = MagicMock(email="test@example.com")
            
            # Trigger bulk operation
            await guest_service.bulk_revoke_guests(
                guest_ids=[uuid4()],
                revoked_by="admin@example.com",
                revocation_reason="Test",
                correlation_id=correlation_id
            )
            
            # Verify same correlation ID used throughout
            mock_revoke.assert_called_once()
            assert mock_revoke.call_args[1]["correlation_id"] == correlation_id
            
            # Check bulk audit event
            bulk_call = [c for c in mock_audit_service.log_guest_event.call_args_list 
                        if c[1]["action"] == "GUEST_BULK_REVOKED"][0]
            assert bulk_call[1]["correlation_id"] == correlation_id
    
    async def test_correlation_id_generation(self, guest_service, mock_guest, mock_session, mock_audit_service):
        """Test that correlation IDs are generated when not provided."""
        mock_session.get.return_value = mock_guest
        
        # Call without correlation ID
        await guest_service.revoke_guest(
            guest_id=mock_guest.id,
            revoked_by="admin@example.com",
            revocation_reason="Test"
        )
        
        # Verify correlation ID was generated
        call_args = mock_audit_service.log_guest_event.call_args
        correlation_id = call_args[1]["correlation_id"]
        
        assert correlation_id is not None
        assert len(correlation_id) == 36  # UUID format