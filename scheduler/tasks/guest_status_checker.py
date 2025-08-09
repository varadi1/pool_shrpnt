"""
Guest Status Checker Task

Polls Microsoft Graph API to check guest invitation acceptance status
and updates local database accordingly. Runs every 5 minutes with distributed lock.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import redis.asyncio as redis
from celery import Task
import uuid
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from api.core.config import settings
from api.models.guest import GuestUser, GuestInvitation, GuestStatus, GuestGroupAssignment
from api.services.guests.guest_service import GuestService
from api.services.sharepoint.graph_client import get_graph_client
from api.services.audit import AuditService
from api.utils.distributed_lock import acquire_scheduler_lock
from scheduler.app import app

logger = logging.getLogger(__name__)

# Create async engine for the scheduler
engine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class GuestStatusChecker:
    """Checks and updates guest invitation statuses."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.graph_client = None
        self.guest_service = None
        self.audit_service = AuditService(db)
        
    async def initialize(self):
        """Initialize services that require async setup."""
        self.graph_client = await get_graph_client()
        self.guest_service = GuestService(self.db)
        
    async def check_pending_invitations(self) -> int:
        """
        Check all pending guest invitations for status updates.
        
        Returns:
            Number of invitations processed
        """
        processed_count = 0
        
        try:
            # Get all pending invitations
            query = select(GuestInvitation).where(
                GuestInvitation.status.in_([GuestStatus.PENDING, GuestStatus.INVITED])
            )
            result = await self.db.execute(query)
            invitations = result.scalars().all()
            
            logger.info(f"Found {len(invitations)} pending invitations to check")
            
            for invitation in invitations:
                try:
                    await self.process_invitation(invitation)
                    processed_count += 1
                except Exception as e:
                    logger.error(f"Error processing invitation {invitation.id}: {str(e)}")
                    
            await self.db.commit()
            
        except Exception as e:
            logger.error(f"Error checking pending invitations: {str(e)}")
            await self.db.rollback()
            
        return processed_count
    
    async def process_invitation(self, invitation: GuestInvitation):
        """
        Process a single invitation - check status and update if changed.
        
        Args:
            invitation: The invitation to process
        """
        guest = await self.db.get(GuestUser, invitation.guest_user_id)
        if not guest:
            logger.error(f"Guest user not found for invitation {invitation.id}")
            return
            
        # Check if invitation has expired (30 days)
        expiry_date = invitation.sent_at + timedelta(days=30)
        if datetime.now(timezone.utc) > expiry_date:
            await self.handle_expired_invitation(invitation, guest)
            return
            
        # Check Graph API for user status if we have an Azure AD ID
        if guest.azure_ad_id:
            try:
                # Get user from Graph API
                user_data = await self.graph_client.users.by_user_id(guest.azure_ad_id).get()
                
                if user_data:
                    # User exists in Azure AD - invitation was accepted
                    await self.handle_accepted_invitation(invitation, guest)
                    
            except Exception as e:
                # User not found or other error - check the specific error
                if "ResourceNotFound" in str(e):
                    # User doesn't exist yet - invitation still pending
                    logger.debug(f"Guest {guest.email} has not accepted invitation yet")
                else:
                    logger.error(f"Error checking Graph API for guest {guest.email}: {str(e)}")
                    
    async def handle_accepted_invitation(self, invitation: GuestInvitation, guest: GuestUser):
        """
        Handle an accepted invitation - update status and assign groups.
        
        Args:
            invitation: The accepted invitation
            guest: The guest user
        """
        if invitation.status == GuestStatus.ACCEPTED:
            # Already processed
            return
            
        logger.info(f"Guest {guest.email} has accepted invitation")
        
        # Update invitation status
        invitation.status = GuestStatus.ACCEPTED
        invitation.accepted_at = datetime.now(timezone.utc)
        
        # Update guest status
        guest.status = GuestStatus.ACCEPTED
        guest.accepted_at = invitation.accepted_at
        
        # Trigger group assignments
        await self.assign_guest_groups(guest)
        
        # Log audit event
        await self.audit_service.log_guest_event(
            event_type="GUEST_ACCEPTED",
            guest_id=guest.id,
            actor_id="system",
            metadata={
                "email": guest.email,
                "partner_company_id": guest.partner_company_id,
                "accepted_at": invitation.accepted_at.isoformat()
            }
        )
        
        await self.db.commit()
        
    async def handle_expired_invitation(self, invitation: GuestInvitation, guest: GuestUser):
        """
        Handle an expired invitation.
        
        Args:
            invitation: The expired invitation
            guest: The guest user
        """
        if invitation.status == GuestStatus.EXPIRED:
            # Already marked as expired
            return
            
        logger.info(f"Invitation for guest {guest.email} has expired")
        
        # Update invitation status
        invitation.status = GuestStatus.EXPIRED
        invitation.expires_at = datetime.now(timezone.utc)
        
        # Update guest status
        guest.status = GuestStatus.EXPIRED
        
        # Log audit event
        await self.audit_service.log_guest_event(
            event_type="GUEST_INVITATION_EXPIRED",
            guest_id=guest.id,
            actor_id="system",
            metadata={
                "email": guest.email,
                "partner_company_id": guest.partner_company_id,
                "sent_at": invitation.sent_at.isoformat(),
                "expired_at": invitation.expires_at.isoformat()
            }
        )
        
        await self.db.commit()
        
    async def assign_guest_groups(self, guest: GuestUser):
        """
        Assign the guest to appropriate groups based on their role and partner company.
        
        Args:
            guest: The guest user to assign groups to
        """
        try:
            # Get group assignment rules based on role and partner
            groups_to_assign = self.get_groups_for_assignment(
                partner_company_id=guest.partner_company_id,
                role=guest.role
            )
            
            for group_id in groups_to_assign:
                # Check if assignment already exists
                existing = await self.db.execute(
                    select(GuestGroupAssignment).where(
                        and_(
                            GuestGroupAssignment.guest_user_id == guest.id,
                            GuestGroupAssignment.group_id == group_id
                        )
                    )
                )
                
                if not existing.scalar_one_or_none():
                    # Create new assignment
                    assignment = GuestGroupAssignment(
                        guest_user_id=guest.id,
                        group_id=group_id,
                        assigned_at=datetime.now(timezone.utc),
                        assigned_by="system"
                    )
                    self.db.add(assignment)
                    
                    # Add user to Azure AD group
                    try:
                        await self.add_user_to_azure_group(guest.azure_ad_id, group_id)
                    except Exception as e:
                        logger.error(f"Failed to add user {guest.email} to Azure group {group_id}: {str(e)}")
                    
                    # Log audit event
                    await self.audit_service.log_guest_event(
                        event_type="GUEST_ASSIGNED",
                        guest_id=guest.id,
                        actor_id="system",
                        metadata={
                            "group_id": group_id,
                            "email": guest.email,
                            "partner_company_id": guest.partner_company_id
                        }
                    )
                    
            await self.db.commit()
            logger.info(f"Assigned {len(groups_to_assign)} groups to guest {guest.email}")
            
        except Exception as e:
            logger.error(f"Error assigning groups to guest {guest.email}: {str(e)}")
            await self.db.rollback()
            
    def get_groups_for_assignment(self, partner_company_id: str, role: str) -> List[str]:
        """
        Determine which groups to assign based on partner and role.
        
        Args:
            partner_company_id: The partner company ID
            role: The guest's role
            
        Returns:
            List of group IDs to assign
        """
        # This should match the logic in guest_service.py
        GROUP_ASSIGNMENT_RULES = {
            "partner_expert": [
                "experts_group",
                f"partner_{partner_company_id}_experts",
            ],
            "partner_admin": [
                "partner_admins",
                f"partner_{partner_company_id}_admins",
            ],
            "partner_viewer": [
                f"partner_{partner_company_id}_viewers",
            ],
            "neu_pm": [
                "neu_project_managers",
            ]
        }
        
        return GROUP_ASSIGNMENT_RULES.get(role, [])
        
    async def add_user_to_azure_group(self, user_id: str, group_id: str):
        """
        Add a user to an Azure AD group via Graph API.
        
        Args:
            user_id: The Azure AD user ID
            group_id: The Azure AD group ID
        """
        try:
            # Add member to group
            member_data = {
                "@odata.id": f"https://graph.microsoft.com/v1.0/directoryObjects/{user_id}"
            }
            
            await self.graph_client.groups.by_group_id(group_id).members.ref.post(member_data)
            logger.info(f"Added user {user_id} to Azure AD group {group_id}")
            
        except Exception as e:
            # Check if already a member
            if "One or more added object references already exist" in str(e):
                logger.debug(f"User {user_id} is already a member of group {group_id}")
            else:
                raise


@app.task(name="guest_status_checker")
def check_guest_status() -> dict:
    """
    Celery task to check guest invitation statuses.
    Runs every 5 minutes with distributed lock.
    
    Returns:
        Dictionary with task execution results
    """
    task_id = str(uuid.uuid4())
    return asyncio.run(_check_guest_status_async(task_id))


async def _check_guest_status_async(task_id: str) -> dict:
    """
    Async implementation of the guest status checker task.
    
    Args:
        task_id: The task ID
        
    Returns:
        Dictionary with task execution results
    """
    redis_client = None
    lock_acquired = False
    
    try:
        # Connect to Redis for distributed lock
        redis_client = await redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        
        # Try to acquire distributed lock
        lock_acquired = await acquire_scheduler_lock(
            redis_client,
            lock_key="guest_status_checker",
            worker_id=task_id,
            ttl_seconds=240  # 4 minutes (task runs every 5 minutes)
        )
        
        if not lock_acquired:
            logger.info("Another worker is already checking guest statuses, skipping")
            return {
                "status": "skipped",
                "reason": "lock_not_acquired"
            }
            
        # Create database session
        async with AsyncSessionLocal() as db:
            # Initialize checker
            checker = GuestStatusChecker(db)
            await checker.initialize()
            
            # Check pending invitations
            processed_count = await checker.check_pending_invitations()
            
            logger.info(f"Guest status check completed. Processed {processed_count} invitations")
            
            return {
                "status": "success",
                "invitations_processed": processed_count,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
    except Exception as e:
        logger.error(f"Error in guest status checker task: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    finally:
        # Release lock and close Redis connection
        if redis_client and lock_acquired:
            try:
                await redis_client.delete("guest_status_checker")
            except Exception as e:
                logger.error(f"Error releasing lock: {str(e)}")
                
        if redis_client:
            await redis_client.close()


# Schedule the task to run every 5 minutes
app.conf.beat_schedule.update({
    'check-guest-status': {
        'task': 'guest_status_checker',
        'schedule': 300.0,  # 5 minutes in seconds
        'options': {
            'expires': 240,  # Expire after 4 minutes to avoid overlap
        }
    },
})