"""Teams notification sender using Microsoft Graph API."""

import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import httpx

from api.core.config import settings
from api.core.retry import RetryConfig, retry_async
from api.models.notification import NotificationLog
from api.services.auth.graph_auth import GraphAuthService

logger = logging.getLogger(__name__)


class GraphTeamsSender:
    """Service for sending Teams messages via Microsoft Graph API."""

    def __init__(self, auth_service: GraphAuthService):
        """Initialize Teams sender with Graph auth service."""
        self.auth_service = auth_service
        self.graph_base_url = "https://graph.microsoft.com/v1.0"

    async def send_channel_message(
        self,
        team_id: str,
        channel_id: str,
        content: str,
        content_type: str = "html",
        adaptive_card: dict[str, Any] | None = None,
        correlation_id: UUID | None = None,
    ) -> tuple[bool, str | None]:
        """Send a message to a Teams channel.

        Args:
            team_id: Team ID
            channel_id: Channel ID
            content: Message content
            content_type: Content type (html or text)
            adaptive_card: Optional adaptive card JSON
            correlation_id: Correlation ID for tracing

        Returns:
            Tuple of (success, error_message)
        """
        if not correlation_id:
            correlation_id = uuid4()

        logger.info(
            "Sending Teams channel message",
            extra={
                "correlation_id": str(correlation_id),
                "team_id": team_id,
                "channel_id": channel_id,
            },
        )

        async def _send_message() -> tuple[bool, str | None]:
            try:
                # Get access token
                access_token = await self.auth_service.get_access_token()

                # Build message payload
                message_payload = self._build_channel_message(content, content_type, adaptive_card)

                # Send via Graph API
                url = f"{self.graph_base_url}/teams/{team_id}/channels/{channel_id}/messages"

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        url,
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json",
                        },
                        json=message_payload,
                    )

                    if response.status_code == 201:
                        logger.info(
                            "Teams channel message sent successfully",
                            extra={
                                "correlation_id": str(correlation_id),
                                "message_id": response.json().get("id"),
                            },
                        )
                        return True, None
                    elif response.status_code == 429:
                        # Rate limiting - extract retry after
                        retry_after = response.headers.get("Retry-After", "60")
                        logger.warning(
                            f"Graph API rate limit hit, retry after {retry_after}s",
                            extra={"correlation_id": str(correlation_id)},
                        )
                        raise httpx.HTTPStatusError(
                            f"Rate limited, retry after {retry_after}s",
                            request=response.request,
                            response=response,
                        )
                    else:
                        error_msg = f"Graph API error: {response.status_code} - {response.text}"
                        logger.error(error_msg, extra={"correlation_id": str(correlation_id)})
                        return False, error_msg

            except httpx.TimeoutException as e:
                error_msg = f"Timeout sending Teams message: {str(e)}"
                logger.error(error_msg, extra={"correlation_id": str(correlation_id)})
                raise
            except Exception as e:
                error_msg = f"Error sending Teams message: {str(e)}"
                logger.error(
                    error_msg, extra={"correlation_id": str(correlation_id), "error": str(e)}
                )
                return False, error_msg

        # Retry with exponential backoff
        config = RetryConfig(
            max_attempts=3,
            initial_delay=1.0,
            max_delay=30.0,
            retry_on=(httpx.TimeoutException, httpx.HTTPStatusError),
        )
        try:
            return await retry_async(_send_message, config=config)
        except Exception:
            # If all retries failed, return failure
            return False, "Failed after retries"

    async def send_chat_message(
        self,
        chat_id: str,
        content: str,
        content_type: str = "html",
        adaptive_card: dict[str, Any] | None = None,
        correlation_id: UUID | None = None,
    ) -> tuple[bool, str | None]:
        """Send a direct message to a Teams chat.

        Args:
            chat_id: Chat ID or user principal name
            content: Message content
            content_type: Content type (html or text)
            adaptive_card: Optional adaptive card JSON
            correlation_id: Correlation ID for tracing

        Returns:
            Tuple of (success, error_message)
        """
        if not correlation_id:
            correlation_id = uuid4()

        logger.info(
            "Sending Teams chat message",
            extra={
                "correlation_id": str(correlation_id),
                "chat_id": chat_id,
            },
        )

        async def _send_message() -> tuple[bool, str | None]:
            try:
                # Get access token
                access_token = await self.auth_service.get_access_token()

                # Build message payload
                message_payload = self._build_chat_message(content, content_type, adaptive_card)

                # Send via Graph API
                # If chat_id looks like an email, create a chat first
                final_chat_id = chat_id
                if "@" in chat_id:
                    final_chat_id = await self._get_or_create_chat(chat_id, access_token)
                    if not final_chat_id:
                        return False, "Failed to create chat with user"

                url = f"{self.graph_base_url}/chats/{final_chat_id}/messages"

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        url,
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json",
                        },
                        json=message_payload,
                    )

                    if response.status_code == 201:
                        logger.info(
                            "Teams chat message sent successfully",
                            extra={
                                "correlation_id": str(correlation_id),
                                "message_id": response.json().get("id"),
                            },
                        )
                        return True, None
                    elif response.status_code == 429:
                        # Rate limiting
                        retry_after = response.headers.get("Retry-After", "60")
                        logger.warning(
                            f"Graph API rate limit hit, retry after {retry_after}s",
                            extra={"correlation_id": str(correlation_id)},
                        )
                        raise httpx.HTTPStatusError(
                            f"Rate limited, retry after {retry_after}s",
                            request=response.request,
                            response=response,
                        )
                    else:
                        error_msg = f"Graph API error: {response.status_code} - {response.text}"
                        logger.error(error_msg, extra={"correlation_id": str(correlation_id)})
                        return False, error_msg

            except httpx.TimeoutException as e:
                error_msg = f"Timeout sending Teams message: {str(e)}"
                logger.error(error_msg, extra={"correlation_id": str(correlation_id)})
                raise
            except Exception as e:
                error_msg = f"Error sending Teams message: {str(e)}"
                logger.error(
                    error_msg, extra={"correlation_id": str(correlation_id), "error": str(e)}
                )
                return False, error_msg

        # Retry with exponential backoff
        config = RetryConfig(
            max_attempts=3,
            initial_delay=1.0,
            max_delay=30.0,
            retry_on=(httpx.TimeoutException, httpx.HTTPStatusError),
        )
        try:
            return await retry_async(_send_message, config=config)
        except Exception:
            # If all retries failed, return failure
            return False, "Failed after retries"

    def _build_channel_message(
        self,
        content: str,
        content_type: str,
        adaptive_card: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build message payload for channel message."""
        if adaptive_card:
            # Use adaptive card format
            return {
                "body": {
                    "contentType": "html",
                    "content": content,  # Fallback content
                },
                "attachments": [
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": json.dumps(adaptive_card),
                    }
                ],
            }
        else:
            # Simple HTML/text message
            return {
                "body": {
                    "contentType": content_type,
                    "content": content,
                }
            }

    def _build_chat_message(
        self,
        content: str,
        content_type: str,
        adaptive_card: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build message payload for chat message."""
        # Same structure for chat messages
        return self._build_channel_message(content, content_type, adaptive_card)

    async def _get_or_create_chat(self, user_email: str, access_token: str) -> str | None:
        """Get or create a chat with a user.

        Args:
            user_email: User's email address
            access_token: Graph API access token

        Returns:
            Chat ID or None if failed
        """
        try:
            # First, get the user ID from email
            user_url = f"{self.graph_base_url}/users/{user_email}"

            async with httpx.AsyncClient(timeout=30.0) as client:
                user_response = await client.get(
                    user_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )

                if user_response.status_code != 200:
                    logger.error(f"Failed to get user ID for {user_email}")
                    return None

                user_id = user_response.json().get("id")

                # Create a one-on-one chat
                chat_payload = {
                    "chatType": "oneOnOne",
                    "members": [
                        {
                            "@odata.type": "#microsoft.graph.aadUserConversationMember",
                            "roles": ["owner"],
                            "user@odata.bind": f"{self.graph_base_url}/users/{user_id}",
                        },
                        {
                            "@odata.type": "#microsoft.graph.aadUserConversationMember",
                            "roles": ["owner"],
                            "user@odata.bind": (
                                f"{self.graph_base_url}/users/"
                                f"{settings.AZURE_SERVICE_ACCOUNT_ID}"
                            ),
                        },
                    ],
                }

                chat_response = await client.post(
                    f"{self.graph_base_url}/chats",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json=chat_payload,
                )

                if chat_response.status_code == 201:
                    return chat_response.json().get("id")
                else:
                    logger.error(
                        f"Failed to create chat: {chat_response.status_code} - {chat_response.text}"
                    )
                    return None

        except Exception as e:
            logger.error(f"Error creating chat: {str(e)}")
            return None

    async def send_notification(
        self,
        recipient_teams_id: str,
        content: str,
        subject: str | None = None,
        adaptive_card: dict[str, Any] | None = None,
        notification_type: str = "general",
        related_entity_id: UUID | None = None,
        correlation_id: UUID | None = None,
        is_channel: bool = False,
        team_id: str | None = None,
    ) -> NotificationLog:
        """Send a Teams notification and log it.

        Args:
            recipient_teams_id: Recipient Teams ID (channel ID or user email)
            content: Message content
            subject: Optional subject (used in adaptive card title)
            adaptive_card: Optional adaptive card template
            notification_type: Type of notification
            related_entity_id: Related entity ID
            correlation_id: Correlation ID for tracing
            is_channel: Whether this is a channel message
            team_id: Team ID (required if is_channel=True)

        Returns:
            NotificationLog entry
        """
        if not correlation_id:
            correlation_id = uuid4()

        # Create log entry
        log_entry = NotificationLog(
            notification_type=notification_type,
            recipient_teams_id=recipient_teams_id,
            channel="teams",
            sent_at=datetime.now(UTC),
            delivery_status="pending",
            retry_count=0,
            related_entity_id=related_entity_id,
            correlation_id=correlation_id,
        )

        try:
            # Add subject to adaptive card if provided
            if adaptive_card and subject:
                if "body" in adaptive_card and isinstance(adaptive_card["body"], list):
                    # Insert title at the beginning
                    adaptive_card["body"].insert(
                        0,
                        {
                            "type": "TextBlock",
                            "text": subject,
                            "weight": "Bolder",
                            "size": "Large",
                            "wrap": True,
                        },
                    )

            # Send the message
            if is_channel and team_id:
                success, error_msg = await self.send_channel_message(
                    team_id=team_id,
                    channel_id=recipient_teams_id,
                    content=content,
                    adaptive_card=adaptive_card,
                    correlation_id=correlation_id,
                )
            else:
                success, error_msg = await self.send_chat_message(
                    chat_id=recipient_teams_id,
                    content=content,
                    adaptive_card=adaptive_card,
                    correlation_id=correlation_id,
                )

            if success:
                log_entry.delivery_status = "sent"
                log_entry.delivered_at = datetime.now(UTC)
                logger.info(
                    "Teams notification sent successfully",
                    extra={
                        "correlation_id": str(correlation_id),
                        "recipient": recipient_teams_id,
                        "type": notification_type,
                    },
                )
            else:
                log_entry.delivery_status = "failed"
                log_entry.error_message = error_msg
                logger.error(
                    f"Failed to send Teams notification: {error_msg}",
                    extra={
                        "correlation_id": str(correlation_id),
                        "recipient": recipient_teams_id,
                        "type": notification_type,
                    },
                )

        except Exception as e:
            log_entry.delivery_status = "failed"
            log_entry.error_message = str(e)
            logger.error(
                f"Exception sending Teams notification: {str(e)}",
                extra={
                    "correlation_id": str(correlation_id),
                    "recipient": recipient_teams_id,
                    "type": notification_type,
                    "error": str(e),
                },
            )

        return log_entry
