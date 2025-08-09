"""Tests for notification system - Task 1."""
import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.notification import (
    NotificationHistory,
    NotificationLog,
    NotificationQueue,
    NotificationTemplate,
)
from api.services.notifications.graph_email_sender import GraphEmailSender
from api.services.notifications.notification_service import NotificationService


@pytest_asyncio.fixture
async def notification_service(db_session: AsyncSession):
    """Create notification service instance."""
    return NotificationService(db_session)


@pytest_asyncio.fixture
async def sample_template(db_session: AsyncSession):
    """Create a sample notification template."""
    template = NotificationTemplate(
        template_key="deadline.t-3",
        channel="email",
        subject_template="Figyelmeztetés: {{em_name}} határidő közeledik",
        body_template="Tisztelt {{recipient_name}},<br><br>A(z) {{em_name}} megrendelés határideje {{deadline}} napon belül lejár.<br><br>Kérjük, intézkedjen időben.",
        locale="hu-HU",
        active=True,
    )
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)
    return template


@pytest_asyncio.fixture
async def sample_teams_template(db_session: AsyncSession):
    """Create a sample Teams notification template."""
    template = NotificationTemplate(
        template_key="lock.state.changed",
        channel="teams",
        body_template="Lock állapot változás: {{lock_state}} - {{em_name}}",
        teams_card_template={
            "type": "AdaptiveCard",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "Lock állapot változás",
                    "weight": "bolder",
                    "size": "medium",
                },
                {
                    "type": "FactSet",
                    "facts": [
                        {"title": "Megrendelés", "value": "{{em_name}}"},
                        {"title": "Új állapot", "value": "{{lock_state}}"},
                        {"title": "Indok", "value": "{{reason}}"},
                    ],
                },
            ],
        },
        locale="hu-HU",
        active=True,
    )
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)
    return template


class TestNotificationDataModel:
    """Test notification data model and migrations."""

    @pytest.mark.asyncio
    async def test_notification_template_creation(
        self, db_session: AsyncSession, sample_template: NotificationTemplate
    ):
        """Test creating notification template."""
        # Verify template was created
        stmt = select(NotificationTemplate).where(
            NotificationTemplate.template_key == "deadline.t-3"
        )
        result = await db_session.execute(stmt)
        template = result.scalar_one()

        assert template is not None
        assert template.channel == "email"
        assert "{{em_name}}" in template.subject_template
        assert template.locale == "hu-HU"
        assert template.active is True

    @pytest.mark.asyncio
    async def test_notification_queue_creation(
        self, db_session: AsyncSession, sample_template: NotificationTemplate
    ):
        """Test creating notification queue entry."""
        # Create queue entry
        notification = NotificationQueue(
            template_id=sample_template.id,
            recipient_email="test@example.com",
            channel="email",
            variables={"em_name": "TEST-2025-001", "deadline": "3"},
            priority=5,
            status="pending",
        )
        db_session.add(notification)
        await db_session.commit()

        # Verify queue entry
        stmt = select(NotificationQueue).where(NotificationQueue.template_id == sample_template.id)
        result = await db_session.execute(stmt)
        queued = result.scalar_one()

        assert queued is not None
        assert queued.recipient_email == "test@example.com"
        assert queued.variables["em_name"] == "TEST-2025-001"
        assert queued.status == "pending"

    @pytest.mark.asyncio
    async def test_notification_history_deduplication(self, db_session: AsyncSession):
        """Test notification history for de-duplication."""
        event_id = uuid4()
        recipient_id = uuid4()
        dedup_key = hashlib.sha256(
            f"deadline.reminder:{event_id}:{recipient_id}".encode()
        ).hexdigest()[:255]

        # Create history entry
        history = NotificationHistory(
            event_type="deadline.reminder",
            event_id=event_id,
            recipient_id=recipient_id,
            channel="email",
            dedup_key=dedup_key,
        )
        db_session.add(history)
        await db_session.commit()

        # Check if duplicate exists
        stmt = select(NotificationHistory).where(NotificationHistory.dedup_key == dedup_key)
        result = await db_session.execute(stmt)
        existing = result.scalar_one()

        assert existing is not None
        assert existing.event_type == "deadline.reminder"

    @pytest.mark.asyncio
    async def test_notification_log_tracking(self, db_session: AsyncSession):
        """Test notification delivery log."""
        correlation_id = uuid4()

        # Create log entry
        log_entry = NotificationLog(
            notification_type="deadline.t-3",
            recipient_email="test@example.com",
            channel="email",
            delivery_status="sent",
            correlation_id=correlation_id,
        )
        db_session.add(log_entry)
        await db_session.commit()

        # Verify log entry
        stmt = select(NotificationLog).where(NotificationLog.correlation_id == correlation_id)
        result = await db_session.execute(stmt)
        log = result.scalar_one()

        assert log is not None
        assert log.delivery_status == "sent"
        assert log.recipient_email == "test@example.com"


class TestNotificationService:
    """Test notification service core functionality."""

    @pytest.mark.asyncio
    async def test_template_rendering(self, notification_service: NotificationService):
        """Test template variable rendering."""
        template = "Hello {{name}}, your order {{order_id}} is ready."
        variables = {"name": "John Doe", "order_id": "ORD-123"}

        rendered = notification_service.render_template(template, variables)

        assert rendered == "Hello John Doe, your order ORD-123 is ready."

    @pytest.mark.asyncio
    async def test_template_rendering_with_missing_variables(
        self, notification_service: NotificationService
    ):
        """Test template rendering with missing variables."""
        template = "Hello {{name}}, your order {{order_id}} status: {{status}}"
        variables = {"name": "John Doe", "order_id": "ORD-123"}

        with patch("api.services.notifications.notification_service.logger") as mock_logger:
            rendered = notification_service.render_template(template, variables)

            # Should render with unresolved variable
            assert "{{status}}" in rendered
            # Should log warning
            mock_logger.warning.assert_called_once()

    @pytest.mark.asyncio
    async def test_queue_notification(
        self,
        db_session: AsyncSession,
        notification_service: NotificationService,
        sample_template: NotificationTemplate,
    ):
        """Test queuing notifications."""
        recipients = [
            {"id": uuid4(), "email": "user1@example.com", "role": "PARTNER_ADMIN"},
            {"id": uuid4(), "email": "user2@example.com", "role": "NEU_PM"},
        ]
        variables = {"em_name": "TEST-2025-001", "deadline": "3"}

        queued_ids = await notification_service.queue_notification(
            template_key="deadline.t-3",
            recipients=recipients,
            variables=variables,
            priority=3,
        )

        assert len(queued_ids) == 2

        # Verify queued notifications - query the db after commit
        stmt = select(NotificationQueue).where(NotificationQueue.id.in_(queued_ids))
        result = await db_session.execute(stmt)
        notifications = result.scalars().all()

        assert len(notifications) == 2
        assert all(n.status == "pending" for n in notifications)
        assert all(n.priority == 3 for n in notifications)

    @pytest.mark.asyncio
    async def test_deduplication_within_window(
        self,
        db_session: AsyncSession,
        notification_service: NotificationService,
        sample_template: NotificationTemplate,
    ):
        """Test de-duplication within 24-hour window."""
        event_id = uuid4()
        recipient_id = uuid4()
        recipients = [{"id": recipient_id, "email": "user@example.com"}]

        # Queue first notification
        first_ids = await notification_service.queue_notification(
            template_key="deadline.t-3",
            recipients=recipients,
            variables={"em_name": "TEST-001"},
            event_type="deadline.reminder",
            event_id=event_id,
        )

        assert len(first_ids) == 1

        # Try to queue duplicate within window
        duplicate_ids = await notification_service.queue_notification(
            template_key="deadline.t-3",
            recipients=recipients,
            variables={"em_name": "TEST-001"},
            event_type="deadline.reminder",
            event_id=event_id,
        )

        assert len(duplicate_ids) == 0  # Should be de-duplicated

    @pytest.mark.asyncio
    async def test_process_queue_with_retry(
        self,
        db_session: AsyncSession,
        notification_service: NotificationService,
        sample_template: NotificationTemplate,
    ):
        """Test processing queue with retry logic."""
        # Create pending notification
        notification = NotificationQueue(
            template_id=sample_template.id,
            recipient_email="test@example.com",
            channel="email",
            variables={"em_name": "TEST-001"},
            status="pending",
            scheduled_for=datetime.now(UTC),
        )
        db_session.add(notification)
        await db_session.commit()

        # Mock sending to fail first time
        with patch.object(notification_service, "_send_notification", side_effect=[False, True]):
            # First attempt - should fail and retry
            stats1 = await notification_service.process_queue(batch_size=1)
            assert stats1["processed"] == 1
            assert stats1["sent"] == 0

            # Check retry was scheduled
            await db_session.refresh(notification)
            assert notification.retry_count == 1
            assert notification.status == "pending"
            assert notification.scheduled_for > datetime.now(UTC)

            # Update scheduled time for immediate retry
            notification.scheduled_for = datetime.now(UTC)
            await db_session.commit()

            # Second attempt - should succeed
            stats2 = await notification_service.process_queue(batch_size=1)
            assert stats2["processed"] == 1
            assert stats2["sent"] == 1

    @pytest.mark.asyncio
    async def test_delivery_statistics(
        self,
        db_session: AsyncSession,
        notification_service: NotificationService,
    ):
        """Test getting delivery statistics."""
        # Create test log entries
        now = datetime.now(UTC)

        for status, channel in [
            ("delivered", "email"),
            ("delivered", "email"),
            ("delivered", "teams"),
            ("failed", "email"),
            ("sent", "teams"),
        ]:
            log = NotificationLog(
                notification_type="test",
                recipient_email="test@example.com",
                channel=channel,
                delivery_status=status,
                sent_at=now - timedelta(hours=1),
            )
            db_session.add(log)

        await db_session.commit()

        # Get statistics
        stats = await notification_service.get_delivery_stats(hours=24)

        assert stats["total"] == 5
        assert stats["by_status"]["delivered"] == 3
        assert stats["by_status"]["failed"] == 1
        assert stats["by_channel"]["email"] == 3
        assert stats["by_channel"]["teams"] == 2
        assert stats["success_rate"] == 60.0  # 3/5 * 100


class TestGraphEmailSender:
    """Test Graph API email sender."""

    @pytest.fixture
    def mock_auth_service(self):
        """Create mock auth service."""
        auth_service = MagicMock()
        auth_service.get_graph_client = MagicMock()
        return auth_service

    @pytest.fixture
    def email_sender(self, mock_auth_service):
        """Create email sender instance."""
        return GraphEmailSender(mock_auth_service)

    @pytest.mark.asyncio
    async def test_send_email_success(self, email_sender: GraphEmailSender, mock_auth_service):
        """Test successful email sending."""
        # Mock Graph client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 202  # Accepted

        mock_auth_service.get_graph_client.return_value.__aenter__.return_value = mock_client

        with patch.object(
            email_sender.retry_adapter,
            "execute_with_retry",
            return_value=mock_response,
        ):
            result = await email_sender.send_email(
                recipient="test@example.com",
                subject="Test Subject",
                body_html="<p>Test Body</p>",
                correlation_id=uuid4(),
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_send_email_with_attachments(
        self, email_sender: GraphEmailSender, mock_auth_service
    ):
        """Test sending email with attachments."""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 202

        mock_auth_service.get_graph_client.return_value.__aenter__.return_value = mock_client

        attachments = [
            {
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": "report.pdf",
                "contentType": "application/pdf",
                "contentBytes": "base64_encoded_content",
            }
        ]

        with patch.object(
            email_sender.retry_adapter,
            "execute_with_retry",
            return_value=mock_response,
        ) as mock_execute:
            result = await email_sender.send_email(
                recipient="test@example.com",
                subject="Report",
                body_html="<p>See attached report</p>",
                attachments=attachments,
            )

            assert result is True
            # Verify attachments were included
            call_args = mock_execute.call_args
            assert "attachments" in call_args[1]["json"]["message"]

    @pytest.mark.asyncio
    async def test_send_notification_email_from_queue(
        self,
        email_sender: GraphEmailSender,
        mock_auth_service,
        sample_template: NotificationTemplate,
        notification_service: NotificationService,
    ):
        """Test sending notification from queue entry."""
        notification = NotificationQueue(
            id=uuid4(),
            template_id=sample_template.id,
            recipient_email="test@example.com",
            channel="email",
            variables={
                "em_name": "TEST-2025-001",
                "deadline": "3",
                "recipient_name": "John Doe",
            },
            priority=2,
        )

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 202

        mock_auth_service.get_graph_client.return_value.__aenter__.return_value = mock_client

        with patch.object(
            email_sender.retry_adapter,
            "execute_with_retry",
            return_value=mock_response,
        ):
            result = await email_sender.send_notification_email(
                notification, sample_template, notification_service
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_batch_email_sending(self, email_sender: GraphEmailSender, mock_auth_service):
        """Test batch email sending."""
        messages = [
            {
                "message": {
                    "subject": f"Test {i}",
                    "body": {"contentType": "HTML", "content": f"<p>Test {i}</p>"},
                    "toRecipients": [{"emailAddress": {"address": f"user{i}@example.com"}}],
                }
            }
            for i in range(25)  # More than 20 to test batching
        ]

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "responses": [{"id": str(i), "status": 202} for i in range(1, 21)]
        }

        mock_auth_service.get_graph_client.return_value.__aenter__.return_value = mock_client

        with patch.object(
            email_sender.retry_adapter,
            "execute_with_retry",
            return_value=mock_response,
        ) as mock_execute:
            await email_sender.send_batch_emails(messages)

            # Should have made 2 batch calls (20 + 5)
            assert mock_execute.call_count == 2
            # First batch should have 20, second should have 5
            first_call = mock_execute.call_args_list[0]
            assert len(first_call[1]["json"]["requests"]) == 20

    @pytest.mark.asyncio
    async def test_check_delivery_status(self, email_sender: GraphEmailSender, mock_auth_service):
        """Test checking email delivery status."""
        message_id = "test-message-id"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": message_id,
            "subject": "Test Subject",
            "sentDateTime": "2025-01-01T10:00:00Z",
            "isRead": True,
        }
        mock_client.get.return_value = mock_response

        mock_auth_service.get_graph_client.return_value.__aenter__.return_value = mock_client

        status = await email_sender.check_delivery_status(message_id)

        assert status is not None
        assert status["id"] == message_id
        assert status["isRead"] is True

    @pytest.mark.asyncio
    async def test_html_body_creation(self, email_sender: GraphEmailSender):
        """Test HTML body creation with template."""
        content = "<p>This is a test notification.</p>"
        variables = {"em_name": "TEST-001"}

        html_body = email_sender._create_html_body(content, variables)

        assert "<!DOCTYPE html>" in html_body
        assert content in html_body
        assert "poolDRV Értesítés" in html_body
        assert "automatikus értesítés" in html_body
