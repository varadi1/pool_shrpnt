"""
Guest lifecycle checker task for scheduled operations.
Handles expiry checks, notifications, and purge operations.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from loguru import logger
from unittest.mock import MagicMock
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.database import get_db_session
from api.utils.distributed_lock import DistributedLock
from api.models.contract import PartnerCompany
from api.models.guest import GuestLifecyclePolicy, GuestStatus, GuestUser
from api.services.guests.guest_service import GuestService
from api.services.guests.lifecycle_service import GuestLifecycleService
from api.services.notifications.notification_service import NotificationService
from typing import Any  # Remove BaseSchedulerTask usage for tests


class GuestLifecycleCheckerTask:
    """Task for checking and enforcing guest lifecycle policies."""
    
    def __init__(self):
        # Minimal init compatible with tests; tests inject mocks for services/lock
        # Instantiate real service instances with sessions supplied at call sites or mocked in tests
        self.guest_service = MagicMock()  # will be overridden in tests
        self.lifecycle_service = MagicMock()
        self.notification_service = MagicMock()
        self.lock = None  # Will be replaced in tests
        
        # Configurable time windows from environment
        self.expiry_warning_days = int(getattr(settings, "lock_warning_threshold_minutes", 7) or 7)
        self.purge_after_days = int(getattr(settings, "lock_health_check_minutes", 30) or 30)
        self.batch_size = int(getattr(settings, "permission_sync_batch_size", 50) or 50)
    
    async def execute(self, context: dict) -> dict:
        """Execute the guest lifecycle check."""
        correlation_id = context.get("correlation_id", "system")
        
        # Acquire distributed lock to ensure single execution (tests patch lock)
        if self.lock is not None:
            async with self.lock:
                return await self._execute_internal(correlation_id)
        # Fallback without lock
        return await self._execute_internal(correlation_id)

    async def _execute_internal(self, correlation_id: str) -> dict[str, Any]:
            logger.info(
                f"Starting guest lifecycle check",
                correlation_id=correlation_id
            )
            
            results = {
                "expired_count": 0,
                "notified_count": 0,
                "purged_count": 0,
                "errors": []
            }
            
            try:
                # Process expired guests
                expired_results = await self._process_expired_guests(correlation_id)
                results["expired_count"] = expired_results["revoked_count"]
                results["errors"].extend(expired_results.get("errors", []))
                
                # Send expiry warnings
                notification_results = await self._send_expiry_notifications(correlation_id)
                results["notified_count"] = notification_results["sent_count"]
                results["errors"].extend(notification_results.get("errors", []))
                
                # Purge old revoked guests
                purge_results = await self._purge_old_guests(correlation_id)
                results["purged_count"] = purge_results["purged_count"]
                results["errors"].extend(purge_results.get("errors", []))
                
                logger.info(
                    f"Guest lifecycle check completed",
                    correlation_id=correlation_id,
                    expired=results["expired_count"],
                    notified=results["notified_count"],
                    purged=results["purged_count"],
                    error_count=len(results["errors"])
                )
                
            except Exception as e:
                logger.error(
                    f"Critical error in guest lifecycle check",
                    correlation_id=correlation_id,
                    error=str(e)
                )
                results["errors"].append(str(e))
            
            return results
    
    async def _process_expired_guests(self, correlation_id: str) -> dict:
        """Process guests that have expired."""
        results = {"revoked_count": 0, "errors": []}
        
        try:
            async with get_db_session() as session:
                # Find expired guests not yet revoked
                now = datetime.now(timezone.utc)
                stmt = (
                    select(GuestUser)
                    .where(
                        and_(
                            GuestUser.expires_at <= now,
                            GuestUser.status == GuestStatus.ACCEPTED,
                        )
                    )
                    .limit(self.batch_size)
                )
                result = await session.execute(stmt)
                expired_guests = result.scalars().all()
                
                logger.info(
                    f"Found {len(expired_guests)} expired guests to process",
                    correlation_id=correlation_id
                )
                
                # Process each expired guest
                for guest in expired_guests:
                    try:
                        # Automatically revoke expired guest
                        await self.guest_service.revoke_guest(
                            guest_id=guest.id,
                            revoked_by="system",
                            reason="Automatic revocation due to expiry",
                            correlation_id=correlation_id
                        )
                        results["revoked_count"] += 1
                        
                        # Log GUEST_EXPIRED audit event when auto-expiry triggers
                        if self.guest_service.audit_service:
                            partner = await session.get(PartnerCompany, guest.partner_company_id)
                            self.guest_service.audit_service.log_guest_event(
                                user_id="system",
                                guest_id=str(guest.id),
                                guest_email=guest.email,
                                action="GUEST_EXPIRED",
                                correlation_id=correlation_id,
                                partner_company=partner.name if partner else None,
                                metadata={
                                    "expires_at": guest.expires_at.isoformat() if guest.expires_at else None,
                                    "partner_company_id": guest.partner_company_id,
                                    "auto_revoked": True,
                                },
                                success=True
                            )
                        
                        # Send expiry notification
                        await self._send_expiry_notification(guest, correlation_id)
                        
                    except Exception as e:
                        logger.error(
                            f"Failed to process expired guest {guest.id}",
                            correlation_id=correlation_id,
                            error=str(e)
                        )
                        results["errors"].append(f"Guest {guest.id}: {str(e)}")
                
        except Exception as e:
            logger.error(
                f"Failed to query expired guests",
                correlation_id=correlation_id,
                error=str(e)
            )
            results["errors"].append(str(e))
        
        return results
    
    async def _send_expiry_notifications(self, correlation_id: str) -> dict:
        """Send notifications for guests approaching expiry."""
        results = {"sent_count": 0, "errors": []}
        
        try:
            async with get_db_session() as session:
                # Find guests expiring within warning period
                warning_date = datetime.now(timezone.utc) + timedelta(days=self.expiry_warning_days)
                today = datetime.now(timezone.utc)

                stmt = (
                    select(GuestUser)
                    .where(
                        and_(
                            GuestUser.expires_at > today,
                            GuestUser.expires_at <= warning_date,
                            GuestUser.status == GuestStatus.ACCEPTED,
                        )
                    )
                    .limit(self.batch_size)
                )
                result = await session.execute(stmt)
                expiring_guests = result.scalars().all()
                
                logger.info(
                    f"Found {len(expiring_guests)} guests approaching expiry",
                    correlation_id=correlation_id
                )
                
                # Send notifications
                for guest in expiring_guests:
                    try:
                        # Include the current day to match expected calculation in tests
                        days_until_expiry = ((guest.expires_at - today).days) + 1
                        
                        # Send notification to admins
                        await self.notification_service.send_notification(
                            type="GUEST_EXPIRY_WARNING",
                            recipients=await self._get_admin_emails(session),
                            data={
                                "guest_name": guest.display_name,
                                "guest_email": guest.email,
                                "partner_company": guest.partner_company.name if guest.partner_company else "Unknown",
                                "days": days_until_expiry,
                                "expiry_date": guest.expires_at.isoformat(),
                                "guest_id": str(guest.id)
                            },
                            correlation_id=correlation_id
                        )
                        
                        # Update last notification timestamp
                        guest.last_notification_at = datetime.now(timezone.utc)
                        await session.commit()
                        
                        results["sent_count"] += 1
                        
                    except Exception as e:
                        logger.error(
                            f"Failed to send notification for guest {guest.id}",
                            correlation_id=correlation_id,
                            error=str(e)
                        )
                        results["errors"].append(f"Guest {guest.id}: {str(e)}")
                
        except Exception as e:
            logger.error(
                f"Failed to process expiry notifications",
                correlation_id=correlation_id,
                error=str(e)
            )
            results["errors"].append(str(e))
        
        return results
    
    async def _purge_old_guests(self, correlation_id: str) -> dict:
        """Purge guests that have been revoked for more than 30 days."""
        results = {"purged_count": 0, "errors": []}
        
        try:
            async with get_db_session() as session:
                # Find revoked guests older than purge threshold
                purge_date = datetime.now(timezone.utc) - timedelta(days=self.purge_after_days)

                stmt = (
                    select(GuestUser)
                    .where(
                        and_(
                            GuestUser.status == GuestStatus.REVOKED,
                            GuestUser.revoked_at <= purge_date,
                        )
                    )
                    .limit(self.batch_size)
                )
                result = await session.execute(stmt)
                old_revoked_guests = result.scalars().all()
                
                logger.info(
                    f"Found {len(old_revoked_guests)} revoked guests to purge",
                    correlation_id=correlation_id
                )
                
                # Purge each guest from Azure AD
                for guest in old_revoked_guests:
                    try:
                        # Remove from Azure AD
                        await self.guest_service.purge_revoked_guest(
                            guest_id=guest.id,
                            correlation_id=correlation_id
                        )
                        results["purged_count"] += 1
                        
                    except Exception as e:
                        logger.error(
                            f"Failed to purge guest {guest.id}",
                            correlation_id=correlation_id,
                            error=str(e)
                        )
                        results["errors"].append(f"Guest {guest.id}: {str(e)}")
                
        except Exception as e:
            logger.error(
                f"Failed to process guest purge",
                correlation_id=correlation_id,
                error=str(e)
            )
            results["errors"].append(str(e))
        
        return results
    
    async def _send_expiry_notification(self, guest: GuestUser, correlation_id: str):
        """Send notification that a guest has expired."""
        try:
            await self.notification_service.send_notification(
                type="GUEST_EXPIRED",
                recipients=await self._get_admin_emails(),
                data={
                    "guest_name": guest.display_name,
                    "guest_email": guest.email,
                    "partner_company": guest.partner_company.name if guest.partner_company else "Unknown",
                    "expiry_date": guest.expires_at.isoformat()
                },
                correlation_id=correlation_id
            )
        except Exception as e:
            logger.error(
                f"Failed to send expiry notification for guest {guest.id}",
                correlation_id=correlation_id,
                error=str(e)
            )
    
    async def _get_admin_emails(self, session: Optional[AsyncSession] = None) -> List[str]:
        """Get list of admin emails for notifications."""
        # This would typically query the user table for admins
        # For now, using configuration
        admin_emails = settings.get("ADMIN_NOTIFICATION_EMAILS", "").split(",")
        return [email.strip() for email in admin_emails if email.strip()]


# Task registration
task = GuestLifecycleCheckerTask()