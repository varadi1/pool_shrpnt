"""Email notification sender using Microsoft Graph API."""

import logging
from typing import Any
from uuid import UUID

from api.core.config import settings
from api.integrations.graph.retry_adapter import GraphRetryAdapter
from api.models.notification import NotificationQueue, NotificationTemplate
from api.services.auth.graph_auth import GraphAuthService
from api.services.notifications.notification_service import NotificationService

logger = logging.getLogger(__name__)


class GraphEmailSender:
    """Send email notifications via Microsoft Graph API."""

    def __init__(self, auth_service: GraphAuthService):
        """Initialize email sender.

        Args:
            auth_service: Graph authentication service
        """
        self.auth_service = auth_service
        self.retry_adapter = GraphRetryAdapter()
        self.service_account = settings.AZURE_SERVICE_ACCOUNT_EMAIL

    async def send_email(
        self,
        recipient: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
        importance: str = "normal",
        correlation_id: UUID | None = None,
    ) -> bool:
        """Send email via Graph API.

        Args:
            recipient: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_text: Plain text body (optional)
            attachments: List of attachments (optional)
            importance: Email importance (low/normal/high)
            correlation_id: Correlation ID for tracking

        Returns:
            True if sent successfully
        """
        try:
            async with self.auth_service.get_graph_client() as client:
                # Build message
                message = {
                    "message": {
                        "subject": subject,
                        "body": {
                            "contentType": "HTML",
                            "content": body_html,
                        },
                        "toRecipients": [{"emailAddress": {"address": recipient}}],
                        "importance": importance,
                    },
                    "saveToSentItems": True,
                }

                # Add custom headers for tracking
                if correlation_id:
                    message["message"]["internetMessageHeaders"] = [
                        {
                            "name": "X-Correlation-Id",
                            "value": str(correlation_id),
                        }
                    ]

                # Add attachments if provided
                if attachments:
                    message["message"]["attachments"] = attachments

                # Send mail via Graph API
                url = f"https://graph.microsoft.com/v1.0/users/{self.service_account}/sendMail"

                response = await self.retry_adapter.execute_with_retry(
                    client,
                    "POST",
                    url,
                    json=message,
                )

                if response.status_code == 202:  # Accepted
                    logger.info(
                        f"Email sent successfully to {recipient}",
                        extra={"correlation_id": correlation_id},
                    )
                    return True
                else:
                    logger.error(
                        f"Failed to send email: {response.status_code} - {response.text}",
                        extra={"correlation_id": correlation_id},
                    )
                    return False

        except Exception as e:
            logger.error(
                f"Error sending email to {recipient}: {e}",
                extra={"correlation_id": correlation_id},
            )
            return False

    async def send_notification_email(
        self,
        notification: NotificationQueue,
        template: NotificationTemplate,
        notification_service: NotificationService,
    ) -> bool:
        """Send notification email from queue.

        Args:
            notification: Notification queue entry
            template: Notification template
            notification_service: Service for template rendering

        Returns:
            True if sent successfully
        """
        if not notification.recipient_email:
            logger.warning(f"No email address for notification {notification.id}")
            return False

        try:
            # Render template
            subject = notification_service.render_template(
                template.subject_template or "",
                notification.variables or {},
            )
            body = notification_service.render_template(
                template.body_template,
                notification.variables or {},
            )

            # Wrap body in HTML template
            body_html = self._create_html_body(body, notification.variables or {})

            # Send email
            return await self.send_email(
                recipient=notification.recipient_email,
                subject=subject,
                body_html=body_html,
                importance="high" if notification.priority <= 3 else "normal",
                correlation_id=notification.id,
            )

        except Exception as e:
            logger.error(f"Error sending notification email {notification.id}: {e}")
            return False

    async def send_batch_emails(
        self,
        messages: list[dict[str, Any]],
        correlation_id: UUID | None = None,
    ) -> dict[str, int]:
        """Send multiple emails in batch.

        Args:
            messages: List of message dicts
            correlation_id: Correlation ID for tracking

        Returns:
            Statistics dict
        """
        stats = {"sent": 0, "failed": 0}

        async with self.auth_service.get_graph_client() as client:
            # Graph API batch endpoint
            batch_url = "https://graph.microsoft.com/v1.0/$batch"

            # Create batch requests (max 20 per batch as per Graph limits)
            for i in range(0, len(messages), 20):
                batch = messages[i : i + 20]
                batch_requests = []

                for idx, msg in enumerate(batch):
                    batch_requests.append(
                        {
                            "id": str(idx + 1),
                            "method": "POST",
                            "url": f"/users/{self.service_account}/sendMail",
                            "body": {
                                "message": msg["message"],
                                "saveToSentItems": True,
                            },
                            "headers": {
                                "Content-Type": "application/json",
                            },
                        }
                    )

                batch_body = {"requests": batch_requests}

                try:
                    response = await self.retry_adapter.execute_with_retry(
                        client,
                        "POST",
                        batch_url,
                        json=batch_body,
                    )

                    if response.status_code == 200:
                        batch_response = response.json()
                        for resp in batch_response.get("responses", []):
                            if resp.get("status") == 202:
                                stats["sent"] += 1
                            else:
                                stats["failed"] += 1
                                logger.error(
                                    f"Batch email failed: {resp}",
                                    extra={"correlation_id": correlation_id},
                                )
                    else:
                        stats["failed"] += len(batch)
                        logger.error(
                            f"Batch request failed: {response.status_code}",
                            extra={"correlation_id": correlation_id},
                        )

                except Exception as e:
                    stats["failed"] += len(batch)
                    logger.error(
                        f"Error sending batch emails: {e}",
                        extra={"correlation_id": correlation_id},
                    )

        return stats

    async def check_delivery_status(self, message_id: str) -> dict[str, Any] | None:
        """Check email delivery status via Graph API.

        Args:
            message_id: Message ID to check

        Returns:
            Delivery status info or None
        """
        try:
            async with self.auth_service.get_graph_client() as client:
                # Get message from sent items
                url = (
                    f"https://graph.microsoft.com/v1.0/users/{self.service_account}"
                    f"/mailFolders/sentitems/messages/{message_id}"
                )

                response = await client.get(url)

                if response.status_code == 200:
                    message = response.json()
                    return {
                        "id": message.get("id"),
                        "subject": message.get("subject"),
                        "sentDateTime": message.get("sentDateTime"),
                        "isRead": message.get("isRead"),
                        "isDeliveryReceiptRequested": message.get("isDeliveryReceiptRequested"),
                    }

                return None

        except Exception as e:
            logger.error(f"Error checking delivery status for {message_id}: {e}")
            return None

    def _create_html_body(self, content: str, variables: dict[str, Any]) -> str:
        """Create HTML email body with styling.

        Args:
            content: Body content (may contain basic HTML)
            variables: Template variables for context

        Returns:
            Complete HTML body
        """
        # Basic HTML template with responsive design
        html_template = """
        <!DOCTYPE html>
        <html lang="hu">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    background-color: #0078d4;
                    color: white;
                    padding: 20px;
                    border-radius: 5px 5px 0 0;
                }
                .content {
                    background-color: #f5f5f5;
                    padding: 20px;
                    border-radius: 0 0 5px 5px;
                }
                .footer {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    font-size: 0.9em;
                    color: #666;
                }
                .button {
                    display: inline-block;
                    padding: 10px 20px;
                    background-color: #0078d4;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 10px 0;
                }
                .warning {
                    background-color: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 10px;
                    margin: 10px 0;
                }
                .info {
                    background-color: #d1ecf1;
                    border-left: 4px solid #17a2b8;
                    padding: 10px;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>poolDRV Értesítés</h2>
            </div>
            <div class="content">
                {content}
            </div>
            <div class="footer">
                <p>Ez egy automatikus értesítés a poolDRV rendszerből.</p>
                <p>Kérjük, ne válaszoljon erre az e-mailre.</p>
            </div>
        </body>
        </html>
        """

        return html_template.replace("{content}", content)
