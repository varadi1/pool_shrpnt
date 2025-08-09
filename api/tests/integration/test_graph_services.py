"""Integration tests for Microsoft Graph services."""

import os
import uuid
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest
from httpx import Response

from api.services.auth import GraphAuthService
from api.services.teams import TeamsService


@pytest.fixture
def mock_settings():
    """Mock settings for testing."""
    with patch("api.services.auth.graph_auth.settings") as mock:
        mock.AZURE_TENANT_ID = "test-tenant-id"
        mock.AZURE_CLIENT_ID = "test-client-id"
        mock.AZURE_CLIENT_SECRET = "test-client-secret"
        yield mock


@pytest.fixture
def graph_auth_service(mock_settings):
    """Create Graph auth service instance for testing."""
    with patch("api.services.auth.graph_auth.ConfidentialClientApplication") as mock_msal:
        mock_app = Mock()
        mock_msal.return_value = mock_app
        service = GraphAuthService()
        service.app = mock_app
        return service


@pytest.fixture
def teams_service(graph_auth_service):
    """Create Teams service instance for testing."""
    service = TeamsService()
    service.auth_service = graph_auth_service
    return service


class TestGraphAuthService:
    """Test cases for Graph API authentication service."""

    @pytest.mark.asyncio
    async def test_get_access_token_success(self, graph_auth_service):
        """Test successful token acquisition."""
        mock_token = {
            "access_token": "test-token-123",
            "expires_in": 3600,
            "token_type": "Bearer",
        }

        # Mock both acquire_token_silent and acquire_token_for_client
        graph_auth_service.app.acquire_token_silent.return_value = None
        graph_auth_service.app.acquire_token_for_client.return_value = mock_token

        token = await graph_auth_service.get_access_token()
        assert token == "test-token-123"
        assert graph_auth_service._token == mock_token
        assert graph_auth_service._token_expiry is not None

    @pytest.mark.asyncio
    async def test_get_access_token_cached(self, graph_auth_service):
        """Test token caching and reuse."""
        mock_token = {
            "access_token": "cached-token-456",
            "expires_in": 3600,
            "token_type": "Bearer",
        }

        # Mock both acquire_token_silent and acquire_token_for_client
        graph_auth_service.app.acquire_token_silent.return_value = None
        graph_auth_service.app.acquire_token_for_client.return_value = mock_token

        # First call should acquire token
        token1 = await graph_auth_service.get_access_token()
        assert token1 == "cached-token-456"
        assert graph_auth_service.app.acquire_token_for_client.call_count == 1

        # Second call should use cached token
        token2 = await graph_auth_service.get_access_token()
        assert token2 == "cached-token-456"
        assert graph_auth_service.app.acquire_token_for_client.call_count == 1  # No additional call

    @pytest.mark.asyncio
    async def test_get_access_token_failure(self, graph_auth_service):
        """Test token acquisition failure handling."""
        error_response = {
            "error": "invalid_client",
            "error_description": "Invalid client credentials",
        }

        # Mock both acquire_token_silent and acquire_token_for_client
        graph_auth_service.app.acquire_token_silent.return_value = None
        graph_auth_service.app.acquire_token_for_client.return_value = error_response

        with pytest.raises(Exception) as exc_info:
            await graph_auth_service.get_access_token()

        assert "Token acquisition failed" in str(exc_info.value)
        assert "Invalid client credentials" in str(exc_info.value)

    def test_get_graph_client(self, graph_auth_service):
        """Test Graph API client creation."""
        client = graph_auth_service.get_graph_client(timeout=60)
        assert isinstance(client, httpx.AsyncClient)
        assert str(client.base_url).rstrip("/") == "https://graph.microsoft.com/v1.0"
        assert client.timeout.read == 60


class TestTeamsService:
    """Test cases for Teams provisioning service."""

    @pytest.mark.asyncio
    async def test_create_or_get_team_existing(self, teams_service):
        """Test getting existing team by name."""
        existing_team = {
            "id": "existing-team-id",
            "displayName": "Test Team",
            "description": "Test Description",
        }

        mock_response = Mock(spec=Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"value": [existing_team]}

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client

        with patch.object(teams_service.auth_service, "get_graph_client", return_value=mock_client):
            result = await teams_service.create_or_get_team(
                display_name="Test Team",
                description="Test Description",
                owner_ids=["owner-1"],
                correlation_id="test-correlation-id",
            )

            assert result == existing_team
            mock_client.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_team_new(self, teams_service):
        """Test creating new team when it doesn't exist."""
        new_group = {
            "id": "new-team-id",
            "displayName": "New Team",
            "description": "New Description",
        }

        # Mock for search (no existing team)
        search_response = Mock(spec=Response)
        search_response.status_code = 200
        search_response.json.return_value = {"value": []}

        # Mock for group creation
        create_response = Mock(spec=Response)
        create_response.status_code = 201
        create_response.json.return_value = new_group

        # Mock for teamify
        teamify_response = Mock(spec=Response)
        teamify_response.status_code = 204

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = search_response
        mock_client.post.return_value = create_response
        mock_client.put.return_value = teamify_response
        mock_client.__aenter__.return_value = mock_client

        with patch.object(teams_service.auth_service, "get_graph_client", return_value=mock_client):
            result = await teams_service.create_or_get_team(
                display_name="New Team",
                description="New Description",
                owner_ids=["owner-1"],
                correlation_id="test-correlation-id",
            )

            assert result == new_group
            assert mock_client.get.call_count == 1  # Search call
            assert mock_client.post.call_count == 1  # Create group call
            assert mock_client.put.call_count == 1  # Teamify call

    @pytest.mark.asyncio
    async def test_create_channel(self, teams_service):
        """Test channel creation in a team."""
        new_channel = {
            "id": "channel-id",
            "displayName": "Test Channel",
            "description": "Channel Description",
        }

        # Mock for channel list (no existing)
        list_response = Mock(spec=Response)
        list_response.status_code = 200
        list_response.json.return_value = {"value": []}

        # Mock for channel creation
        create_response = Mock(spec=Response)
        create_response.status_code = 201
        create_response.json.return_value = new_channel

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = list_response
        mock_client.post.return_value = create_response
        mock_client.__aenter__.return_value = mock_client

        with patch.object(teams_service.auth_service, "get_graph_client", return_value=mock_client):
            result = await teams_service.create_channel(
                team_id="team-123",
                display_name="Test Channel",
                description="Channel Description",
                correlation_id="test-correlation-id",
            )

            assert result == new_channel
            mock_client.get.assert_called_once_with("/teams/team-123/channels")
            mock_client.post.assert_called_once()

    def test_generate_team_name(self, teams_service):
        """Test team name generation following PRD conventions."""
        name = teams_service.generate_team_name(
            year=2025,
            part="A",
            partner_code="CEG_01",
            em_id="2025_001",
        )
        assert name == "NEU_2025_RESZ_A_CEG_01_EM_2025_001"

    def test_generate_channel_name(self, teams_service):
        """Test channel name generation."""
        name = teams_service.generate_channel_name(
            em_id="2025_001",
            purpose="Szakertok",
        )
        assert name == "EM_2025_001_Szakertok"

    def test_generate_mail_nickname(self, teams_service):
        """Test mail nickname generation from display name."""
        # Test with normal name
        nickname = teams_service._generate_mail_nickname("Test Team 2025")
        assert nickname == "TestTeam2025"

        # Test with special characters
        nickname = teams_service._generate_mail_nickname("Team@#$%^&*()")
        assert nickname == "Team"

        # Test with empty result
        nickname = teams_service._generate_mail_nickname("@#$%^&*()")
        assert nickname == "team"

        # Test max length
        long_name = "A" * 100
        nickname = teams_service._generate_mail_nickname(long_name)
        assert len(nickname) == 64


@pytest.mark.skipif(
    not os.getenv("RUN_INTEGRATION_TESTS"),
    reason="Integration tests require RUN_INTEGRATION_TESTS=1",
)
class TestGraphIntegrationWithSandbox:
    """Integration tests against real Graph API sandbox.

    These tests require:
    - Valid Azure AD credentials in environment
    - RUN_INTEGRATION_TESTS=1 environment variable
    - Access to sandbox tenant
    """

    @pytest.mark.asyncio
    async def test_real_token_acquisition(self):
        """Test real token acquisition from Azure AD."""
        if not all(
            [
                os.getenv("AZURE_TENANT_ID"),
                os.getenv("AZURE_CLIENT_ID"),
                os.getenv("AZURE_CLIENT_SECRET"),
            ]
        ):
            pytest.skip("Azure AD credentials not configured")

        service = GraphAuthService()
        token = await service.get_access_token()

        assert token is not None
        assert len(token) > 100  # JWT tokens are typically long
        assert service._token_expiry is not None

    @pytest.mark.asyncio
    async def test_real_team_creation_idempotency(self):
        """Test idempotent team creation against real API."""
        if not all(
            [
                os.getenv("AZURE_TENANT_ID"),
                os.getenv("AZURE_CLIENT_ID"),
                os.getenv("AZURE_CLIENT_SECRET"),
            ]
        ):
            pytest.skip("Azure AD credentials not configured")

        service = TeamsService()
        test_id = str(uuid.uuid4())[:8]
        team_name = f"Test_Team_{test_id}"

        # First creation
        team1 = await service.create_or_get_team(
            display_name=team_name,
            description="Integration test team",
            owner_ids=[os.getenv("TEST_OWNER_ID", "admin@nffku.onmicrosoft.com")],
            correlation_id=f"test-{test_id}-1",
        )

        assert team1["displayName"] == team_name

        # Second call should return same team
        team2 = await service.create_or_get_team(
            display_name=team_name,
            description="Integration test team",
            owner_ids=[os.getenv("TEST_OWNER_ID", "admin@nffku.onmicrosoft.com")],
            correlation_id=f"test-{test_id}-2",
        )

        assert team2["id"] == team1["id"]
        assert team2["displayName"] == team1["displayName"]
