"""add_cr_notification_templates

Revision ID: 4eb2033411e9
Revises: fe4b8845e25c
Create Date: 2025-08-09 14:52:18.532222

"""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import uuid4

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4eb2033411e9"
down_revision: str | Sequence[str] | None = "fe4b8845e25c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add CR notification templates to notification_template table."""

    # Insert CR notification templates - unique keys for each channel
    op.execute(
        f"""
        INSERT INTO notification_template (id, template_key, channel, subject_template, body_template, locale, active, created_at, updated_at)
        VALUES
        (
            '{uuid4()}',
            'cr_opened.email',
            'email',
            'CR Opened: {{{{em_name}}}} - {{{{scope}}}} folders unlocked',
            'A Change Request has been opened for EM {{{{em_name}}}} (ID: {{{{em_id}}}}).
            
Scope: {{{{scope}}}} folders
Reason: {{{{reason}}}}
Duration: {{{{duration_hours}}}} hours
Expires at: {{{{expires_at}}}}

The affected folders have been temporarily unlocked for write access.

CR ID: {{{{cr_id}}}}',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        (
            '{uuid4()}',
            'cr_closed.email',
            'email',
            'CR Closed: {{{{em_name}}}} - {{{{scope}}}} folders re-locked',
            'A Change Request has been manually closed for EM {{{{em_name}}}} (ID: {{{{em_id}}}}).
            
Scope: {{{{scope}}}} folders
Original reason: {{{{reason}}}}
Close reason: {{{{close_reason}}}}
Closed by: {{{{closed_by}}}}

The affected folders have been re-locked to read-only access.

CR ID: {{{{cr_id}}}}',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        (
            '{uuid4()}',
            'cr_expired.email',
            'email',
            'CR Expired: {{{{em_name}}}} - {{{{scope}}}} folders automatically re-locked',
            'A Change Request has expired for EM {{{{em_name}}}} (ID: {{{{em_id}}}}).
            
Scope: {{{{scope}}}} folders
Original reason: {{{{reason}}}}
Created at: {{{{created_at}}}}
Expired at: {{{{expires_at}}}}

The affected folders have been automatically re-locked to read-only access after the 48-hour period.

CR ID: {{{{cr_id}}}}',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        (
            '{uuid4()}',
            'cr_opened.teams',
            'teams',
            NULL,
            '**Change Request Opened**

EM: {{{{em_name}}}} ({{{{em_id}}}})
Scope: {{{{scope}}}} folders
Reason: {{{{reason}}}}
Duration: {{{{duration_hours}}}} hours
Expires: {{{{expires_at}}}}

The folders are now unlocked for editing.',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        (
            '{uuid4()}',
            'cr_closed.teams',
            'teams',
            NULL,
            '**Change Request Closed**

EM: {{{{em_name}}}} ({{{{em_id}}}})
Scope: {{{{scope}}}} folders
Close reason: {{{{close_reason}}}}

The folders are now locked again.',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        ),
        (
            '{uuid4()}',
            'cr_expired.teams',
            'teams',
            NULL,
            '**Change Request Expired**

EM: {{{{em_name}}}} ({{{{em_id}}}})
Scope: {{{{scope}}}} folders

The 48-hour period has ended. The folders are now locked.',
            'en-US',
            true,
            '{datetime.now(UTC).isoformat()}',
            '{datetime.now(UTC).isoformat()}'
        );
    """
    )


def downgrade() -> None:
    """Remove CR notification templates."""
    op.execute(
        """
        DELETE FROM notification_template 
        WHERE template_key LIKE 'cr_%';
    """
    )
