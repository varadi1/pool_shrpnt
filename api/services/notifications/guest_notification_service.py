"""Service for sending guest lifecycle notifications."""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.models.guest import GuestUser
from api.models.contract import PartnerCompany
from api.services.notifications.guest_notification_templates import GuestNotificationTemplates
from api.services.notifications.notification_service import NotificationService

logger = logging.getLogger(__name__)


class GuestNotificationService:
    """Service for managing guest lifecycle notifications."""
    
    def __init__(self, session: AsyncSession):
        """Initialize guest notification service."""
        self.session = session
        self.notification_service = NotificationService(session)
        self.templates = GuestNotificationTemplates()
        self.admin_emails = self._get_admin_emails()
    
    def _get_admin_emails(self) -> List[str]:
        """Get list of admin emails from configuration."""
        admin_emails_str = getattr(settings, "admin_notification_emails", "")
        if admin_emails_str:
            return [email.strip() for email in admin_emails_str.split(",") if email.strip()]
        return []
    
    def _get_locale(self, preferred_locale: Optional[str] = None) -> str:
        """Get locale for notifications."""
        if preferred_locale and preferred_locale in ["en", "hu"]:
            return preferred_locale
        default_locale = getattr(settings, "default_notification_locale", "en")
        return "hu" if default_locale.startswith("hu") else "en"
    
    async def send_expiry_warning(
        self,
        guest: GuestUser,
        days_until_expiry: int,
        correlation_id: Optional[str] = None
    ) -> bool:
        """Send expiry warning notification.
        
        Args:
            guest: Guest user object
            days_until_expiry: Days until expiry
            correlation_id: Correlation ID for tracing
            
        Returns:
            True if notification was sent successfully
        """
        try:
            # Get partner company
            partner = await self.session.get(PartnerCompany, guest.partner_company_id)
            partner_name = partner.name if partner else "Unknown"
            
            # Format expiry date
            expiry_date = guest.expires_at.strftime("%Y-%m-%d %H:%M") if guest.expires_at else "Unknown"
            
            # Get template for each locale
            for locale in ["en", "hu"]:
                template = self.templates.get_expiry_warning_email(
                    guest_name=guest.display_name,
                    guest_email=guest.email,
                    partner_company=partner_name,
                    days=days_until_expiry,
                    expiry_date=expiry_date,
                    guest_id=str(guest.id),
                    locale=locale
                )
                
                # Queue notification for admins
                recipients = [{"email": email, "role": "admin"} for email in self.admin_emails]
                
                await self.notification_service.queue_notification(
                    template_key=template["template_key"],
                    recipients=recipients,
                    variables={
                        "subject": template["subject"],
                        "body": template["body"],
                        "guest_name": guest.display_name,
                        "guest_email": guest.email,
                        "partner_company": partner_name,
                        "days": days_until_expiry,
                        "expiry_date": expiry_date,
                    },
                    priority=3,  # High priority for warnings
                    event_type="GUEST_EXPIRY_WARNING",
                    event_id=guest.id
                )
            
            logger.info(
                f"Queued expiry warning for guest {guest.email}",
                extra={
                    "guest_id": str(guest.id),
                    "days_until_expiry": days_until_expiry,
                    "correlation_id": correlation_id
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send expiry warning for guest {guest.id}: {e}",
                extra={"correlation_id": correlation_id}
            )
            return False
    
    async def send_revocation_notification(
        self,
        guest: GuestUser,
        revoked_by: str,
        revocation_reason: str,
        correlation_id: Optional[str] = None
    ) -> bool:
        """Send revocation notification.
        
        Args:
            guest: Guest user object
            revoked_by: Admin who revoked access
            revocation_reason: Reason for revocation
            correlation_id: Correlation ID for tracing
            
        Returns:
            True if notification was sent successfully
        """
        try:
            # Get partner company
            partner = await self.session.get(PartnerCompany, guest.partner_company_id)
            partner_name = partner.name if partner else "Unknown"
            
            # Format revocation date
            revocation_date = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
            
            # Send to admins
            for locale in ["en", "hu"]:
                admin_template = self.templates.get_revocation_notification(
                    guest_name=guest.display_name,
                    guest_email=guest.email,
                    partner_company=partner_name,
                    revocation_reason=revocation_reason,
                    admin_name=revoked_by,
                    revocation_date=revocation_date,
                    locale=locale,
                    recipient_type="admin"
                )
                
                admin_recipients = [{"email": email, "role": "admin"} for email in self.admin_emails]
                
                await self.notification_service.queue_notification(
                    template_key=admin_template["template_key"],
                    recipients=admin_recipients,
                    variables={
                        "subject": admin_template["subject"],
                        "body": admin_template["body"],
                    },
                    priority=2,  # High priority
                    event_type="GUEST_REVOKED",
                    event_id=guest.id
                )
            
            # Send to guest (only in their preferred locale or default)
            guest_locale = self._get_locale()
            guest_template = self.templates.get_revocation_notification(
                guest_name=guest.display_name,
                guest_email=guest.email,
                partner_company=partner_name,
                revocation_reason=revocation_reason,
                admin_name=revoked_by,
                revocation_date=revocation_date,
                locale=guest_locale,
                recipient_type="guest"
            )
            
            await self.notification_service.queue_notification(
                template_key=guest_template["template_key"],
                recipients=[{"email": guest.email, "role": "guest"}],
                variables={
                    "subject": guest_template["subject"],
                    "body": guest_template["body"],
                },
                priority=2,
                event_type="GUEST_REVOKED",
                event_id=guest.id
            )
            
            logger.info(
                f"Queued revocation notification for guest {guest.email}",
                extra={
                    "guest_id": str(guest.id),
                    "revoked_by": revoked_by,
                    "correlation_id": correlation_id
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send revocation notification for guest {guest.id}: {e}",
                extra={"correlation_id": correlation_id}
            )
            return False
    
    async def send_extension_confirmation(
        self,
        guest: GuestUser,
        extended_by: str,
        new_expiry_date: datetime,
        justification: str,
        extension_count: int,
        correlation_id: Optional[str] = None
    ) -> bool:
        """Send extension confirmation notification.
        
        Args:
            guest: Guest user object
            extended_by: Admin who extended access
            new_expiry_date: New expiry date
            justification: Justification for extension
            extension_count: Number of extensions used
            correlation_id: Correlation ID for tracing
            
        Returns:
            True if notification was sent successfully
        """
        try:
            # Get partner company
            partner = await self.session.get(PartnerCompany, guest.partner_company_id)
            partner_name = partner.name if partner else "Unknown"
            
            # Format expiry date
            expiry_date_str = new_expiry_date.strftime("%Y-%m-%d")
            
            # Send to admins
            for locale in ["en", "hu"]:
                admin_template = self.templates.get_extension_confirmation(
                    guest_name=guest.display_name,
                    guest_email=guest.email,
                    partner_company=partner_name,
                    new_expiry_date=expiry_date_str,
                    justification=justification,
                    admin_name=extended_by,
                    extension_count=extension_count,
                    locale=locale,
                    recipient_type="admin"
                )
                
                admin_recipients = [{"email": email, "role": "admin"} for email in self.admin_emails]
                
                await self.notification_service.queue_notification(
                    template_key=admin_template["template_key"],
                    recipients=admin_recipients,
                    variables={
                        "subject": admin_template["subject"],
                        "body": admin_template["body"],
                    },
                    priority=5,  # Normal priority
                    event_type="GUEST_EXTENDED",
                    event_id=guest.id
                )
            
            # Send to guest
            guest_locale = self._get_locale()
            guest_template = self.templates.get_extension_confirmation(
                guest_name=guest.display_name,
                guest_email=guest.email,
                partner_company=partner_name,
                new_expiry_date=expiry_date_str,
                justification=justification,
                admin_name=extended_by,
                extension_count=extension_count,
                locale=guest_locale,
                recipient_type="guest"
            )
            
            await self.notification_service.queue_notification(
                template_key=guest_template["template_key"],
                recipients=[{"email": guest.email, "role": "guest"}],
                variables={
                    "subject": guest_template["subject"],
                    "body": guest_template["body"],
                },
                priority=5,
                event_type="GUEST_EXTENDED",
                event_id=guest.id
            )
            
            logger.info(
                f"Queued extension confirmation for guest {guest.email}",
                extra={
                    "guest_id": str(guest.id),
                    "extended_by": extended_by,
                    "new_expiry": expiry_date_str,
                    "correlation_id": correlation_id
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send extension confirmation for guest {guest.id}: {e}",
                extra={"correlation_id": correlation_id}
            )
            return False
    
    async def send_expiry_notification(
        self,
        guest: GuestUser,
        correlation_id: Optional[str] = None
    ) -> bool:
        """Send notification that guest access has expired.
        
        Args:
            guest: Guest user object
            correlation_id: Correlation ID for tracing
            
        Returns:
            True if notification was sent successfully
        """
        try:
            # Get partner company
            partner = await self.session.get(PartnerCompany, guest.partner_company_id)
            partner_name = partner.name if partner else "Unknown"
            
            # Format expiry date
            expiry_date = guest.expires_at.strftime("%Y-%m-%d") if guest.expires_at else "Unknown"
            
            # Send to admins only (guest already revoked)
            for locale in ["en", "hu"]:
                template = self.templates.get_guest_expired_notification(
                    guest_name=guest.display_name,
                    guest_email=guest.email,
                    partner_company=partner_name,
                    expiry_date=expiry_date,
                    locale=locale
                )
                
                admin_recipients = [{"email": email, "role": "admin"} for email in self.admin_emails]
                
                await self.notification_service.queue_notification(
                    template_key=template["template_key"],
                    recipients=admin_recipients,
                    variables={
                        "subject": template["subject"],
                        "body": template["body"],
                    },
                    priority=3,
                    event_type="GUEST_EXPIRED",
                    event_id=guest.id
                )
            
            logger.info(
                f"Queued expiry notification for guest {guest.email}",
                extra={
                    "guest_id": str(guest.id),
                    "correlation_id": correlation_id
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send expiry notification for guest {guest.id}: {e}",
                extra={"correlation_id": correlation_id}
            )
            return False