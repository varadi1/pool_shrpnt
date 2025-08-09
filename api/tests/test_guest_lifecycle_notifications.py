"""Tests for guest lifecycle notification templates and service."""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from api.services.notifications.guest_notification_templates import GuestNotificationTemplates
from api.services.notifications.guest_notification_service import GuestNotificationService
from api.models.guest import GuestUser, GuestStatus


class TestGuestNotificationTemplates:
    """Test notification template generation."""
    
    def test_expiry_warning_email_english(self):
        """Test expiry warning email template in English."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_expiry_warning_email(
            guest_name="John Doe",
            guest_email="john@example.com",
            partner_company="Partner Corp",
            days=7,
            expiry_date="2025-01-20",
            guest_id="123",
            locale="en"
        )
        
        assert result["template_key"] == "GUEST_EXPIRY_WARNING"
        assert "Guest Access Expiring in 7 Days" in result["subject"]
        assert "John Doe" in result["subject"]
        assert "john@example.com" in result["body"]
        assert "Partner Corp" in result["body"]
        assert "7 days" in result["body"]
        assert "2025-01-20" in result["body"]
        assert "Extend Access" in result["body"]
        assert "/guests/123/extend" in result["body"]
    
    def test_expiry_warning_email_hungarian(self):
        """Test expiry warning email template in Hungarian."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_expiry_warning_email(
            guest_name="Nagy János",
            guest_email="janos@example.com",
            partner_company="Partner Kft",
            days=5,
            expiry_date="2025-01-18",
            guest_id="456",
            locale="hu"
        )
        
        assert result["template_key"] == "GUEST_EXPIRY_WARNING"
        assert "Vendég hozzáférés lejár 5 nap múlva" in result["subject"]
        assert "Nagy János" in result["subject"]
        assert "janos@example.com" in result["body"]
        assert "Partner Kft" in result["body"]
        assert "5 nap" in result["body"]
        assert "2025-01-18" in result["body"]
        assert "Hozzáférés meghosszabbítása" in result["body"]
    
    def test_revocation_notification_admin_english(self):
        """Test revocation notification for admin in English."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_revocation_notification(
            guest_name="Jane Smith",
            guest_email="jane@example.com",
            partner_company="Tech Partners",
            revocation_reason="Contract expired",
            admin_name="admin@company.com",
            revocation_date="2025-01-15 14:30",
            locale="en",
            recipient_type="admin"
        )
        
        assert result["template_key"] == "GUEST_REVOKED_ADMIN"
        assert "Guest Access Revoked - Jane Smith" in result["subject"]
        assert "jane@example.com" in result["body"]
        assert "Tech Partners" in result["body"]
        assert "Contract expired" in result["body"]
        assert "admin@company.com" in result["body"]
        assert "2025-01-15 14:30" in result["body"]
        assert "Removed from all Azure AD groups" in result["body"]
    
    def test_revocation_notification_guest_english(self):
        """Test revocation notification for guest in English."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_revocation_notification(
            guest_name="Jane Smith",
            guest_email="jane@example.com",
            partner_company="Tech Partners",
            revocation_reason="Security policy violation",
            admin_name="admin@company.com",
            revocation_date="2025-01-15 14:30",
            locale="en",
            recipient_type="guest"
        )
        
        assert result["template_key"] == "GUEST_REVOKED_GUEST"
        assert "Guest Access Revoked - Jane Smith" in result["subject"]
        assert "Your Access Has Been Revoked" in result["body"]
        assert "Security policy violation" in result["body"]
        assert "no longer have access to SharePoint" in result["body"]
        assert "contact your partner coordinator" in result["body"]
    
    def test_extension_confirmation_admin_english(self):
        """Test extension confirmation for admin in English."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_extension_confirmation(
            guest_name="Bob Wilson",
            guest_email="bob@example.com",
            partner_company="Global Partners",
            new_expiry_date="2025-04-15",
            justification="Project extension required",
            admin_name="manager@company.com",
            extension_count=2,
            locale="en",
            recipient_type="admin"
        )
        
        assert result["template_key"] == "GUEST_EXTENDED_ADMIN"
        assert "Guest Access Extended - Bob Wilson" in result["subject"]
        assert "bob@example.com" in result["body"]
        assert "Global Partners" in result["body"]
        assert "2025-04-15" in result["body"]
        assert "Project extension required" in result["body"]
        assert "manager@company.com" in result["body"]
        assert "2/3" in result["body"]
    
    def test_extension_confirmation_final_warning(self):
        """Test extension confirmation shows warning for final extension."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_extension_confirmation(
            guest_name="Alice Brown",
            guest_email="alice@example.com",
            partner_company="Partners Inc",
            new_expiry_date="2025-04-15",
            justification="Final extension",
            admin_name="admin@company.com",
            extension_count=3,
            locale="en",
            recipient_type="admin"
        )
        
        assert "Warning:" in result["body"]
        assert "final extension allowed" in result["body"]
    
    def test_extension_confirmation_guest_hungarian(self):
        """Test extension confirmation for guest in Hungarian."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_extension_confirmation(
            guest_name="Kovács Péter",
            guest_email="peter@example.com",
            partner_company="Magyar Partner Kft",
            new_expiry_date="2025-04-15",
            justification="Projekt folytatása",
            admin_name="admin@company.com",
            extension_count=1,
            locale="hu",
            recipient_type="guest"
        )
        
        assert result["template_key"] == "GUEST_EXTENDED_GUEST"
        assert "Vendég hozzáférés meghosszabbítva" in result["subject"]
        assert "Hozzáférése meghosszabbításra került" in result["body"]
        assert "2025-04-15" in result["body"]
        assert "Projekt folytatása" in result["body"]
    
    def test_expired_notification_english(self):
        """Test expired notification in English."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_guest_expired_notification(
            guest_name="David Lee",
            guest_email="david@example.com",
            partner_company="Tech Solutions",
            expiry_date="2025-01-10",
            locale="en"
        )
        
        assert result["template_key"] == "GUEST_EXPIRED"
        assert "Guest Access Expired - David Lee" in result["subject"]
        assert "access has expired" in result["body"]
        assert "automatically revoked" in result["body"]
        assert "david@example.com" in result["body"]
        assert "Tech Solutions" in result["body"]
        assert "2025-01-10" in result["body"]
        assert "permanently removed from Azure AD in 30 days" in result["body"]
    
    def test_expired_notification_hungarian(self):
        """Test expired notification in Hungarian."""
        templates = GuestNotificationTemplates()
        
        result = templates.get_guest_expired_notification(
            guest_name="Szabó Anna",
            guest_email="anna@example.com",
            partner_company="Magyar Tech Kft",
            expiry_date="2025-01-10",
            locale="hu"
        )
        
        assert result["template_key"] == "GUEST_EXPIRED"
        assert "Vendég hozzáférés lejárt" in result["subject"]
        assert "hozzáférése lejárt" in result["body"]
        assert "automatikusan visszavonásra került" in result["body"]
        assert "30 nap múlva véglegesen törlésre kerül" in result["body"]


@pytest.mark.asyncio
class TestGuestNotificationService:
    """Test guest notification service."""
    
    @pytest.fixture
    def mock_session(self):
        """Create mock database session."""
        session = AsyncMock()
        return session
    
    @pytest.fixture
    def mock_guest(self):
        """Create mock guest user."""
        guest = MagicMock(spec=GuestUser)
        guest.id = "123e4567-e89b-12d3-a456-426614174000"
        guest.email = "test@example.com"
        guest.display_name = "Test User"
        guest.partner_company_id = 1
        guest.expires_at = datetime(2025, 1, 20, tzinfo=timezone.utc)
        guest.status = GuestStatus.ACCEPTED
        return guest
    
    @pytest.fixture
    def mock_partner(self):
        """Create mock partner company."""
        partner = MagicMock()
        partner.id = 1
        partner.name = "Test Partner"
        return partner
    
    @pytest.fixture
    def notification_service(self, mock_session):
        """Create notification service with mocked dependencies."""
        with patch('api.services.notifications.guest_notification_service.NotificationService'):
            service = GuestNotificationService(mock_session)
            service.notification_service = AsyncMock()
            service.admin_emails = ["admin1@example.com", "admin2@example.com"]
            return service
    
    async def test_send_expiry_warning(self, notification_service, mock_guest, mock_partner, mock_session):
        """Test sending expiry warning notification."""
        mock_session.get.return_value = mock_partner
        
        result = await notification_service.send_expiry_warning(
            guest=mock_guest,
            days_until_expiry=7,
            correlation_id="test-123"
        )
        
        assert result is True
        
        # Verify notification was queued (2 locales)
        assert notification_service.notification_service.queue_notification.call_count == 2
        
        # Check the call arguments
        call_args = notification_service.notification_service.queue_notification.call_args_list[0]
        assert call_args[1]["template_key"] == "GUEST_EXPIRY_WARNING"
        assert call_args[1]["event_type"] == "GUEST_EXPIRY_WARNING"
        assert call_args[1]["priority"] == 3
        assert len(call_args[1]["recipients"]) == 2  # Two admin emails
    
    async def test_send_revocation_notification(self, notification_service, mock_guest, mock_partner, mock_session):
        """Test sending revocation notification."""
        mock_session.get.return_value = mock_partner
        
        result = await notification_service.send_revocation_notification(
            guest=mock_guest,
            revoked_by="admin@example.com",
            revocation_reason="Contract ended",
            correlation_id="test-456"
        )
        
        assert result is True
        
        # Should send to admins (2 locales) and guest (1 locale)
        assert notification_service.notification_service.queue_notification.call_count == 3
        
        # Check admin notification
        admin_call = notification_service.notification_service.queue_notification.call_args_list[0]
        assert admin_call[1]["template_key"] == "GUEST_REVOKED_ADMIN"
        assert admin_call[1]["event_type"] == "GUEST_REVOKED"
        
        # Check guest notification
        guest_call = notification_service.notification_service.queue_notification.call_args_list[2]
        assert guest_call[1]["template_key"] == "GUEST_REVOKED_GUEST"
        assert guest_call[1]["recipients"][0]["email"] == "test@example.com"
    
    async def test_send_extension_confirmation(self, notification_service, mock_guest, mock_partner, mock_session):
        """Test sending extension confirmation."""
        mock_session.get.return_value = mock_partner
        
        new_expiry = datetime(2025, 4, 20, tzinfo=timezone.utc)
        
        result = await notification_service.send_extension_confirmation(
            guest=mock_guest,
            extended_by="manager@example.com",
            new_expiry_date=new_expiry,
            justification="Project continuation",
            extension_count=1,
            correlation_id="test-789"
        )
        
        assert result is True
        
        # Should send to admins (2 locales) and guest (1 locale)
        assert notification_service.notification_service.queue_notification.call_count == 3
        
        # Check the notification details
        call_args = notification_service.notification_service.queue_notification.call_args_list[0]
        assert call_args[1]["template_key"] == "GUEST_EXTENDED_ADMIN"
        assert call_args[1]["event_type"] == "GUEST_EXTENDED"
        assert call_args[1]["priority"] == 5  # Normal priority
    
    async def test_send_expiry_notification(self, notification_service, mock_guest, mock_partner, mock_session):
        """Test sending expiry notification."""
        mock_session.get.return_value = mock_partner
        
        result = await notification_service.send_expiry_notification(
            guest=mock_guest,
            correlation_id="test-999"
        )
        
        assert result is True
        
        # Should only send to admins (2 locales)
        assert notification_service.notification_service.queue_notification.call_count == 2
        
        call_args = notification_service.notification_service.queue_notification.call_args_list[0]
        assert call_args[1]["template_key"] == "GUEST_EXPIRED"
        assert call_args[1]["event_type"] == "GUEST_EXPIRED"
    
    async def test_error_handling(self, notification_service, mock_guest, mock_session):
        """Test error handling in notification service."""
        # Simulate database error
        mock_session.get.side_effect = Exception("Database error")
        
        result = await notification_service.send_expiry_warning(
            guest=mock_guest,
            days_until_expiry=7
        )
        
        assert result is False
    
    async def test_locale_detection(self, notification_service):
        """Test locale detection logic."""
        # Test default
        assert notification_service._get_locale() == "en"
        
        # Test with preferred locale
        assert notification_service._get_locale("hu") == "hu"
        assert notification_service._get_locale("en") == "en"
        
        # Test invalid locale falls back to default
        assert notification_service._get_locale("fr") == "en"
    
    async def test_admin_email_configuration(self):
        """Test admin email configuration loading."""
        with patch('api.services.notifications.guest_notification_service.settings') as mock_settings:
            mock_settings.admin_notification_emails = "admin1@test.com, admin2@test.com, admin3@test.com"
            
            service = GuestNotificationService(AsyncMock())
            
            assert len(service.admin_emails) == 3
            assert "admin1@test.com" in service.admin_emails
            assert "admin2@test.com" in service.admin_emails
            assert "admin3@test.com" in service.admin_emails
    
    async def test_html_template_formatting(self):
        """Test that HTML templates are properly formatted."""
        templates = GuestNotificationTemplates()
        
        # Test that templates contain proper HTML structure
        result = templates.get_expiry_warning_email(
            guest_name="Test User",
            guest_email="test@example.com",
            partner_company="Test Co",
            days=7,
            expiry_date="2025-01-20",
            guest_id="123",
            locale="en"
        )
        
        assert "<html>" in result["body"]
        assert "</html>" in result["body"]
        assert "<body" in result["body"]
        assert "</body>" in result["body"]
        assert "style=" in result["body"]  # Has CSS styling
    
    async def test_action_links_in_templates(self):
        """Test that action links are properly included in templates."""
        templates = GuestNotificationTemplates()
        
        # Test expiry warning has extend link
        expiry_result = templates.get_expiry_warning_email(
            guest_name="Test",
            guest_email="test@example.com",
            partner_company="Test Co",
            days=7,
            expiry_date="2025-01-20",
            guest_id="abc123",
            locale="en"
        )
        
        assert "/guests/abc123/extend" in expiry_result["body"]
        assert "/guests/abc123" in expiry_result["body"]  # View details link
        assert 'href=' in expiry_result["body"]
        assert 'style=' in expiry_result["body"]  # Button styling