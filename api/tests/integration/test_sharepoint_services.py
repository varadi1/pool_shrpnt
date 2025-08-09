"""Integration tests for SharePoint and retry services."""

import asyncio
import time
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest
from httpx import Response

from api.integrations.graph import GraphRetryAdapter
from api.services.sharepoint import SharePointService


@pytest.fixture
def sharepoint_service():
    """Create SharePoint service instance for testing."""
    service = SharePointService()
    # Mock the auth service
    with patch.object(service, "auth_service") as mock_auth:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.__aenter__.return_value = mock_client
        mock_auth.get_graph_client.return_value = mock_client
        service._mock_client = mock_client
        yield service


@pytest.fixture
def retry_adapter():
    """Create retry adapter instance for testing."""
    return GraphRetryAdapter(max_retries=2, base_delay=0.1, max_delay=1.0)


class TestSharePointService:
    """Test cases for SharePoint provisioning service."""

    @pytest.mark.asyncio
    async def test_create_document_library(self, sharepoint_service):
        """Test document library creation."""
        new_library = {
            "id": "library-123",
            "displayName": "Test Library",
            "description": "Test Description",
        }

        # Mock library search (not found)
        search_response = Mock(spec=Response)
        search_response.status_code = 200
        search_response.json.return_value = {"value": []}

        # Mock library creation
        create_response = Mock(spec=Response)
        create_response.status_code = 201
        create_response.json.return_value = new_library

        mock_client = sharepoint_service._mock_client
        mock_client.get.return_value = search_response
        mock_client.post.return_value = create_response

        result = await sharepoint_service.create_document_library(
            site_id="site-123",
            library_name="Test Library",
            description="Test Description",
            correlation_id="test-correlation",
        )

        assert result == new_library
        mock_client.get.assert_called_once()
        mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_folder_structure(self, sharepoint_service):
        """Test folder structure creation."""
        folder_template = {
            "Folder1": {
                "SubFolder1": {},
                "SubFolder2": {},
            },
            "Folder2": {},
        }

        # Mock drive response
        drive_response = Mock(spec=Response)
        drive_response.status_code = 200
        drive_response.json.return_value = {"id": "drive-123"}

        # Mock folder creation responses
        folder_response = Mock(spec=Response)
        folder_response.status_code = 201
        folder_response.json.return_value = {
            "id": "folder-id",
            "name": "folder-name",
        }

        mock_client = sharepoint_service._mock_client
        mock_client.get.return_value = drive_response
        mock_client.post.return_value = folder_response

        result = await sharepoint_service.create_folder_structure(
            site_id="site-123",
            library_id="library-123",
            folder_template=folder_template,
            correlation_id="test-correlation",
        )

        # Should create 4 folders total (2 root + 2 sub)
        assert len(result) == 4
        assert mock_client.post.call_count == 4

    @pytest.mark.asyncio
    async def test_break_permission_inheritance(self, sharepoint_service):
        """Test breaking permission inheritance."""
        # Mock response
        response = Mock(spec=Response)
        response.status_code = 204

        mock_client = sharepoint_service._mock_client
        mock_client.post.return_value = response

        result = await sharepoint_service.break_permission_inheritance(
            site_id="site-123",
            item_id="item-123",
            copy_role_assignments=False,
            correlation_id="test-correlation",
        )

        assert result is True
        mock_client.post.assert_called_once()

        # Check the call arguments
        call_args = mock_client.post.call_args
        assert "/permissions/breakInheritance" in call_args[0][0]
        assert call_args[1]["json"]["copyRoleAssignments"] is False

    def test_generate_folder_template_from_structure(self, sharepoint_service):
        """Test folder template generation from structure definition."""
        structure = """
📁 Root1
    📁 Sub1
    📁 Sub2
        📁 SubSub1
📁 Root2
        """

        template = sharepoint_service.generate_folder_template_from_structure(structure)

        assert "Root1" in template
        assert "Root2" in template
        assert "Sub1" in template["Root1"]
        assert "Sub2" in template["Root1"]
        assert "SubSub1" in template["Root1"]["Sub2"]


class TestGraphRetryAdapter:
    """Test cases for Graph API retry adapter."""

    @pytest.mark.asyncio
    async def test_successful_request(self, retry_adapter):
        """Test successful request without retry."""
        mock_response = Mock(spec=Response)
        mock_response.status_code = 200
        mock_response.headers = {}

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.return_value = mock_response

        result = await retry_adapter.execute_with_retry(
            client=mock_client,
            method="GET",
            url="/test",
        )

        assert result == mock_response
        assert mock_client.request.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_on_500_error(self, retry_adapter):
        """Test retry on server error."""
        # First two calls fail, third succeeds
        error_response = Mock(spec=Response)
        error_response.status_code = 500
        error_response.headers = {}
        error_response.request = Mock()

        success_response = Mock(spec=Response)
        success_response.status_code = 200
        success_response.headers = {}

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.side_effect = [
            error_response,
            error_response,
            success_response,
        ]

        result = await retry_adapter.execute_with_retry(
            client=mock_client,
            method="GET",
            url="/test",
        )

        assert result == success_response
        assert mock_client.request.call_count == 3

    @pytest.mark.asyncio
    async def test_rate_limit_handling(self, retry_adapter):
        """Test handling of 429 rate limit response."""
        rate_limit_response = Mock(spec=Response)
        rate_limit_response.status_code = 429
        rate_limit_response.headers = {"Retry-After": "1"}
        rate_limit_response.request = Mock()

        success_response = Mock(spec=Response)
        success_response.status_code = 200
        success_response.headers = {}

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.side_effect = [
            rate_limit_response,
            success_response,
        ]

        start_time = time.time()
        result = await retry_adapter.execute_with_retry(
            client=mock_client,
            method="GET",
            url="/test",
        )
        elapsed = time.time() - start_time

        assert result == success_response
        assert mock_client.request.call_count == 2
        # Should have waited at least some time for retry
        assert elapsed >= 0.1

    @pytest.mark.asyncio
    async def test_no_retry_on_client_error(self, retry_adapter):
        """Test no retry on 4xx client errors (except 429)."""
        client_error = Mock(spec=Response)
        client_error.status_code = 400
        client_error.headers = {}
        client_error.request = Mock()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.return_value = client_error

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await retry_adapter.execute_with_retry(
                client=mock_client,
                method="GET",
                url="/test",
            )

        assert "Client error: 400" in str(exc_info.value)
        assert mock_client.request.call_count == 1  # No retry

    @pytest.mark.asyncio
    async def test_circuit_breaker_opens(self, retry_adapter):
        """Test circuit breaker opening after repeated failures."""
        error_response = Mock(spec=Response)
        error_response.status_code = 500
        error_response.headers = {}
        error_response.request = Mock()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.request.return_value = error_response

        # Make multiple failing requests
        for i in range(6):  # More than failure threshold
            try:
                await retry_adapter.execute_with_retry(
                    client=mock_client,
                    method="GET",
                    url="/test",
                )
            except Exception:
                pass

        # Circuit should now be open
        assert retry_adapter.circuit_breaker.state == "open"

        # Next request should fail immediately
        with pytest.raises(Exception) as exc_info:
            await retry_adapter.execute_with_retry(
                client=mock_client,
                method="GET",
                url="/test",
            )

        assert "Circuit breaker is open" in str(exc_info.value)

    def test_rate_limit_tracker(self, retry_adapter):
        """Test rate limit tracking."""
        tracker = retry_adapter.rate_limiter

        # Initially should allow requests
        assert asyncio.run(tracker.check_rate_limit()) is True

        # Simulate hitting rate limit
        tracker.request_count = tracker.max_requests_per_minute
        assert asyncio.run(tracker.check_rate_limit()) is False

        # Reset window
        tracker.window_start = time.time() - 61
        assert asyncio.run(tracker.check_rate_limit()) is True
        assert tracker.request_count == 1  # Reset and incremented
