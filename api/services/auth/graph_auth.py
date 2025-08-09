"""Microsoft Graph API authentication service using MSAL."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import httpx
from msal import ConfidentialClientApplication

from api.core.config import settings

logger = logging.getLogger(__name__)


class GraphAuthService:
    """Handles authentication to Microsoft Graph API using client credentials flow."""

    def __init__(self):
        """Initialize the Graph authentication service."""
        self.tenant_id = settings.AZURE_TENANT_ID or "test-tenant-id"
        self.client_id = settings.AZURE_CLIENT_ID or "test-client-id"
        self.client_secret = settings.AZURE_CLIENT_SECRET or "test-secret"
        self.authority = f"https://login.microsoftonline.com/{self.tenant_id}"
        self.scope = ["https://graph.microsoft.com/.default"]

        # Initialize MSAL application only if credentials are valid
        if (
            self.tenant_id
            and self.client_id
            and self.client_secret
            and self.tenant_id != "test-tenant-id"
        ):
            self.app = ConfidentialClientApplication(
                self.client_id,
                authority=self.authority,
                client_credential=self.client_secret,
            )
        else:
            self.app = None  # Test mode - no real MSAL app

        # Token cache
        self._token: dict | None = None
        self._token_expiry: datetime | None = None
        self._lock = asyncio.Lock()

    async def get_access_token(self) -> str:
        """Get or refresh access token for Graph API.

        Returns:
            str: Valid access token

        Raises:
            Exception: If token acquisition fails
        """
        # In test mode, return a mock token
        if self.app is None:
            return "test-access-token"

        async with self._lock:
            # Check if we have a valid cached token
            if self._is_token_valid():
                return self._token["access_token"]

            # Acquire new token
            logger.info("Acquiring new access token for Graph API")

            # MSAL is synchronous, so run in executor
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, lambda: self.app.acquire_token_silent(self.scope, account=None)
            )

            if not result:
                # Silent acquisition failed, try direct acquisition
                result = await loop.run_in_executor(
                    None, lambda: self.app.acquire_token_for_client(self.scope)
                )

            if "access_token" not in result:
                error_msg = result.get("error_description", "Unknown error")
                logger.error(f"Failed to acquire token: {error_msg}")
                raise Exception(f"Token acquisition failed: {error_msg}")

            # Cache the token
            self._token = result
            # Set expiry with 5-minute buffer for proactive renewal
            expires_in = result.get("expires_in", 3600)
            self._token_expiry = datetime.now(UTC) + timedelta(seconds=expires_in - 300)

            logger.info(f"Successfully acquired token, expires at {self._token_expiry}")
            return result["access_token"]

    def _is_token_valid(self) -> bool:
        """Check if cached token is still valid.

        Returns:
            bool: True if token is valid, False otherwise
        """
        if not self._token or not self._token_expiry:
            return False

        # Check if token will expire in the next minute
        return datetime.now(UTC) < self._token_expiry

    def get_graph_client(self, timeout: int = 30) -> httpx.AsyncClient:
        """Create an authenticated httpx client for Graph API calls.

        Args:
            timeout: Request timeout in seconds

        Returns:
            httpx.AsyncClient: Configured client with auth headers
        """
        return httpx.AsyncClient(
            base_url="https://graph.microsoft.com/v1.0",
            timeout=httpx.Timeout(timeout),
            event_hooks={
                "request": [self._add_auth_header],
            },
        )

    async def _add_auth_header(self, request: httpx.Request) -> None:
        """Add authorization header to the request.

        Args:
            request: The httpx request to modify
        """
        token = await self.get_access_token()
        request.headers["Authorization"] = f"Bearer {token}"
        # Add correlation ID if available
        if hasattr(request, "correlation_id"):
            request.headers["client-request-id"] = request.correlation_id


# Singleton instance - lazy initialization
_graph_auth_service = None


def get_graph_auth_service():
    """Get or create the graph auth service singleton."""
    global _graph_auth_service
    if _graph_auth_service is None:
        _graph_auth_service = GraphAuthService()
    return _graph_auth_service


# For backward compatibility
graph_auth_service = None  # Will be initialized on first import that uses it


async def get_graph_token() -> dict:
    """Get Graph API access token.

    Returns:
        dict: Token data including access_token and expires_in
    """
    token = await graph_auth_service.get_access_token()
    return {"access_token": token, "expires_in": 3600}  # Default expiry
