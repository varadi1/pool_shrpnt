"""Guest user management service for Azure AD B2B integration."""

import asyncio
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from api.core.config import settings
from api.core.retry import exponential_backoff_with_jitter
from api.models.contract import PartnerCompany
from api.models.guest import GuestGroupAssignment, GuestInvitation, GuestStatus, GuestUser
from api.models.rbac import Group
from api.services.audit import AuditService
from api.services.auth.graph_auth import get_graph_auth_service
from api.services.notifications.notification_service import NotificationService

logger = logging.getLogger(__name__)


class GuestService:
    """Service for managing guest users through Azure AD B2B."""

    def __init__(self, session: AsyncSession, sync_session: Session | None = None):
        """Initialize guest service.

        Args:
            session: Async database session
            sync_session: Sync database session for audit logging (optional)
        """
        self.session = session
        self.sync_session = sync_session
        self.graph_auth = get_graph_auth_service()
        self.base_url = getattr(settings, "pooldrv_base_url", "https://pooldrv.example.com")
        self.audit_service = AuditService(sync_session) if sync_session else None

    async def invite_guest(
        self,
        email: str,
        partner_company_id: int,
        display_name: str | None = None,
        role: str = "partner_viewer",
        invited_by: str | None = None,
        send_notification: bool = True,
        locale: str = "en",
        correlation_id: str | None = None,
    ) -> GuestUser:
        """Invite a guest user via Azure AD B2B.

        Args:
            email: Guest user email address
            partner_company_id: Partner company ID
            display_name: Guest display name
            role: Guest role for group assignment
            invited_by: User who invited the guest
            send_notification: Whether to send invitation email

        Returns:
            Created or updated GuestUser

        Raises:
            ValueError: If email is invalid or partner company not found
            Exception: If Graph API call fails
        """
        # Validate email
        if not self._validate_email(email):
            raise ValueError(f"Invalid email address: {email}")

        # Verify partner company exists
        partner = await self.session.get(PartnerCompany, partner_company_id)
        if not partner:
            raise ValueError(f"Partner company not found: {partner_company_id}")

        # Check if guest already exists
        result = await self.session.execute(select(GuestUser).where(GuestUser.email == email))
        guest = result.scalar_one_or_none()

        if not guest:
            # Create new guest user
            guest = GuestUser(
                email=email,
                display_name=display_name or email.split("@")[0],
                partner_company_id=partner_company_id,
                status=GuestStatus.PENDING.value,
                created_by=invited_by,
            )
            self.session.add(guest)
            await self.session.flush()

        # Create invitation via Graph API with retry logic
        invitation_result = await self._create_b2b_invitation_with_retry(
            email=email,
            display_name=display_name or guest.display_name,
            send_invitation=False,  # We'll use our own notification system
        )

        # Update guest status
        guest.status = GuestStatus.INVITED.value
        guest.invited_at = datetime.now(UTC)

        # Create invitation record
        invitation = GuestInvitation(
            guest_user_id=guest.id,
            invitation_id=invitation_result.get("id"),
            sent_at=datetime.now(UTC),
            expires_at=datetime.now(UTC) + timedelta(days=30),
            status="pending",
            redeem_url=invitation_result.get("inviteRedeemUrl"),
        )
        self.session.add(invitation)

        # Auto-assign groups based on role and partner
        await self._assign_groups_by_role(
            guest.id,
            partner_company_id,
            role,
            invited_by,
            guest_email=guest.email,
            correlation_id=correlation_id,
        )

        # Send custom notification if requested
        if send_notification:
            await self._send_invitation_notification(
                guest=guest,
                partner=partner,
                locale=locale,
                redeem_url=invitation_result.get("inviteRedeemUrl"),
                inviter=invited_by,
            )

        # Generate correlation ID if not provided
        if not correlation_id:
            correlation_id = str(uuid4())

        # Log audit event
        if self.audit_service:
            self.audit_service.log_guest_event(
                user_id=invited_by or "system",
                guest_id=str(guest.id),
                guest_email=email,
                action="GUEST_INVITED",
                correlation_id=correlation_id,
                partner_company=partner.name,
                invitation_details={
                    "invitation_id": invitation.invitation_id,
                    "redeem_url": invitation.redeem_url,
                    "expires_at": (
                        invitation.expires_at.isoformat() if invitation.expires_at else None
                    ),
                    "role": role,
                },
                success=True,
                metadata={"role": role, "display_name": display_name},
            )
        else:
            # Fallback to logger if no audit service
            logger.info(
                f"Guest invited: {email}",
                extra={
                    "event": "GUEST_INVITED",
                    "correlation_id": correlation_id,
                    "user_id": invited_by or "system",
                    "guest_id": str(guest.id),
                    "guest_email": email,
                    "partner_company": partner.name,
                    "role": role,
                },
            )

        await self.session.commit()
        return guest

    async def _create_b2b_invitation_with_retry(
        self,
        email: str,
        display_name: str,
        send_invitation: bool = False,
        max_retries: int = 3,
    ) -> dict[str, Any]:
        """Create B2B invitation via Graph API with retry logic.

        Args:
            email: Guest email address
            display_name: Guest display name
            send_invitation: Whether Graph should send the invitation
            max_retries: Maximum number of retry attempts

        Returns:
            Graph API response

        Raises:
            Exception: If all retry attempts fail
        """
        invitation_body = {
            "invitedUserEmailAddress": email,
            "invitedUserDisplayName": display_name,
            "inviteRedirectUrl": f"{self.base_url}/welcome",
            "sendInvitationMessage": send_invitation,
        }

        async with self.graph_auth.get_graph_client() as client:
            for attempt in range(max_retries):
                try:
                    response = await client.post(
                        "/invitations",
                        json=invitation_body,
                    )

                    if response.status_code == 201:
                        return response.json()
                    elif response.status_code in [429, 503]:
                        # Rate limited or service unavailable - use exponential backoff
                        retry_after = int(response.headers.get("Retry-After", "60"))
                        wait_time = exponential_backoff_with_jitter(
                            attempt, base_delay=retry_after, max_delay=300
                        )
                        logger.warning(
                            f"Graph API {'rate limit' if response.status_code == 429 else 'service unavailable'} "
                            f"({response.status_code}), waiting {wait_time}s "
                            f"(attempt {attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                    else:
                        error_data = response.json() if response.content else {}
                        error_msg = error_data.get("error", {}).get("message", "Unknown error")
                        raise Exception(f"Graph API error {response.status_code}: {error_msg}")

                except httpx.TimeoutException:
                    if attempt < max_retries - 1:
                        wait_time = exponential_backoff_with_jitter(attempt)
                        logger.warning(
                            f"Graph API timeout, retrying in {wait_time}s "
                            f"(attempt {attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                    else:
                        raise

        raise Exception(f"Failed to create B2B invitation after {max_retries} attempts")

    async def _assign_groups_by_role(
        self,
        guest_user_id: UUID,
        partner_company_id: int,
        role: str,
        assigned_by: str | None,
        guest_email: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        """Automatically assign groups based on guest role and partner company.

        Args:
            guest_user_id: Guest user ID
            partner_company_id: Partner company ID
            role: Guest role
            assigned_by: User who is assigning groups
            guest_email: Guest email for audit logging
            correlation_id: Correlation ID for tracing
        """
        # Define group assignment rules
        group_rules = {
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
            ],
        }

        group_names = group_rules.get(role, [f"partner_{partner_company_id}_viewers"])

        # Batch fetch existing groups
        result = await self.session.execute(
            select(Group).where(Group.display_name.in_(group_names))
        )
        existing_groups = {g.display_name: g for g in result.scalars()}

        # Create missing groups in batch
        groups_to_create = []
        for group_name in group_names:
            if group_name not in existing_groups:
                logger.info(f"Creating new group: {group_name}")
                group = Group(
                    azure_ad_group_id=f"pending-{group_name}",  # Will be updated when synced
                    display_name=group_name,
                    description=f"Auto-created for role {role}",
                )
                self.session.add(group)
                groups_to_create.append(group)
                existing_groups[group_name] = group

        # Flush once for all new groups
        if groups_to_create:
            await self.session.flush()

        # Batch check existing assignments
        group_ids = [g.id for g in existing_groups.values()]
        result = await self.session.execute(
            select(GuestGroupAssignment).where(
                and_(
                    GuestGroupAssignment.guest_user_id == guest_user_id,
                    GuestGroupAssignment.group_id.in_(group_ids),
                    GuestGroupAssignment.removed_at.is_(None),
                )
            )
        )
        existing_assignments = {a.group_id for a in result.scalars()}

        # Create new assignments in batch
        new_assignments = []
        assigned_groups = []
        for group_name in group_names:
            group = existing_groups[group_name]
            if group.id not in existing_assignments:
                assignment = GuestGroupAssignment(
                    guest_user_id=guest_user_id,
                    group_id=group.id,
                    assigned_by=assigned_by or "system",
                )
                self.session.add(assignment)
                new_assignments.append(assignment)
                assigned_groups.append((group_name, group.id))

        # Flush once for all assignments
        if new_assignments:
            await self.session.flush()

            # Log audit events for all new assignments
            if self.audit_service and guest_email:
                if not correlation_id:
                    correlation_id = str(uuid4())

                for group_name, group_id in assigned_groups:
                    self.audit_service.log_guest_event(
                        user_id=assigned_by or "system",
                        guest_id=str(guest_user_id),
                        guest_email=guest_email,
                        action="GUEST_ASSIGNED",
                        correlation_id=correlation_id,
                        group_changes={
                            "group_added": group_name,
                            "group_id": str(group_id),
                            "role": role,
                        },
                        success=True,
                    )
            else:
                logger.info(f"Assigned guest to {len(assigned_groups)} groups")

    async def _send_invitation_notification(
        self,
        guest: GuestUser | None = None,
        partner: PartnerCompany | None = None,
        redeem_url: str | None = None,
        inviter: str | None = None,
        email: str | None = None,
        partner_company_id: int | None = None,
        display_name: str | None = None,
        locale: str = "en",
        correlation_id: str | None = None,
    ) -> None:
        """Send invitation notification using the notification service.

        Args:
            guest: Guest user (optional if email provided)
            partner: Partner company (optional if partner_company_id provided)
            redeem_url: Azure AD invitation redeem URL
            inviter: User who sent the invitation
            email: Email address (alternative to guest)
            partner_company_id: Partner company ID (alternative to partner)
            display_name: Display name
            locale: Locale for template selection
            correlation_id: Correlation ID for tracing
        """
        # Use notification service from Story 3.4
        notification_service = NotificationService(self.session)

        # Get email and partner info
        recipient_email = email or (guest.email if guest else None)
        if not recipient_email:
            logger.error("No email provided for invitation notification")
            return

        if not partner and partner_company_id:
            partner = await self.session.get(PartnerCompany, partner_company_id)

        partner_name = partner.name if partner else "Partner"

        template_key = f"guest.invitation.email.{locale}"

        await notification_service.queue_notification(
            template_key=template_key,
            recipients=[{"email": recipient_email, "id": str(guest.id if guest else "")}],
            variables={
                "guest_name": display_name or (guest.display_name if guest else "Guest"),
                "guest_email": recipient_email,
                "partner_company": partner_name,
                "inviter_name": inviter or "poolDRV Administrator",
                "accept_link": redeem_url,
                "portal_url": self.base_url,
            },
            event_type="GUEST_INVITED",
            event_id=guest.id,
        )

    async def check_invitation_status(
        self, guest_id: UUID, correlation_id: str | None = None
    ) -> dict[str, Any]:
        """Check and update the status of a guest invitation.

        Args:
            guest_id: Guest user ID
            correlation_id: Correlation ID for tracing

        Returns:
            Updated status information
        """
        # Get guest and latest invitation
        guest = await self.session.get(GuestUser, guest_id)
        if not guest:
            raise ValueError(f"Guest not found: {guest_id}")

        result = await self.session.execute(
            select(GuestInvitation)
            .where(GuestInvitation.guest_user_id == guest_id)
            .order_by(GuestInvitation.sent_at.desc())
        )
        invitation = result.first()

        if not invitation:
            return {"status": "no_invitation", "guest_status": guest.status}

        # Check with Graph API if invitation is still pending
        if invitation[0].status == "pending" and invitation[0].invitation_id:
            async with self.graph_auth.get_graph_client() as client:
                try:
                    response = await client.get(f"/invitations/{invitation[0].invitation_id}")
                    if response.status_code == 200:
                        data = response.json()
                        status = data.get("status", "pending").lower()

                        # Update local status if changed
                        if status == "completed":
                            invitation[0].status = "accepted"
                            guest.status = GuestStatus.ACCEPTED.value
                            guest.accepted_at = datetime.now(UTC)
                            guest.azure_ad_id = data.get("invitedUser", {}).get("id")

                            # Generate correlation ID if not provided
                            if not correlation_id:
                                correlation_id = str(uuid4())

                            # Log audit event
                            if self.audit_service:
                                self.audit_service.log_guest_event(
                                    user_id="system",  # System detected the acceptance
                                    guest_id=str(guest_id),
                                    guest_email=guest.email,
                                    action="GUEST_ACCEPTED",
                                    correlation_id=correlation_id,
                                    invitation_details={
                                        "azure_ad_id": guest.azure_ad_id,
                                        "accepted_at": (
                                            guest.accepted_at.isoformat()
                                            if guest.accepted_at
                                            else None
                                        ),
                                    },
                                    success=True,
                                )
                            else:
                                logger.info(
                                    f"Guest accepted invitation: {guest.email}",
                                    extra={
                                        "event": "GUEST_ACCEPTED",
                                        "correlation_id": correlation_id,
                                        "guest_id": str(guest_id),
                                        "guest_email": guest.email,
                                    },
                                )

                            await self.session.commit()

                except httpx.HTTPStatusError as e:
                    logger.error(f"Failed to check invitation status: {e}")

        # Check for expiry
        if invitation[0].expires_at < datetime.now(UTC) and invitation[0].status == "pending":
            invitation[0].status = "expired"
            guest.status = GuestStatus.EXPIRED.value
            await self.session.commit()

        return {
            "status": invitation[0].status,
            "guest_status": guest.status,
            "invitation_id": invitation[0].invitation_id,
            "expires_at": invitation[0].expires_at,
        }

    async def find_guest_by_email(self, email: str) -> GuestUser | None:
        """Find a guest user by email address.

        Args:
            email: Guest email address

        Returns:
            GuestUser if found, None otherwise
        """
        result = await self.session.execute(select(GuestUser).where(GuestUser.email == email))
        return result.scalar_one_or_none()

    async def find_guest_by_azure_id(self, azure_ad_id: str) -> GuestUser | None:
        """Find a guest user by Azure AD ID.

        Args:
            azure_ad_id: Azure AD object ID

        Returns:
            GuestUser if found, None otherwise
        """
        result = await self.session.execute(
            select(GuestUser).where(GuestUser.azure_ad_id == azure_ad_id)
        )
        return result.scalar_one_or_none()

    async def search_guests(
        self,
        email: str | None = None,
        partner_company_id: int | None = None,
        status: GuestStatus | None = None,
        include_expired: bool = False,
    ) -> list[GuestUser]:
        """Search for guest users with filters.

        Args:
            email: Email pattern to search
            partner_company_id: Filter by partner company
            status: Filter by status
            include_expired: Include expired invitations

        Returns:
            List of matching guest users
        """
        query = select(GuestUser)

        conditions = []
        if email:
            conditions.append(GuestUser.email.ilike(f"%{email}%"))
        if partner_company_id:
            conditions.append(GuestUser.partner_company_id == partner_company_id)
        if status:
            conditions.append(GuestUser.status == status)
        if not include_expired:
            conditions.append(GuestUser.status != GuestStatus.EXPIRED.value)

        if conditions:
            query = query.where(and_(*conditions))

        result = await self.session.execute(query.order_by(GuestUser.created_at.desc()))
        return list(result.scalars().all())

    async def update_guest_groups(
        self,
        guest_id: UUID,
        group_ids: list[UUID],
        updated_by: str,
        correlation_id: str | None = None,
    ) -> None:
        """Update group assignments for a guest user.

        Args:
            guest_id: Guest user ID
            group_ids: New list of group IDs
            updated_by: User making the update
            correlation_id: Correlation ID for tracing
        """
        # Get current assignments
        result = await self.session.execute(
            select(GuestGroupAssignment).where(
                and_(
                    GuestGroupAssignment.guest_user_id == guest_id,
                    GuestGroupAssignment.removed_at.is_(None),
                )
            )
        )
        current_assignments = list(result.scalars())
        current_group_ids = {a.group_id for a in current_assignments}

        new_group_ids = set(group_ids)

        # Remove groups no longer assigned
        for assignment in current_assignments:
            if assignment.group_id not in new_group_ids:
                assignment.removed_at = datetime.now(UTC)
                assignment.removed_by = updated_by

        # Add new groups
        for group_id in new_group_ids - current_group_ids:
            assignment = GuestGroupAssignment(
                guest_user_id=guest_id,
                group_id=group_id,
                assigned_by=updated_by,
            )
            self.session.add(assignment)

        # Get guest details for audit logging
        guest = await self.session.get(GuestUser, guest_id)

        # Generate correlation ID if not provided
        if not correlation_id:
            correlation_id = str(uuid4())

        # Log audit event
        if self.audit_service and guest:
            self.audit_service.log_guest_event(
                user_id=updated_by,
                guest_id=str(guest_id),
                guest_email=guest.email,
                action="GUEST_ASSIGNED",
                correlation_id=correlation_id,
                group_changes={
                    "groups_added": [str(g) for g in (new_group_ids - current_group_ids)],
                    "groups_removed": [str(g) for g in (current_group_ids - new_group_ids)],
                    "total_groups": len(new_group_ids),
                },
                success=True,
            )
        else:
            logger.info(
                f"Guest group assignments updated for guest {guest.email if guest else guest_id}",
                extra={
                    "event": "GUEST_ASSIGNED",
                    "correlation_id": correlation_id,
                    "guest_id": str(guest_id),
                    "user_id": updated_by,
                    "groups_added": [str(g) for g in (new_group_ids - current_group_ids)],
                    "groups_removed": [str(g) for g in (current_group_ids - new_group_ids)],
                },
            )

        await self.session.commit()

    async def resend_invitation(
        self,
        guest_id: UUID,
        locale: str = "en",
        correlation_id: str | None = None,
    ) -> None:
        """Resend invitation notification to a guest.

        Args:
            guest_id: Guest user ID
            locale: Locale for notification template
            correlation_id: Correlation ID for tracing
        """
        # Get guest and latest invitation
        guest = await self.session.get(GuestUser, guest_id)
        if not guest:
            raise ValueError(f"Guest not found: {guest_id}")

        # Get latest invitation
        result = await self.session.execute(
            select(GuestInvitation)
            .where(GuestInvitation.guest_user_id == guest_id)
            .order_by(GuestInvitation.sent_at.desc())
            .limit(1)
        )
        invitation = result.scalar_one_or_none()

        if not invitation:
            raise ValueError(f"No invitation found for guest: {guest_id}")

        if invitation.status != "pending":
            raise ValueError(f"Cannot resend invitation with status: {invitation.status}")

        # Send notification
        await self._send_invitation_notification(
            guest=guest,
            email=guest.email,
            redeem_url=invitation.redeem_url,
            partner_company_id=guest.partner_company_id,
            display_name=guest.display_name,
            locale=locale,
            correlation_id=correlation_id,
        )

        logger.info(
            "Guest invitation resent",
            extra={
                "guest_id": str(guest_id),
                "email": guest.email,
                "correlation_id": correlation_id,
            },
        )

    def _validate_email(self, email: str) -> bool:
        """Validate email address format.

        Args:
            email: Email address to validate

        Returns:
            True if valid, False otherwise
        """
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return bool(re.match(pattern, email))

    async def revoke_guest(
        self,
        guest_id: UUID,
        revoked_by: str,
        revocation_reason: str,
        correlation_id: str | None = None,
        idempotent: bool = False,
    ) -> GuestUser:
        """Revoke guest access immediately.

        Removes guest from all Azure AD groups and SharePoint/Teams permissions.
        Implements soft delete - guest remains in database with REVOKED status.

        Args:
            guest_id: Guest user ID to revoke
            revoked_by: User performing the revocation
            revocation_reason: Reason for revocation
            correlation_id: Correlation ID for tracing

        Returns:
            Updated GuestUser with revoked status

        Raises:
            ValueError: If guest not found or already revoked
        """
        # Get guest user
        guest = await self.session.get(GuestUser, guest_id)
        if not guest:
            raise ValueError(f"Guest not found: {guest_id}")

        if guest.status == GuestStatus.REVOKED.value:
            if idempotent:
                # Treat as success in idempotent/bulk flows
                return guest
            raise ValueError(f"Guest already revoked: {guest_id}")

        # Generate correlation ID if not provided
        if not correlation_id:
            correlation_id = str(uuid4())

        # Remove from all Azure AD groups
        await self._remove_from_all_groups(guest, revoked_by, correlation_id)

        # Update guest status (soft delete)
        guest.status = GuestStatus.REVOKED.value
        guest.revoked_at = datetime.now(UTC)
        guest.revoked_by = revoked_by
        guest.revocation_reason = revocation_reason

        # Log GUEST_REVOKED audit event with reason and revoking admin
        if self.audit_service:
            partner_name = None
            try:
                direct_partner = getattr(guest, "partner_company", None)
                name_attr = getattr(direct_partner, "name", None)
                if isinstance(name_attr, str):
                    partner_name = name_attr
            except Exception:
                partner_name = None
            if partner_name is None:
                try:
                    partner = await self.session.get(PartnerCompany, guest.partner_company_id)
                    partner_name = (
                        partner.name
                        if partner and isinstance(getattr(partner, "name", None), str)
                        else None
                    )
                except Exception:
                    partner_name = None
            self.audit_service.log_guest_event(
                user_id=revoked_by,
                guest_id=str(guest_id),
                guest_email=guest.email,
                action="GUEST_REVOKED",
                correlation_id=correlation_id,
                partner_company=partner_name,
                metadata={
                    "reason": revocation_reason,
                    "revoked_at": guest.revoked_at.isoformat() if guest.revoked_at else None,
                    "revoked_by": revoked_by,
                    "partner_company_id": guest.partner_company_id,
                },
                success=True,
            )
        else:
            logger.info(
                f"Guest revoked: {guest.email}",
                extra={
                    "event": "GUEST_REVOKED",
                    "correlation_id": correlation_id,
                    "guest_id": str(guest_id),
                    "guest_email": guest.email,
                    "revoked_by": revoked_by,
                    "reason": revocation_reason,
                },
            )

        await self.session.commit()
        return guest

    async def bulk_revoke_guests(
        self,
        guest_ids: list[UUID],
        revoked_by: str,
        revocation_reason: str,
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        """Revoke multiple guest users in bulk.

        Args:
            guest_ids: List of guest user IDs to revoke
            revoked_by: User performing the revocation
            revocation_reason: Common reason for all revocations
            correlation_id: Correlation ID for tracing

        Returns:
            Dictionary with success/failure counts and details
        """
        explicit_correlation_provided = correlation_id is not None
        if not correlation_id:
            correlation_id = str(uuid4())

        results = {
            "total": len(guest_ids),
            "succeeded": [],
            "failed": [],
            "correlation_id": correlation_id,
        }

        for guest_id in guest_ids:
            try:
                guest = await self.revoke_guest(
                    guest_id=guest_id,
                    revoked_by=revoked_by,
                    revocation_reason=revocation_reason,
                    correlation_id=correlation_id,
                    idempotent=explicit_correlation_provided,
                )
                results["succeeded"].append(
                    {
                        "guest_id": str(guest_id),
                        "email": guest.email,
                    }
                )
            except Exception as e:
                logger.error(
                    f"Failed to revoke guest {guest_id}: {e}",
                    extra={
                        "correlation_id": correlation_id,
                        "guest_id": str(guest_id),
                        "error": str(e),
                    },
                )
                results["failed"].append(
                    {
                        "guest_id": str(guest_id),
                        "error": str(e),
                    }
                )

        # Log bulk operation summary with correlation ID
        if self.audit_service:
            self.audit_service.log_guest_event(
                user_id=revoked_by,
                guest_id="bulk_operation",
                guest_email="multiple",
                action="GUEST_BULK_REVOKED",
                correlation_id=correlation_id,
                metadata={
                    "total": results["total"],
                    "succeeded": len(results["succeeded"]),
                    "failed": len(results["failed"]),
                    "reason": revocation_reason,
                    "succeeded_emails": [r["email"] for r in results["succeeded"]],
                    "failed_ids": [r["guest_id"] for r in results["failed"]],
                },
                success=len(results["failed"]) == 0,
            )

        return results

    async def _remove_from_all_groups(
        self,
        guest: GuestUser,
        removed_by: str,
        correlation_id: str,
    ) -> None:
        """Remove guest from all Azure AD groups and mark assignments as removed.

        Args:
            guest: Guest user to remove from groups
            removed_by: User performing the removal
            correlation_id: Correlation ID for tracing
        """
        # Get all active group assignments
        result = await self.session.execute(
            select(GuestGroupAssignment).where(
                and_(
                    GuestGroupAssignment.guest_user_id == guest.id,
                    GuestGroupAssignment.removed_at.is_(None),
                )
            )
        )
        # Compatible with both real AsyncResult and MagicMock in tests
        scalars_callable = getattr(result, "scalars", None)
        assignments: list[GuestGroupAssignment] = []
        if callable(scalars_callable):
            scalars_obj = scalars_callable()
            if asyncio.iscoroutine(scalars_obj):
                scalars_obj = await scalars_obj
            all_attr = getattr(scalars_obj, "all", None)
            if callable(all_attr):
                items = all_attr()
                if asyncio.iscoroutine(items):
                    items = await items
                assignments = list(items)
            else:
                try:
                    assignments = list(scalars_obj)
                except TypeError:
                    assignments = []
        else:
            assignments = []

        if not assignments:
            logger.info(f"No group assignments found for guest {guest.email}")
            return

        # Remove from Azure AD groups if guest has Azure AD ID
        if guest.azure_ad_id:
            await self._remove_from_azure_ad_groups(
                guest.azure_ad_id,
                [a.group for a in assignments if a.group],
                correlation_id,
            )

        # Mark all assignments as removed in database
        for assignment in assignments:
            assignment.removed_at = datetime.now(UTC)
            assignment.removed_by = removed_by

        logger.info(
            f"Removed guest {guest.email} from {len(assignments)} groups",
            extra={
                "correlation_id": correlation_id,
                "guest_id": str(guest.id),
                "groups_removed": len(assignments),
            },
        )

    async def _remove_from_azure_ad_groups(
        self,
        azure_ad_user_id: str,
        groups: list[Group],
        correlation_id: str,
    ) -> None:
        """Remove user from Azure AD groups via Graph API.

        Args:
            azure_ad_user_id: Azure AD user object ID
            groups: List of groups to remove user from
            correlation_id: Correlation ID for tracing
        """
        async with self.graph_auth.get_graph_client() as client:
            for group in groups:
                if not group.azure_ad_group_id or group.azure_ad_group_id.startswith("pending-"):
                    continue

                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        # Remove member from group
                        response = await client.delete(
                            f"/groups/{group.azure_ad_group_id}/members/{azure_ad_user_id}/$ref"
                        )

                        if response.status_code in [204, 404]:
                            # Success or already removed
                            logger.info(
                                f"Removed user from group {group.display_name}",
                                extra={
                                    "correlation_id": correlation_id,
                                    "group_id": group.azure_ad_group_id,
                                    "user_id": azure_ad_user_id,
                                },
                            )
                            break
                        elif response.status_code in [429, 503]:
                            # Rate limited or service unavailable
                            retry_after = int(response.headers.get("Retry-After", "60"))
                            wait_time = exponential_backoff_with_jitter(
                                attempt, base_delay=retry_after, max_delay=300
                            )
                            logger.warning(
                                f"Graph API rate limit/unavailable, waiting {wait_time}s",
                                extra={
                                    "correlation_id": correlation_id,
                                    "attempt": attempt + 1,
                                    "max_retries": max_retries,
                                },
                            )
                            await asyncio.sleep(wait_time)
                        else:
                            error_data = response.json() if response.content else {}
                            error_msg = error_data.get("error", {}).get("message", "Unknown error")
                            logger.error(
                                f"Failed to remove from group: {error_msg}",
                                extra={
                                    "correlation_id": correlation_id,
                                    "group_id": group.azure_ad_group_id,
                                    "status_code": response.status_code,
                                },
                            )
                            break

                    except httpx.TimeoutException:
                        if attempt < max_retries - 1:
                            wait_time = exponential_backoff_with_jitter(attempt)
                            logger.warning(
                                f"Graph API timeout, retrying in {wait_time}s",
                                extra={
                                    "correlation_id": correlation_id,
                                    "attempt": attempt + 1,
                                },
                            )
                            await asyncio.sleep(wait_time)
                        else:
                            logger.error(
                                f"Failed to remove from group after {max_retries} attempts",
                                extra={
                                    "correlation_id": correlation_id,
                                    "group_id": group.azure_ad_group_id,
                                },
                            )

    async def list_guests_by_partner(
        self,
        partner_company_id: int,
        include_revoked: bool = False,
    ) -> list[GuestUser]:
        """List all guests from a specific partner company.

        Args:
            partner_company_id: Partner company ID
            include_revoked: Whether to include revoked guests

        Returns:
            List of guest users from the partner
        """
        query = select(GuestUser).where(GuestUser.partner_company_id == partner_company_id)

        if not include_revoked:
            query = query.where(GuestUser.status != GuestStatus.REVOKED.value)

        result = await self.session.execute(query.order_by(GuestUser.created_at.desc()))
        scalars_callable = getattr(result, "scalars", None)
        if callable(scalars_callable):
            scalars_obj = scalars_callable()
            if asyncio.iscoroutine(scalars_obj):
                scalars_obj = await scalars_obj
            all_attr = getattr(scalars_obj, "all", None)
            if callable(all_attr):
                items = all_attr()
                if asyncio.iscoroutine(items):
                    items = await items
                return list(items)
            try:
                return list(scalars_obj)
            except TypeError:
                return []
        return []

    async def purge_revoked_guest(
        self,
        guest_id: UUID,
        correlation_id: str | None = None,
    ) -> None:
        """Purge a revoked guest from Azure AD after retention period.

        This should only be called for guests that have been revoked for
        the configured retention period (e.g., 30 days).

        Args:
            guest_id: Guest user ID to purge
            correlation_id: Correlation ID for tracing

        Raises:
            ValueError: If guest not found or not revoked
        """
        guest = await self.session.get(GuestUser, guest_id)
        if not guest:
            raise ValueError(f"Guest not found: {guest_id}")

        if guest.status != GuestStatus.REVOKED.value:
            raise ValueError(f"Guest must be revoked before purging: {guest_id}")

        if not correlation_id:
            correlation_id = str(uuid4())

        # Delete from Azure AD if guest has Azure AD ID
        if guest.azure_ad_id:
            async with self.graph_auth.get_graph_client() as client:
                try:
                    response = await client.delete(f"/users/{guest.azure_ad_id}")
                    if response.status_code in [204, 404]:
                        logger.info(
                            f"Purged guest from Azure AD: {guest.email}",
                            extra={
                                "correlation_id": correlation_id,
                                "guest_id": str(guest_id),
                                "azure_ad_id": guest.azure_ad_id,
                            },
                        )
                except Exception as e:
                    logger.error(
                        f"Failed to purge guest from Azure AD: {e}",
                        extra={
                            "correlation_id": correlation_id,
                            "guest_id": str(guest_id),
                            "error": str(e),
                        },
                    )
                    raise

        # Update status to PURGED
        guest.status = GuestStatus.PURGED.value

        # Log audit event
        # Log GUEST_PURGED audit event with partner company context
        if self.audit_service:
            partner_name = None
            try:
                direct_partner = getattr(guest, "partner_company", None)
                name_attr = getattr(direct_partner, "name", None)
                if isinstance(name_attr, str):
                    partner_name = name_attr
            except Exception:
                partner_name = None
            if partner_name is None:
                try:
                    partner = await self.session.get(PartnerCompany, guest.partner_company_id)
                    partner_name = (
                        partner.name
                        if partner and isinstance(getattr(partner, "name", None), str)
                        else None
                    )
                except Exception:
                    partner_name = None
            self.audit_service.log_guest_event(
                user_id="system",
                guest_id=str(guest_id),
                guest_email=guest.email,
                action="GUEST_PURGED",
                correlation_id=correlation_id,
                partner_company=partner_name,
                metadata={
                    "azure_ad_id": guest.azure_ad_id,
                    "revoked_at": guest.revoked_at.isoformat() if guest.revoked_at else None,
                    "partner_company_id": guest.partner_company_id,
                    "purged_at": datetime.now(UTC).isoformat(),
                },
                success=True,
            )

        await self.session.commit()
