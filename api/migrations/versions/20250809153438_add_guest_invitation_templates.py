"""add guest invitation templates

Revision ID: 20250809153438
Revises: 4eb2033411e9
Create Date: 2025-08-09 15:34:38.000000

"""
from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import uuid4

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20250809153438"
down_revision: str | Sequence[str] | None = "4eb2033411e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add guest invitation notification templates."""

    # Insert guest invitation templates for both English and Hungarian
    op.execute(
        f"""
        INSERT INTO notification_template (
            id, template_key, channel, subject_template, body_template, 
            teams_card_template, locale, active, created_at, updated_at
        )
        VALUES
        -- English email template
        (
            '{uuid4()}',
            'guest.invitation.email.en',
            'email',
            'You have been invited to poolDRV',
            'Dear {{{{guest_name}}}},

You have been invited to join poolDRV by {{{{inviter_name}}}} from {{{{partner_company}}}}.

Please click the link below to accept your invitation and set up your account:
{{{{accept_link}}}}

This invitation will expire in 30 days.

Once you accept the invitation, you will have access to the following resources:
• Teams and SharePoint sites for {{{{partner_company}}}}
• Project documentation and collaboration spaces
• Communication channels with the project team

If you have any questions, please contact your project administrator.

Best regards,
The poolDRV Team

---
poolDRV Portal: {{{{portal_url}}}}',
            NULL,
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        -- Hungarian email template
        (
            '{uuid4()}',
            'guest.invitation.email.hu',
            'email',
            'Meghívás a poolDRV rendszerbe',
            'Kedves {{{{guest_name}}}}!

{{{{inviter_name}}}} meghívta Önt a poolDRV rendszerbe a(z) {{{{partner_company}}}} képviseletében.

Kérjük, kattintson az alábbi linkre a meghívás elfogadásához és fiókja beállításához:
{{{{accept_link}}}}

Ez a meghívó 30 nap múlva lejár.

A meghívás elfogadását követően hozzáférést kap az alábbi erőforrásokhoz:
• Teams és SharePoint oldalak a(z) {{{{partner_company}}}} számára
• Projekt dokumentáció és együttműködési terek
• Kommunikációs csatornák a projekt csapattal

Ha bármilyen kérdése van, kérjük, forduljon a projekt adminisztrátorhoz.

Üdvözlettel,
A poolDRV csapat

---
poolDRV Portál: {{{{portal_url}}}}',
            NULL,
            'hu-HU',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        -- English Teams template
        (
            '{uuid4()}',
            'guest.invitation.teams.en',
            'teams',
            NULL,
            'You have been invited to poolDRV',
            '{{"type": "AdaptiveCard", "version": "1.4", "body": [{{"type": "TextBlock", "text": "poolDRV Guest Invitation", "weight": "bolder", "size": "large"}}, {{"type": "TextBlock", "text": "Dear {{{{guest_name}}}},", "wrap": true}}, {{"type": "TextBlock", "text": "You have been invited to join poolDRV by {{{{inviter_name}}}} from {{{{partner_company}}}}.", "wrap": true}}, {{"type": "TextBlock", "text": "Resources you will have access to:", "weight": "bolder", "spacing": "medium"}}, {{"type": "TextBlock", "text": "• Teams and SharePoint sites\\n• Project documentation\\n• Collaboration spaces", "wrap": true}}, {{"type": "TextBlock", "text": "This invitation expires in 30 days.", "wrap": true, "color": "attention", "spacing": "medium"}}], "actions": [{{"type": "Action.OpenUrl", "title": "Accept Invitation", "url": "{{{{accept_link}}}}", "style": "positive"}}, {{"type": "Action.OpenUrl", "title": "Open Portal", "url": "{{{{portal_url}}}}"}}]}}',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        -- Hungarian Teams template
        (
            '{uuid4()}',
            'guest.invitation.teams.hu',
            'teams',
            NULL,
            'Meghívás a poolDRV rendszerbe',
            '{{"type": "AdaptiveCard", "version": "1.4", "body": [{{"type": "TextBlock", "text": "poolDRV Vendég Meghívó", "weight": "bolder", "size": "large"}}, {{"type": "TextBlock", "text": "Kedves {{{{guest_name}}}}!", "wrap": true}}, {{"type": "TextBlock", "text": "{{{{inviter_name}}}} meghívta Önt a poolDRV rendszerbe a(z) {{{{partner_company}}}} képviseletében.", "wrap": true}}, {{"type": "TextBlock", "text": "Hozzáférést kap:", "weight": "bolder", "spacing": "medium"}}, {{"type": "TextBlock", "text": "• Teams és SharePoint oldalakhoz\\n• Projekt dokumentációhoz\\n• Együttműködési terekhez", "wrap": true}}, {{"type": "TextBlock", "text": "Ez a meghívó 30 nap múlva lejár.", "wrap": true, "color": "attention", "spacing": "medium"}}], "actions": [{{"type": "Action.OpenUrl", "title": "Meghívás Elfogadása", "url": "{{{{accept_link}}}}", "style": "positive"}}, {{"type": "Action.OpenUrl", "title": "Portál Megnyitása", "url": "{{{{portal_url}}}}"}}]}}',
            'hu-HU',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        );
    """
    )


def downgrade() -> None:
    """Remove guest invitation templates."""
    op.execute(
        """
        DELETE FROM notification_template 
        WHERE template_key LIKE 'guest.invitation%';
    """
    )
