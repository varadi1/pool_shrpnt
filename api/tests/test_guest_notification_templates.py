"""Tests for guest invitation notification templates."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import PartnerCompany
from api.models.guest import GuestStatus, GuestUser
from api.models.notification import NotificationTemplate
from api.services.guests.guest_service import GuestService


class MockNotificationService:
    """Mock notification service for testing."""

    def __init__(self, session):
        self.session = session

    async def _render_template(self, template: str, variables: dict) -> str:
        """Simple template rendering."""
        result = template
        for key, value in variables.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    async def send_notification(
        self, template_key: str, recipient_email: str, variables: dict, **kwargs
    ):
        """Mock send notification."""
        pass


@pytest.mark.asyncio
async def test_invitation_email_template_rendering(db_session: AsyncSession):
    """Test guest invitation email template rendering with variables."""
    # Create notification template
    template = NotificationTemplate(
        template_key="guest.invitation.en",
        channel="email",
        subject_template="Welcome to poolDRV - {{partner_company}}",
        body_template="""
        Dear {{guest_name}},
        
        You have been invited to join poolDRV by {{inviter_name}} from {{partner_company}}.
        
        Please click the link below to accept the invitation:
        {{accept_link}}
        
        This invitation will expire on {{expiry_date}}.
        
        Best regards,
        poolDRV Team
        """,
        locale="en",
    )
    db_session.add(template)
    await db_session.commit()

    # Test template rendering
    notification_service = MockNotificationService(db_session)

    variables = {
        "guest_name": "John Doe",
        "inviter_name": "Admin User",
        "partner_company": "Test Partner Corp",
        "accept_link": "https://login.microsoftonline.com/redeem?id=test123",
        "expiry_date": "2025-09-08",
    }

    rendered = await notification_service._render_template(template.body_template, variables)

    # Verify all variables replaced
    assert "John Doe" in rendered
    assert "Admin User" in rendered
    assert "Test Partner Corp" in rendered
    assert "https://login.microsoftonline.com/redeem?id=test123" in rendered
    assert "2025-09-08" in rendered
    assert "{{" not in rendered  # No unreplaced variables


@pytest.mark.asyncio
async def test_invitation_teams_template_rendering(db_session: AsyncSession):
    """Test guest invitation Teams notification template."""
    # Create Teams template
    template = NotificationTemplate(
        template_key="guest.invitation.teams.en",
        channel="teams",
        subject_template="New Guest Invitation",
        body_template="""{
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": "Guest invitation for {{guest_email}}",
            "themeColor": "0076D7",
            "sections": [{
                "activityTitle": "Guest Invitation",
                "activitySubtitle": "{{partner_company}}",
                "facts": [
                    {"name": "Guest Email", "value": "{{guest_email}}"},
                    {"name": "Invited By", "value": "{{inviter_name}}"},
                    {"name": "Role", "value": "{{role}}"},
                    {"name": "Expiry", "value": "{{expiry_date}}"}
                ],
                "markdown": true
            }],
            "potentialAction": [{
                "@type": "OpenUri",
                "name": "Accept Invitation",
                "targets": [{
                    "os": "default",
                    "uri": "{{accept_link}}"
                }]
            }]
        }""",
        locale="en",
    )
    db_session.add(template)
    await db_session.commit()

    notification_service = MockNotificationService(db_session)

    variables = {
        "guest_email": "guest@example.com",
        "partner_company": "Partner ABC",
        "inviter_name": "PM User",
        "role": "Partner Expert",
        "expiry_date": "2025-09-08",
        "accept_link": "https://login.microsoftonline.com/redeem?teams",
    }

    rendered = await notification_service._render_template(template.body_template, variables)

    # Verify Teams card format and variables
    assert '"@type": "MessageCard"' in rendered
    assert "guest@example.com" in rendered
    assert "Partner ABC" in rendered
    assert "PM User" in rendered
    assert "Partner Expert" in rendered
    assert "https://login.microsoftonline.com/redeem?teams" in rendered


@pytest.mark.asyncio
async def test_invitation_hungarian_template(db_session: AsyncSession):
    """Test Hungarian language invitation template."""
    # Create Hungarian template
    template = NotificationTemplate(
        template_key="guest.invitation.hu",
        channel="email",
        subject_template="Üdvözöljük a poolDRV-ben - {{partner_company}}",
        body_template="""
        Tisztelt {{guest_name}}!
        
        Ön meghívást kapott a poolDRV rendszerbe {{inviter_name}} felhasználótól ({{partner_company}}).
        
        Kérjük, kattintson az alábbi linkre a meghívás elfogadásához:
        {{accept_link}}
        
        A meghívás lejárati ideje: {{expiry_date}}.
        
        Üdvözlettel,
        poolDRV csapat
        """,
        locale="hu",
    )
    db_session.add(template)
    await db_session.commit()

    notification_service = MockNotificationService(db_session)

    variables = {
        "guest_name": "Kovács János",
        "inviter_name": "Admin Felhasználó",
        "partner_company": "Teszt Partner Kft",
        "accept_link": "https://login.microsoftonline.com/redeem?hu",
        "expiry_date": "2025.09.08",
    }

    rendered = await notification_service._render_template(template.body_template, variables)

    # Verify Hungarian content
    assert "Tisztelt Kovács János!" in rendered
    assert "Teszt Partner Kft" in rendered
    assert "Admin Felhasználó" in rendered
    assert "2025.09.08" in rendered


@pytest.mark.asyncio
async def test_invitation_with_missing_variables(db_session: AsyncSession):
    """Test template rendering with missing variables."""
    template = NotificationTemplate(
        template_key="guest.invitation.test",
        channel="email",
        subject_template="Invitation - {{partner_company}}",
        body_template="Hello {{guest_name}}, invited by {{inviter_name}}. Link: {{accept_link}}",
        locale="en",
    )
    db_session.add(template)
    await db_session.commit()

    notification_service = MockNotificationService(db_session)

    # Missing some variables
    variables = {
        "guest_name": "Test User",
        # "inviter_name" missing
        # "accept_link" missing
    }

    rendered = await notification_service._render_template(template.body_template, variables)

    # Missing variables should remain as placeholders
    assert "Test User" in rendered
    assert "{{inviter_name}}" in rendered
    assert "{{accept_link}}" in rendered


@pytest.mark.asyncio
async def test_invitation_notification_integration(db_session: AsyncSession):
    """Test full invitation notification flow with guest service."""
    # Create partner and templates
    partner = PartnerCompany(
        company_code="NOTIF_PARTNER",
        name="Notification Test Partner",
        short_name="NTP",
    )
    db_session.add(partner)

    email_template = NotificationTemplate(
        template_key="guest.invitation.email.en",
        channel="email",
        subject_template="Welcome {{guest_name}}",
        body_template="Dear {{guest_name}}, click {{accept_link}} to join.",
        locale="en",
    )
    db_session.add(email_template)
    await db_session.commit()

    service = GuestService(db_session)

    # Mock Graph API and notification
    mock_invitation = {
        "id": "notif-inv-123",
        "inviteRedeemUrl": "https://login.microsoftonline.com/redeem?notif",
    }

    with patch.object(service, "_create_b2b_invitation_with_retry", return_value=mock_invitation):
        with patch("api.services.guests.guest_service.NotificationService") as MockNotif:
            mock_notif = AsyncMock()
            mock_notif.queue_notification = AsyncMock()
            MockNotif.return_value = mock_notif

            guest = await service.invite_guest(
                email="notif.test@example.com",
                partner_company_id=partner.id,
                display_name="Notification Test",
                role="partner_viewer",
                invited_by="admin@company.com",
                send_notification=True,
                locale="en",
            )

            # Verify notification was called with correct parameters
            mock_notif.queue_notification.assert_called_once()
            call_args = mock_notif.queue_notification.call_args

            assert call_args.kwargs["template_key"] == "guest.invitation.email.en"
            assert call_args.kwargs["recipients"][0]["email"] == "notif.test@example.com"
            assert "accept_link" in call_args.kwargs["variables"]
            assert (
                call_args.kwargs["variables"]["accept_link"] == mock_invitation["inviteRedeemUrl"]
            )


@pytest.mark.asyncio
async def test_resend_invitation_notification(db_session: AsyncSession):
    """Test resending invitation notification."""
    # Create partner and guest with existing invitation
    partner = PartnerCompany(
        company_code="RESEND_PARTNER",
        name="Resend Test Partner",
        short_name="RTP",
    )
    db_session.add(partner)
    await db_session.commit()

    guest = GuestUser(
        email="resend.test@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
        display_name="Resend Test User",
    )
    db_session.add(guest)
    await db_session.commit()

    from api.models.guest import GuestInvitation

    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="resend-inv-123",
        redeem_url="https://login.microsoftonline.com/redeem?resend",
        sent_at=datetime.now(UTC),
        expires_at=datetime.now(UTC).replace(day=30),
        status="pending",
    )
    db_session.add(invitation)
    await db_session.commit()

    service = GuestService(db_session)

    with patch("api.services.guests.guest_service.NotificationService") as MockNotif:
        mock_notif = AsyncMock()
        mock_notif.queue_notification = AsyncMock()
        MockNotif.return_value = mock_notif

        await service.resend_invitation(guest.id, locale="en")

        # Verify notification sent with existing redeem URL
        mock_notif.queue_notification.assert_called_once()
        call_args = mock_notif.queue_notification.call_args
        assert call_args.kwargs["variables"]["accept_link"] == invitation.redeem_url


@pytest.mark.asyncio
async def test_invitation_with_custom_variables(db_session: AsyncSession):
    """Test invitation template with custom project-specific variables."""
    template = NotificationTemplate(
        template_key="guest.invitation.project",
        channel="email",
        subject_template="Project {{project_name}} - Guest Invitation",
        body_template="""
        Dear {{guest_name}},
        
        You've been invited to project: {{project_name}}
        Contract: {{contract_number}}
        Your role: {{role}}
        Access level: {{access_level}}
        
        Accept here: {{accept_link}}
        """,
        locale="en",
    )
    db_session.add(template)
    await db_session.commit()

    notification_service = MockNotificationService(db_session)

    variables = {
        "guest_name": "Project Guest",
        "project_name": "2025-NEU-001",
        "contract_number": "CT-2025-001",
        "role": "Technical Expert",
        "access_level": "Read/Write",
        "accept_link": "https://login.microsoftonline.com/redeem?project",
    }

    rendered = await notification_service._render_template(template.body_template, variables)

    assert "2025-NEU-001" in rendered
    assert "CT-2025-001" in rendered
    assert "Technical Expert" in rendered
    assert "Read/Write" in rendered


@pytest.mark.asyncio
async def test_bulk_invitation_notifications(db_session: AsyncSession):
    """Test sending notifications for bulk guest invitations."""
    partner = PartnerCompany(
        company_code="BULK_PARTNER",
        name="Bulk Test Partner",
        short_name="BTP",
    )
    db_session.add(partner)

    template = NotificationTemplate(
        template_key="guest.invitation.email.en",
        channel="email",
        subject_template="Invitation",
        body_template="Welcome {{guest_name}}, link: {{accept_link}}",
        locale="en",
    )
    db_session.add(template)
    await db_session.commit()

    service = GuestService(db_session)

    # Test bulk invitations
    guests_data = [
        {"email": "bulk1@example.com", "name": "Bulk User 1"},
        {"email": "bulk2@example.com", "name": "Bulk User 2"},
        {"email": "bulk3@example.com", "name": "Bulk User 3"},
    ]

    notification_calls = []

    for data in guests_data:
        mock_invitation = {
            "id": f"bulk-inv-{data['email']}",
            "inviteRedeemUrl": f"https://login.microsoftonline.com/redeem?{data['email']}",
        }

        with patch.object(
            service, "_create_b2b_invitation_with_retry", return_value=mock_invitation
        ):
            with patch("api.services.guests.guest_service.NotificationService") as MockNotif:
                mock_notif = AsyncMock()
                mock_notif.queue_notification = AsyncMock()
                MockNotif.return_value = mock_notif

                await service.invite_guest(
                    email=data["email"],
                    partner_company_id=partner.id,
                    display_name=data["name"],
                    send_notification=True,
                    locale="en",
                )

                # Track notification calls
                notification_calls.append(mock_notif.queue_notification.called)

    # Verify all notifications sent
    assert all(notification_calls)
    assert len(notification_calls) == 3
