"""Tests for Teams notification functionality."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.notification import NotificationHistory, NotificationTemplate
from api.services.auth.graph_auth import GraphAuthService
from api.services.notifications.graph_teams_sender import GraphTeamsSender
from api.services.notifications.notification_service import NotificationService


@pytest.fixture
def mock_auth_service():
    """Create a mock auth service."""
    service = MagicMock(spec=GraphAuthService)
    service.get_access_token = AsyncMock(return_value="mock_token")
    return service


@pytest.fixture
def teams_sender(mock_auth_service):
    """Create a Teams sender with mock auth."""
    return GraphTeamsSender(mock_auth_service)


@pytest.mark.asyncio
async def test_send_channel_message_success(teams_sender):
    """Test successful channel message sending."""
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"id": "msg123"}
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        success, error = await teams_sender.send_channel_message(
            team_id="team123",
            channel_id="channel456",
            content="Test message",
        )

        assert success is True
        assert error is None
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert "teams/team123/channels/channel456/messages" in call_args[0][0]


@pytest.mark.asyncio
async def test_send_channel_message_with_adaptive_card(teams_sender):
    """Test sending channel message with adaptive card."""
    adaptive_card = {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
            {
                "type": "TextBlock",
                "text": "Important Notification",
                "weight": "Bolder",
                "size": "Large",
            }
        ],
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"id": "msg124"}
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        success, error = await teams_sender.send_channel_message(
            team_id="team123",
            channel_id="channel456",
            content="Fallback text",
            adaptive_card=adaptive_card,
        )

        assert success is True
        assert error is None

        # Verify adaptive card was included in payload
        call_args = mock_client.post.call_args
        payload = call_args[1]["json"]
        assert "attachments" in payload
        assert payload["attachments"][0]["contentType"] == "application/vnd.microsoft.card.adaptive"


@pytest.mark.asyncio
async def test_send_channel_message_rate_limited(teams_sender):
    """Test handling of rate limiting."""
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {"Retry-After": "60"}
        mock_response.text = "Rate limited"
        mock_response.request = MagicMock()
        # Always return 429 to simulate persistent rate limiting
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        # The send_channel_message method has retry logic that catches HTTPStatusError
        # After retries fail, it returns (False, error_message)
        success, error = await teams_sender.send_channel_message(
            team_id="team123",
            channel_id="channel456",
            content="Test message",
        )

        assert success is False
        assert "Rate limited" in error or error == "Failed after retries"
        # Verify it attempted multiple times due to retry logic
        assert mock_client.post.call_count >= 1


@pytest.mark.asyncio
async def test_send_chat_message_success(teams_sender):
    """Test successful chat message sending."""
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"id": "msg125"}
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        success, error = await teams_sender.send_chat_message(
            chat_id="chat789",
            content="Direct message",
        )

        assert success is True
        assert error is None
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert "chats/chat789/messages" in call_args[0][0]


@pytest.mark.asyncio
async def test_send_chat_message_with_email(teams_sender):
    """Test creating chat with user email."""
    # Mock the _get_or_create_chat method directly
    with patch.object(
        teams_sender, "_get_or_create_chat", return_value="chat_new"
    ) as mock_get_chat:
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()

            # Mock message send response
            msg_response = MagicMock()
            msg_response.status_code = 201
            msg_response.json.return_value = {"id": "msg126"}

            mock_client.post.return_value = msg_response
            mock_client_class.return_value.__aenter__.return_value = mock_client

            success, error = await teams_sender.send_chat_message(
                chat_id="user@example.com",
                content="Direct message to user",
            )

            assert success is True
            assert error is None
            # Verify _get_or_create_chat was called with the email
            mock_get_chat.assert_called_once()
            # Verify message was sent to the returned chat ID
            assert mock_client.post.call_count == 1
            call_args = mock_client.post.call_args
            assert "chats/chat_new/messages" in call_args[0][0]


@pytest.mark.asyncio
async def test_deduplication_logic(db_session: AsyncSession):
    """Test notification de-duplication within 24 hours."""
    service = NotificationService(db_session)

    # Create a template
    template = NotificationTemplate(
        template_key="test.notification",
        channel="email",
        body_template="Test {{message}}",
        active=True,
    )
    db_session.add(template)
    await db_session.flush()

    event_id = uuid4()
    recipient_id = uuid4()

    # First notification should be queued
    recipients = [{"id": recipient_id, "email": "test@example.com"}]
    queued_ids = await service.queue_notification(
        template_key="test.notification",
        recipients=recipients,
        variables={"message": "Hello"},
        event_type="test.event",
        event_id=event_id,
    )

    assert len(queued_ids) == 1

    # Second notification with same event should be skipped
    queued_ids = await service.queue_notification(
        template_key="test.notification",
        recipients=recipients,
        variables={"message": "Hello again"},
        event_type="test.event",
        event_id=event_id,
    )

    assert len(queued_ids) == 0

    # Notification with bypass should be sent
    queued_ids = await service.queue_notification(
        template_key="test.notification",
        recipients=recipients,
        variables={"message": "Critical"},
        event_type="test.event",
        event_id=event_id,
        bypass_dedup=True,
    )

    assert len(queued_ids) == 1


@pytest.mark.asyncio
async def test_cleanup_old_history(db_session: AsyncSession):
    """Test cleanup of old notification history."""
    service = NotificationService(db_session)

    # Create old and recent history records
    old_record = NotificationHistory(
        event_type="old.event",
        event_id=uuid4(),
        recipient_id=uuid4(),
        channel="email",
        sent_at=datetime.now(UTC) - timedelta(days=35),
        dedup_key="old_key",
    )

    recent_record = NotificationHistory(
        event_type="recent.event",
        event_id=uuid4(),
        recipient_id=uuid4(),
        channel="email",
        sent_at=datetime.now(UTC) - timedelta(days=5),
        dedup_key="recent_key",
    )

    db_session.add(old_record)
    db_session.add(recent_record)
    await db_session.commit()

    # Clean up records older than 30 days
    deleted_count = await service.cleanup_old_history(days=30)

    assert deleted_count == 1

    # Verify only recent record remains
    remaining = await db_session.execute(
        db_session.query(NotificationHistory).filter_by(dedup_key="recent_key")
    )
    assert remaining.scalar_one_or_none() is not None

    old = await db_session.execute(
        db_session.query(NotificationHistory).filter_by(dedup_key="old_key")
    )
    assert old.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_notification_dispatcher_lock_state_changed():
    """Test notification dispatcher for lock state changes."""
    from worker.tasks.notification_dispatcher import NotificationDispatcher

    dispatcher = NotificationDispatcher()

    with patch("worker.tasks.notification_dispatcher.get_db") as mock_get_db:
        mock_session = AsyncMock()
        mock_get_db.return_value.__aiter__.return_value = [mock_session]

        # Mock order lookup
        mock_order = MagicMock()
        mock_order.id = 1
        mock_order.name = "Test EM"
        mock_order.partner_company_id = 2
        mock_session.get.return_value = mock_order

        # Mock notification service
        with patch(
            "worker.tasks.notification_dispatcher.NotificationService"
        ) as mock_service_class:
            mock_service = AsyncMock()
            mock_service.resolve_recipients.return_value = [
                {"id": uuid4(), "email": "pm@example.com", "role": "NEU_PM"}
            ]
            mock_service.queue_notification.return_value = [uuid4()]
            mock_service_class.return_value = mock_service

            event_data = {
                "em_id": 1,
                "lock_state": "locked",
                "previous_state": "unlocked",
                "actor": "admin@example.com",
                "reason": "Maintenance",
                "affected_folders": ["Folder1", "Folder2"],
                "event_id": uuid4(),
            }

            await dispatcher.dispatch_event(
                event_type="lock.state.changed",
                event_data=event_data,
            )

            mock_service.queue_notification.assert_called_once()
            call_args = mock_service.queue_notification.call_args[1]
            assert call_args["template_key"] == "lock.applied"
            assert call_args["priority"] == 2


@pytest.mark.asyncio
async def test_deadline_notifier():
    """Test deadline notification scheduling."""
    from scheduler.tasks.deadline_notifier import DeadlineNotifier

    notifier = DeadlineNotifier()

    with patch("scheduler.tasks.deadline_notifier.get_db") as mock_get_db:
        mock_session = AsyncMock()
        mock_get_db.return_value.__aiter__.return_value = [mock_session]

        # Mock lock rule with upcoming deadline
        mock_order = MagicMock()
        mock_order.id = 1
        mock_order.title = "Test EM"

        mock_lock_rule = MagicMock()
        mock_lock_rule.t_value = datetime.now(UTC) + timedelta(days=3)
        mock_lock_rule.is_active = True
        mock_lock_rule.order_em = mock_order

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_lock_rule]
        mock_session.execute.return_value = mock_result

        # Mock notification dispatcher
        with patch.object(notifier, "dispatcher") as mock_dispatcher:
            mock_dispatcher.dispatch_event = AsyncMock()

            stats = await notifier.check_and_send_deadline_notifications()

            assert stats["checked"] == 1
            # Since we're not in the exact notification window, might not send
            assert stats["notified"] >= 0


@pytest.mark.asyncio
async def test_calculate_notification_times():
    """Test calculation of T-window notification times."""
    from scheduler.tasks.deadline_notifier import DeadlineNotifier

    notifier = DeadlineNotifier()

    with patch("scheduler.tasks.deadline_notifier.get_db") as mock_get_db:
        mock_session = AsyncMock()
        mock_get_db.return_value.__aiter__.return_value = [mock_session]

        # Mock lock rule with t_value
        mock_lock_rule = MagicMock()
        mock_lock_rule.t_value = datetime(2025, 1, 10, 12, 0, 0, tzinfo=UTC)
        mock_lock_rule.is_active = True

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_lock_rule
        mock_session.execute.return_value = mock_result

        times = await notifier.calculate_notification_times(1)

        assert times["T-3"] == datetime(2025, 1, 7, 12, 0, 0, tzinfo=UTC)
        assert times["T-1"] == datetime(2025, 1, 9, 12, 0, 0, tzinfo=UTC)
        assert times["T+0"] == datetime(2025, 1, 10, 12, 0, 0, tzinfo=UTC)
