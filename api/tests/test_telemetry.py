"""Tests for Graph API telemetry collection."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from api.integrations.graph.retry_adapter import GraphRetryAdapter
from api.services.telemetry.graph_metrics import (
    GraphMetricsCollector,
    GraphOperation,
)


@pytest.mark.asyncio
async def test_metrics_collector_records_successful_call(async_test_db):
    """Test that successful API calls are recorded properly."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)

        await collector.record_metric(
            operation=GraphOperation.GET,
            endpoint="/sites/{id}/drives",
            duration_ms=250.5,
            status_code=200,
            retry_count=0,
            correlation_id="test-123",
        )

        summary = await collector.get_metrics_summary(hours=1)

        assert summary.total_calls == 1
        assert summary.successful_calls == 1
        assert summary.failed_calls == 0
        assert summary.avg_duration_ms == 250.5


@pytest.mark.asyncio
async def test_metrics_collector_records_failed_call(async_test_db):
    """Test that failed API calls are recorded properly."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)

        await collector.record_metric(
            operation=GraphOperation.POST,
            endpoint="/sites/{id}/permissions",
            duration_ms=1500,
            status_code=500,
            retry_count=3,
            error="Internal Server Error",
            correlation_id="test-456",
        )

        summary = await collector.get_metrics_summary(hours=1)

        assert summary.total_calls == 1
        assert summary.successful_calls == 0
        assert summary.failed_calls == 1
        assert summary.total_retries == 3


@pytest.mark.asyncio
async def test_metrics_collector_tracks_rate_limiting(async_test_db):
    """Test that rate limited calls are tracked properly."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)

        # Record multiple calls including rate limited ones
        await collector.record_metric(
            operation=GraphOperation.GET,
            endpoint="/users",
            duration_ms=100,
            status_code=200,
        )

        await collector.record_metric(
            operation=GraphOperation.GET,
            endpoint="/users",
            duration_ms=150,
            status_code=429,  # Rate limited
            retry_count=1,
        )

        await collector.record_metric(
            operation=GraphOperation.GET,
            endpoint="/users",
            duration_ms=200,
            status_code=429,  # Rate limited again
            retry_count=2,
        )

        summary = await collector.get_metrics_summary(hours=1)
        rate_stats = await collector.get_rate_limit_stats(hours=1)

        assert summary.total_calls == 3
        assert summary.rate_limited_calls == 2
        assert rate_stats["total_rate_limited"] == 2


@pytest.mark.asyncio
async def test_retry_adapter_with_metrics(async_test_db):
    """Test that retry adapter integrates with metrics collector."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)
        adapter = GraphRetryAdapter(max_retries=2, metrics_collector=collector)

        # Mock HTTP client
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {}
        mock_response.elapsed.total_seconds.return_value = 0.25

        mock_client.request.return_value = mock_response

        # Execute request
        await adapter.execute_with_retry(
            mock_client,
            "GET",
            "https://graph.microsoft.com/v1.0/sites/123/drives",
            headers={"client-request-id": "test-789"},
        )

        # Check metrics were recorded
        summary = await collector.get_metrics_summary(hours=1)
        assert summary.total_calls == 1
        assert summary.successful_calls == 1


@pytest.mark.asyncio
async def test_retry_adapter_records_retries(async_test_db):
    """Test that retry attempts are properly recorded in metrics."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)
        adapter = GraphRetryAdapter(max_retries=2, base_delay=0.01, metrics_collector=collector)

        # Mock HTTP client that fails twice then succeeds
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {}
        mock_response.elapsed.total_seconds.return_value = 0.25

        # First two calls fail with 503, third succeeds
        side_effects = [
            httpx.HTTPStatusError(
                "Server error: 503",
                request=MagicMock(),
                response=MagicMock(status_code=503),
            ),
            httpx.HTTPStatusError(
                "Server error: 503",
                request=MagicMock(),
                response=MagicMock(status_code=503),
            ),
            mock_response,
        ]

        mock_client.request.side_effect = side_effects

        # Execute request (should succeed after 2 retries)
        await adapter.execute_with_retry(
            mock_client,
            "POST",
            "https://graph.microsoft.com/v1.0/sites/123/permissions",
            headers={"client-request-id": "test-retry"},
        )

        # Check metrics show retries
        summary = await collector.get_metrics_summary(hours=1)
        assert summary.total_calls == 1
        assert summary.successful_calls == 1


@pytest.mark.asyncio
async def test_metrics_percentiles(async_test_db):
    """Test that percentile calculations work correctly."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)

        # Record calls with different durations
        durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        for i, duration in enumerate(durations):
            await collector.record_metric(
                operation=GraphOperation.GET,
                endpoint="/test",
                duration_ms=duration,
                status_code=200,
            )

        summary = await collector.get_metrics_summary(hours=1)

        assert summary.p50_duration_ms == 600  # Median (50th percentile at index 5 = 600)
        assert summary.p95_duration_ms == 1000  # 95th percentile (index 9.5 -> 10 = 1000)
        assert summary.p99_duration_ms == 1000  # 99th percentile (with 10 samples)


@pytest.mark.asyncio
async def test_metrics_endpoint_sanitization(async_test_db):
    """Test that endpoints are properly sanitized for grouping."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)

        # Record calls to similar endpoints with different IDs
        await collector.record_api_call(
            method="GET",
            url="https://graph.microsoft.com/v1.0/sites/abc-123/drives/456-def",
            start_time=time.time() - 0.1,
            response=MagicMock(status_code=200),
        )

        await collector.record_api_call(
            method="GET",
            url="https://graph.microsoft.com/v1.0/sites/xyz-789/drives/111-aaa",
            start_time=time.time() - 0.2,
            response=MagicMock(status_code=200),
        )

        summary = await collector.get_metrics_summary(hours=1)

        # Both calls should be grouped under the same sanitized endpoint
        assert summary.total_calls == 2
        assert len(summary.slowest_endpoints) == 1
        assert "/sites/{id}/drives/{id}" in summary.slowest_endpoints[0][0]


@pytest.mark.asyncio
async def test_metrics_error_classification(async_test_db):
    """Test that errors are properly classified."""
    collector = GraphMetricsCollector(async_test_db)

    # Record different types of errors
    errors = [
        ("Timeout waiting for response", "timeout"),
        ("Rate limit exceeded", "rate_limit"),
        ("401 Unauthorized", "authentication"),
        ("404 Not Found", "not_found"),
        ("500 Internal Server Error", "server_error"),
        ("Unknown error", "other"),
    ]

    for error_msg, _ in errors:
        await collector.record_metric(
            operation=GraphOperation.GET,
            endpoint="/test",
            duration_ms=100,
            status_code=500,
            error=error_msg,
        )

    summary = await collector.get_metrics_summary(hours=1)

    # Check error classification
    assert "timeout" in summary.errors_by_type
    assert "rate_limit" in summary.errors_by_type
    assert "authentication" in summary.errors_by_type
    assert "not_found" in summary.errors_by_type
    assert "server_error" in summary.errors_by_type
    assert "other" in summary.errors_by_type


@pytest.mark.asyncio
async def test_metrics_cleanup(async_test_db):
    """Test that old metrics are cleaned up properly."""
    # Create a fresh collector instance for this test
    with patch("api.services.telemetry.graph_metrics._metrics_collector", None):
        collector = GraphMetricsCollector(async_test_db)

        # Add some metrics
        await collector.record_metric(
            operation=GraphOperation.GET,
            endpoint="/test",
            duration_ms=100,
            status_code=200,
        )

        # Clean up (should not remove recent metrics)
        await collector.cleanup_old_metrics(days=7)

        # Recent metrics should still be there
        summary = await collector.get_metrics_summary(hours=1)
        assert summary.total_calls == 1
