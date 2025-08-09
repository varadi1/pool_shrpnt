"""Comprehensive integration tests for Microsoft Graph API services."""

import os
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest
from httpx import Response

from api.integrations.graph import GraphRetryAdapter
from api.services.auth import GraphAuthService
from api.services.sharepoint import SharePointService
from api.services.teams import TeamsService


@pytest.fixture
def sandbox_config():
    """Configuration for sandbox tenant testing."""
    return {
        "tenant_id": os.getenv("TEST_TENANT_ID", "test-tenant"),
        "client_id": os.getenv("TEST_CLIENT_ID", "test-client"),
        "client_secret": os.getenv("TEST_CLIENT_SECRET", "test-secret"),
        "test_user_id": os.getenv("TEST_USER_ID", "test-user@test.onmicrosoft.com"),
        "test_site_id": os.getenv("TEST_SITE_ID", "test-site-id"),
    }


@pytest.fixture
def mock_graph_auth():
    """Mock Graph authentication service."""
    with patch("api.services.auth.graph_auth.ConfidentialClientApplication") as mock_msal:
        mock_app = Mock()
        mock_msal.return_value = mock_app
        service = GraphAuthService()
        service.app = mock_app
        service._token = {"access_token": "test-token-123"}
        service._token_expiry = datetime.now().replace(year=2030)
        return service


@pytest.fixture
def mock_teams_service(mock_graph_auth):
    """Mock Teams service with auth."""
    service = TeamsService()
    service.auth_service = mock_graph_auth
    return service


@pytest.fixture
def mock_sharepoint_service(mock_graph_auth):
    """Mock SharePoint service with auth."""
    service = SharePointService()
    service.auth_service = mock_graph_auth
    return service


class TestEndToEndProvisioning:
    """End-to-end provisioning workflow tests."""

    @pytest.mark.asyncio
    async def test_complete_provisioning_workflow(
        self, mock_teams_service, mock_sharepoint_service
    ):
        """Test complete provisioning workflow from Teams to SharePoint."""
        correlation_id = str(uuid.uuid4())

        # Mock successful responses for all operations
        mock_client = AsyncMock(spec=httpx.AsyncClient)

        # Team creation response
        team_response = Mock(spec=Response)
        team_response.status_code = 201
        team_response.json.return_value = {
            "id": "team-123",
            "displayName": "Test Team",
            "description": "Test Description",
        }

        # Channel creation response
        channel_response = Mock(spec=Response)
        channel_response.status_code = 201
        channel_response.json.return_value = {"id": "channel-123", "displayName": "Test Channel"}

        # Library creation response
        library_response = Mock(spec=Response)
        library_response.status_code = 201
        library_response.json.return_value = {"id": "library-123", "displayName": "Test Library"}

        # Folder creation response
        folder_response = Mock(spec=Response)
        folder_response.status_code = 201
        folder_response.json.return_value = {"id": "folder-123", "name": "Test Folder"}

        # Tab creation response
        tab_response = Mock(spec=Response)
        tab_response.status_code = 201
        tab_response.json.return_value = {"id": "tab-123"}

        # Empty search responses (nothing exists yet)
        empty_response = Mock(spec=Response)
        empty_response.status_code = 200
        empty_response.json.return_value = {"value": []}

        # Channels list response for tab attachment
        channels_response = Mock(spec=Response)
        channels_response.status_code = 200
        channels_response.json.return_value = {
            "value": [
                {"id": "channel-general", "displayName": "General"},
                {"id": "channel-123", "displayName": "Test Channel"},
            ]
        }

        # Drive response for folder creation
        drive_response = Mock(spec=Response)
        drive_response.status_code = 200
        drive_response.json.return_value = {"id": "drive-123"}

        # Permission response
        permission_response = Mock(spec=Response)
        permission_response.status_code = 204

        # Setup mock client responses in order
        mock_client.get.side_effect = [
            empty_response,  # Team search
            empty_response,  # Channel search
            empty_response,  # Library search
            drive_response,  # Get drive for folder 1
            drive_response,  # Get drive for folder 2
            channels_response,  # Channels list for tab
        ]

        mock_client.post.side_effect = [
            team_response,  # Create team/group
            channel_response,  # Create channel
            library_response,  # Create library
            folder_response,  # Create folder 1
            folder_response,  # Create folder 2
            permission_response,  # Break inheritance
            tab_response,  # Create tab
        ]

        mock_client.put.return_value = Mock(status_code=204)  # Teamify group
        mock_client.__aenter__.return_value = mock_client

        with patch.object(
            mock_teams_service.auth_service, "get_graph_client", return_value=mock_client
        ):
            with patch.object(
                mock_sharepoint_service.auth_service, "get_graph_client", return_value=mock_client
            ):
                # Step 1: Create Team
                team = await mock_teams_service.create_or_get_team(
                    display_name="Test Team",
                    description="Test Description",
                    owner_ids=["owner-123"],
                    correlation_id=correlation_id,
                )
                assert team["id"] == "team-123"

                # Step 2: Create Channel
                channel = await mock_teams_service.create_channel(
                    team_id=team["id"],
                    display_name="Test Channel",
                    description="Channel Description",
                    correlation_id=correlation_id,
                )
                assert channel["id"] == "channel-123"

                # Step 3: Create Document Library
                library = await mock_sharepoint_service.create_document_library(
                    site_id="site-123",
                    library_name="Test Library",
                    description="Library Description",
                    correlation_id=correlation_id,
                )
                assert library["id"] == "library-123"

                # Step 4: Create Folder Structure
                folder_template = {"01_Documents": {}, "02_BELSO_NEU_ONLY": {}}  # Sensitive folder
                folders = await mock_sharepoint_service.create_folder_structure(
                    site_id="site-123",
                    library_id=library["id"],
                    folder_template=folder_template,
                    correlation_id=correlation_id,
                )
                assert len(folders) == 2

                # Step 5: Break permission inheritance for sensitive folder
                result = await mock_sharepoint_service.break_permission_inheritance(
                    site_id="site-123",
                    item_id="folder-123",
                    copy_role_assignments=False,
                    correlation_id=correlation_id,
                )
                assert result is True

                # Step 6: Attach library to Teams
                tab = await mock_sharepoint_service.attach_library_to_team(
                    team_id=team["id"],
                    site_id="site-123",
                    library_id=library["id"],
                    tab_name="Documents",
                    correlation_id=correlation_id,
                )
                assert tab["id"] == "tab-123"


class TestIdempotencyBehavior:
    """Test idempotent operations across services."""

    @pytest.mark.asyncio
    async def test_team_creation_idempotency(self, mock_teams_service):
        """Test that creating the same team twice returns the existing one."""
        existing_team = {
            "id": "existing-team-id",
            "displayName": "Idempotent Team",
            "description": "Test Description",
        }

        mock_client = AsyncMock(spec=httpx.AsyncClient)

        # First call finds existing team
        search_response = Mock(spec=Response)
        search_response.status_code = 200
        search_response.json.return_value = {"value": [existing_team]}

        mock_client.get.return_value = search_response
        mock_client.__aenter__.return_value = mock_client

        with patch.object(
            mock_teams_service.auth_service, "get_graph_client", return_value=mock_client
        ):
            # First call
            team1 = await mock_teams_service.create_or_get_team(
                display_name="Idempotent Team",
                description="Test Description",
                owner_ids=["owner-123"],
                correlation_id="test-1",
            )

            # Second call
            team2 = await mock_teams_service.create_or_get_team(
                display_name="Idempotent Team",
                description="Test Description",
                owner_ids=["owner-123"],
                correlation_id="test-2",
            )

            # Should return the same team
            assert team1["id"] == team2["id"]
            assert team1["id"] == "existing-team-id"
            # Should only search, not create
            assert mock_client.post.call_count == 0

    @pytest.mark.asyncio
    async def test_library_creation_idempotency(self, mock_sharepoint_service):
        """Test that creating the same library twice returns the existing one."""
        existing_library = {
            "id": "existing-library-id",
            "displayName": "Idempotent Library",
            "description": "Test Description",
        }

        mock_client = AsyncMock(spec=httpx.AsyncClient)

        # Search finds existing library
        search_response = Mock(spec=Response)
        search_response.status_code = 200
        search_response.json.return_value = {"value": [existing_library]}

        mock_client.get.return_value = search_response
        mock_client.__aenter__.return_value = mock_client

        with patch.object(
            mock_sharepoint_service.auth_service, "get_graph_client", return_value=mock_client
        ):
            # First call
            library1 = await mock_sharepoint_service.create_document_library(
                site_id="site-123",
                library_name="Idempotent Library",
                description="Test Description",
                correlation_id="test-1",
            )

            # Second call
            library2 = await mock_sharepoint_service.create_document_library(
                site_id="site-123",
                library_name="Idempotent Library",
                description="Test Description",
                correlation_id="test-2",
            )

            # Should return the same library
            assert library1["id"] == library2["id"]
            assert library1["id"] == "existing-library-id"
            # Should only search, not create
            assert mock_client.post.call_count == 0


class TestRateLimitHandling:
    """Test rate limiting and retry behavior."""

    @pytest.mark.asyncio
    async def test_rate_limit_429_handling(self):
        """Test handling of 429 rate limit responses."""
        retry_adapter = GraphRetryAdapter(max_retries=2, base_delay=0.1)

        # First response is 429, second is success
        rate_limit_response = Mock(spec=Response)
        rate_limit_response.status_code = 429
        rate_limit_response.headers = {"Retry-After": "1"}
        rate_limit_response.request = Mock()

        success_response = Mock(spec=Response)
        success_response.status_code = 200
        success_response.headers = {}
        success_response.json.return_value = {"value": []}

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.side_effect = [rate_limit_response, success_response]

        result = await retry_adapter.execute_with_retry(
            client=mock_client,
            method="GET",
            url="/test",
            headers={"client-request-id": "test-correlation"},
        )

        assert result.status_code == 200
        assert mock_client.request.call_count == 2
        # Verify rate limiter was updated
        assert retry_adapter.rate_limiter.retry_after is not None

    @pytest.mark.asyncio
    async def test_circuit_breaker_behavior(self):
        """Test circuit breaker opening and recovery."""
        retry_adapter = GraphRetryAdapter(max_retries=1, base_delay=0.01)

        error_response = Mock(spec=Response)
        error_response.status_code = 503
        error_response.headers = {}
        error_response.request = Mock()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.return_value = error_response

        # Make requests until circuit opens
        for i in range(6):
            try:
                await retry_adapter.execute_with_retry(
                    client=mock_client, method="GET", url="/test"
                )
            except Exception:
                pass

        # Circuit should be open
        assert retry_adapter.circuit_breaker.state == "open"

        # Next request should fail immediately without calling the service
        initial_call_count = mock_client.request.call_count

        with pytest.raises(Exception) as exc_info:
            await retry_adapter.execute_with_retry(client=mock_client, method="GET", url="/test")

        assert "Circuit breaker is open" in str(exc_info.value)
        # No additional calls should have been made
        assert mock_client.request.call_count == initial_call_count


class TestErrorScenariosAndRollback:
    """Test error handling and rollback scenarios."""

    @pytest.mark.asyncio
    async def test_team_creation_failure_handling(self, mock_teams_service):
        """Test handling of team creation failures."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)

        # Search returns empty (no existing team)
        empty_response = Mock(spec=Response)
        empty_response.status_code = 200
        empty_response.json.return_value = {"value": []}

        # Creation fails
        error_response = Mock(spec=Response)
        error_response.status_code = 400
        error_response.text = '{"error": {"message": "Invalid team name"}}'

        mock_client.get.return_value = empty_response
        mock_client.post.return_value = error_response
        mock_client.__aenter__.return_value = mock_client

        with patch.object(
            mock_teams_service.auth_service, "get_graph_client", return_value=mock_client
        ):
            with pytest.raises(Exception) as exc_info:
                await mock_teams_service.create_or_get_team(
                    display_name="Invalid@Team#Name",
                    description="Test",
                    owner_ids=["owner-123"],
                    correlation_id="test-error",
                )

            assert "Failed to create group" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_folder_creation_partial_failure(self, mock_sharepoint_service):
        """Test handling when folder creation partially fails."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)

        # Drive response
        drive_response = Mock(spec=Response)
        drive_response.status_code = 200
        drive_response.json.return_value = {"id": "drive-123"}

        # First folder succeeds
        folder1_response = Mock(spec=Response)
        folder1_response.status_code = 201
        folder1_response.json.return_value = {"id": "folder-1", "name": "Folder1"}

        # Second folder fails
        folder2_response = Mock(spec=Response)
        folder2_response.status_code = 403
        folder2_response.text = "Access denied"

        mock_client.get.return_value = drive_response
        mock_client.post.side_effect = [
            folder1_response,
            folder2_response,  # This will cause an exception
        ]
        mock_client.__aenter__.return_value = mock_client

        with patch.object(
            mock_sharepoint_service.auth_service, "get_graph_client", return_value=mock_client
        ):
            with pytest.raises(Exception) as exc_info:
                await mock_sharepoint_service.create_folder_structure(
                    site_id="site-123",
                    library_id="library-123",
                    folder_template={"Folder1": {}, "Folder2": {}},
                    correlation_id="test-partial-failure",
                )

            assert "Failed to create folder" in str(exc_info.value)
            # First folder was created before failure
            assert mock_client.post.call_count == 2


class TestAuditingAndLogging:
    """Test audit event emission and logging."""

    @pytest.mark.asyncio
    async def test_provisioning_audit_trail(self, mock_teams_service, mock_sharepoint_service):
        """Test that all provisioning operations emit audit events."""
        with patch("api.services.teams.teams_service.logger") as mock_teams_logger:
            with patch("api.services.sharepoint.sharepoint_service.logger"):
                mock_client = AsyncMock(spec=httpx.AsyncClient)

                # Setup successful responses
                success_response = Mock(spec=Response)
                success_response.status_code = 200
                success_response.json.return_value = {"value": []}

                create_response = Mock(spec=Response)
                create_response.status_code = 201
                create_response.json.return_value = {"id": "resource-123"}

                mock_client.get.return_value = success_response
                mock_client.post.return_value = create_response
                mock_client.put.return_value = Mock(status_code=204)
                mock_client.__aenter__.return_value = mock_client

                correlation_id = "audit-test-123"

                with patch.object(
                    mock_teams_service.auth_service, "get_graph_client", return_value=mock_client
                ):
                    await mock_teams_service.create_or_get_team(
                        display_name="Audit Test Team",
                        description="Test",
                        owner_ids=["owner-123"],
                        correlation_id=correlation_id,
                    )

                # Verify audit logging
                mock_teams_logger.info.assert_called()
                # Check that correlation_id was included in logs
                log_calls = mock_teams_logger.info.call_args_list
                assert any(
                    "correlation_id" in str(call) and correlation_id in str(call)
                    for call in log_calls
                )


@pytest.mark.skipif(
    not os.getenv("RUN_SANDBOX_TESTS"),
    reason="Sandbox tests require RUN_SANDBOX_TESTS=1 and valid credentials",
)
class TestSandboxIntegration:
    """Integration tests against real sandbox tenant."""

    @pytest.mark.asyncio
    async def test_real_team_provisioning(self, sandbox_config):
        """Test real team provisioning in sandbox."""
        if not all(
            [
                sandbox_config["tenant_id"] != "test-tenant",
                sandbox_config["client_id"] != "test-client",
                sandbox_config["client_secret"] != "test-secret",
            ]
        ):
            pytest.skip("Sandbox credentials not configured")

        # Configure real services
        with patch.dict(
            os.environ,
            {
                "POOLDRV_AZURE_TENANT_ID": sandbox_config["tenant_id"],
                "POOLDRV_AZURE_CLIENT_ID": sandbox_config["client_id"],
                "POOLDRV_AZURE_CLIENT_SECRET": sandbox_config["client_secret"],
            },
        ):
            auth_service = GraphAuthService()
            teams_service = TeamsService()
            teams_service.auth_service = auth_service

            test_id = str(uuid.uuid4())[:8]
            team_name = f"Sandbox_Test_Team_{test_id}"

            # Create team
            team = await teams_service.create_or_get_team(
                display_name=team_name,
                description="Integration test team",
                owner_ids=[sandbox_config["test_user_id"]],
                correlation_id=f"sandbox-test-{test_id}",
            )

            assert team["displayName"] == team_name
            assert "id" in team

            # Verify idempotency - create again
            team2 = await teams_service.create_or_get_team(
                display_name=team_name,
                description="Integration test team",
                owner_ids=[sandbox_config["test_user_id"]],
                correlation_id=f"sandbox-test-{test_id}-2",
            )

            assert team2["id"] == team["id"]

    @pytest.mark.asyncio
    async def test_real_sharepoint_provisioning(self, sandbox_config):
        """Test real SharePoint provisioning in sandbox."""
        if not all(
            [
                sandbox_config["tenant_id"] != "test-tenant",
                sandbox_config["client_id"] != "test-client",
                sandbox_config["client_secret"] != "test-secret",
                sandbox_config["test_site_id"] != "test-site-id",
            ]
        ):
            pytest.skip("Sandbox credentials or site not configured")

        # Configure real services
        with patch.dict(
            os.environ,
            {
                "POOLDRV_AZURE_TENANT_ID": sandbox_config["tenant_id"],
                "POOLDRV_AZURE_CLIENT_ID": sandbox_config["client_id"],
                "POOLDRV_AZURE_CLIENT_SECRET": sandbox_config["client_secret"],
            },
        ):
            auth_service = GraphAuthService()
            sp_service = SharePointService()
            sp_service.auth_service = auth_service

            test_id = str(uuid.uuid4())[:8]
            library_name = f"Sandbox_Test_Library_{test_id}"

            # Create document library
            library = await sp_service.create_document_library(
                site_id=sandbox_config["test_site_id"],
                library_name=library_name,
                description="Integration test library",
                correlation_id=f"sandbox-sp-test-{test_id}",
            )

            assert library["displayName"] == library_name
            assert "id" in library

            # Create folder structure
            folders = await sp_service.create_folder_structure(
                site_id=sandbox_config["test_site_id"],
                library_id=library["id"],
                folder_template={"Test_Folder_1": {"Subfolder_1": {}}, "Test_Folder_2": {}},
                correlation_id=f"sandbox-folders-test-{test_id}",
            )

            assert len(folders) == 3  # 2 root + 1 sub
