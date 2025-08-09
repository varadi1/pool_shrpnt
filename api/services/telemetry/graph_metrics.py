"""Telemetry service for Graph API performance metrics.

Collects and reports metrics on Graph API calls including:
- Response times
- Success/failure rates
- Rate limiting occurrences
- Retry counts
"""

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.models.audit import AuditLog

logger = logging.getLogger(__name__)


class GraphOperation(str, Enum):
    """Types of Graph API operations."""

    GET = "GET"
    POST = "POST"
    PATCH = "PATCH"
    DELETE = "DELETE"
    BATCH = "BATCH"


@dataclass
class GraphMetric:
    """Single Graph API call metric."""

    operation: GraphOperation
    endpoint: str
    duration_ms: float
    status_code: int
    success: bool
    retry_count: int = 0
    rate_limited: bool = False
    error: str | None = None
    correlation_id: str | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class GraphMetricsSummary:
    """Summary of Graph API metrics over a time period."""

    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rate_limited_calls: int = 0
    total_retries: int = 0
    avg_duration_ms: float = 0.0
    p50_duration_ms: float = 0.0
    p95_duration_ms: float = 0.0
    p99_duration_ms: float = 0.0
    calls_by_operation: dict[str, int] = field(default_factory=dict)
    errors_by_type: dict[str, int] = field(default_factory=dict)
    slowest_endpoints: list[tuple[str, float]] = field(default_factory=list)


class GraphMetricsCollector:
    """Collects and aggregates Graph API performance metrics."""

    def __init__(self, db_session: AsyncSession | None = None):
        self.db = db_session
        self._metrics_buffer: list[GraphMetric] = []
        self._metrics_by_hour: defaultdict[str, list[GraphMetric]] = defaultdict(list)
        self._flush_interval = 100  # Flush to DB every 100 metrics
        self._enabled = settings.enable_telemetry if hasattr(settings, "enable_telemetry") else True

    async def record_metric(
        self,
        operation: GraphOperation,
        endpoint: str,
        duration_ms: float,
        status_code: int,
        retry_count: int = 0,
        error: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        """Record a Graph API call metric.

        Args:
            operation: HTTP operation type
            endpoint: API endpoint called
            duration_ms: Call duration in milliseconds
            status_code: HTTP status code
            retry_count: Number of retries performed
            error: Error message if failed
            correlation_id: Request correlation ID
        """
        if not self._enabled:
            return

        metric = GraphMetric(
            operation=operation,
            endpoint=self._sanitize_endpoint(endpoint),
            duration_ms=duration_ms,
            status_code=status_code,
            success=200 <= status_code < 300,
            retry_count=retry_count,
            rate_limited=status_code == 429,
            error=error,
            correlation_id=correlation_id,
        )

        self._metrics_buffer.append(metric)

        # Add to hourly bucket for aggregation
        hour_key = metric.timestamp.strftime("%Y%m%d%H")
        self._metrics_by_hour[hour_key].append(metric)

        # Log slow requests
        if duration_ms > 5000:  # Over 5 seconds
            logger.warning(
                f"Slow Graph API call: {operation} {endpoint} took {duration_ms}ms",
                extra={
                    "endpoint": endpoint,
                    "duration_ms": duration_ms,
                    "status_code": status_code,
                    "correlation_id": correlation_id,
                },
            )

        # Flush buffer if needed
        if len(self._metrics_buffer) >= self._flush_interval:
            await self._flush_metrics()

    async def record_api_call(
        self,
        method: str,
        url: str,
        start_time: float,
        response: Any = None,
        error: Exception | None = None,
        retry_count: int = 0,
        correlation_id: str | None = None,
    ) -> None:
        """Record metrics from an API call with timing.

        Args:
            method: HTTP method
            url: Full URL called
            start_time: Call start time from time.time()
            response: HTTP response object
            error: Exception if call failed
            retry_count: Number of retries
            correlation_id: Request correlation ID
        """
        duration_ms = (time.time() - start_time) * 1000

        if response:
            status_code = response.status_code if hasattr(response, "status_code") else 200
        elif error:
            status_code = 500
        else:
            status_code = 0

        endpoint = self._extract_endpoint(url)
        operation = (
            GraphOperation[method.upper()]
            if method.upper() in GraphOperation.__members__
            else GraphOperation.GET
        )

        await self.record_metric(
            operation=operation,
            endpoint=endpoint,
            duration_ms=duration_ms,
            status_code=status_code,
            retry_count=retry_count,
            error=str(error) if error else None,
            correlation_id=correlation_id,
        )

    async def get_metrics_summary(
        self, hours: int = 1, operation: GraphOperation | None = None
    ) -> GraphMetricsSummary:
        """Get summary of metrics over specified time period.

        Args:
            hours: Number of hours to look back
            operation: Optional filter by operation type

        Returns:
            Summary of Graph API metrics
        """
        cutoff = datetime.now(UTC) - timedelta(hours=hours)

        # Collect all metrics from hourly buckets (buffer is just for flushing to DB)
        all_metrics = []
        for hour_key, metrics in self._metrics_by_hour.items():
            for metric in metrics:
                if metric.timestamp >= cutoff:
                    if not operation or metric.operation == operation:
                        all_metrics.append(metric)

        if not all_metrics:
            return GraphMetricsSummary()

        # Calculate summary statistics
        summary = GraphMetricsSummary(
            total_calls=len(all_metrics),
            successful_calls=sum(1 for m in all_metrics if m.success),
            failed_calls=sum(1 for m in all_metrics if not m.success),
            rate_limited_calls=sum(1 for m in all_metrics if m.rate_limited),
            total_retries=sum(m.retry_count for m in all_metrics),
        )

        # Duration statistics
        durations = sorted([m.duration_ms for m in all_metrics])
        summary.avg_duration_ms = sum(durations) / len(durations)
        summary.p50_duration_ms = self._percentile(durations, 50)
        summary.p95_duration_ms = self._percentile(durations, 95)
        summary.p99_duration_ms = self._percentile(durations, 99)

        # Calls by operation
        for metric in all_metrics:
            op_key = metric.operation.value
            summary.calls_by_operation[op_key] = summary.calls_by_operation.get(op_key, 0) + 1

        # Errors by type
        for metric in all_metrics:
            if metric.error:
                error_type = self._classify_error(metric.error)
                summary.errors_by_type[error_type] = summary.errors_by_type.get(error_type, 0) + 1

        # Slowest endpoints
        endpoint_durations = defaultdict(list)
        for metric in all_metrics:
            endpoint_durations[metric.endpoint].append(metric.duration_ms)

        avg_by_endpoint = [
            (endpoint, sum(durations) / len(durations))
            for endpoint, durations in endpoint_durations.items()
        ]
        summary.slowest_endpoints = sorted(avg_by_endpoint, key=lambda x: x[1], reverse=True)[:10]

        return summary

    async def get_rate_limit_stats(self, hours: int = 24) -> dict[str, Any]:
        """Get rate limiting statistics.

        Args:
            hours: Number of hours to analyze

        Returns:
            Rate limiting statistics
        """
        cutoff = datetime.now(UTC) - timedelta(hours=hours)

        rate_limited = []
        for hour_key, metrics in self._metrics_by_hour.items():
            for metric in metrics:
                if metric.timestamp >= cutoff and metric.rate_limited:
                    rate_limited.append(metric)

        if not rate_limited:
            return {"total_rate_limited": 0, "rate_limit_periods": [], "most_limited_endpoints": []}

        # Group by time windows to find bursts
        periods = []
        current_period = None
        for metric in sorted(rate_limited, key=lambda m: m.timestamp):
            if not current_period or (metric.timestamp - current_period["end"]) > timedelta(
                minutes=5
            ):
                if current_period:
                    periods.append(current_period)
                current_period = {
                    "start": metric.timestamp,
                    "end": metric.timestamp,
                    "count": 1,
                    "endpoints": [metric.endpoint],
                }
            else:
                current_period["end"] = metric.timestamp
                current_period["count"] += 1
                current_period["endpoints"].append(metric.endpoint)

        if current_period:
            periods.append(current_period)

        # Find most rate-limited endpoints
        endpoint_counts = defaultdict(int)
        for metric in rate_limited:
            endpoint_counts[metric.endpoint] += 1

        most_limited = sorted(endpoint_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "total_rate_limited": len(rate_limited),
            "rate_limit_periods": periods,
            "most_limited_endpoints": most_limited,
            "avg_retries_per_limited_call": sum(m.retry_count for m in rate_limited)
            / len(rate_limited),
        }

    async def _flush_metrics(self) -> None:
        """Flush metrics buffer to database."""
        if not self.db or not self._metrics_buffer:
            return

        try:
            for metric in self._metrics_buffer:
                audit_entry = AuditLog(
                    action="graph_api_metric",
                    entity_type="graph_api",
                    entity_id=metric.endpoint,
                    user_id="system",
                    correlation_id=metric.correlation_id or "unknown",
                    details={
                        "operation": metric.operation.value,
                        "duration_ms": metric.duration_ms,
                        "status_code": metric.status_code,
                        "success": metric.success,
                        "retry_count": metric.retry_count,
                        "rate_limited": metric.rate_limited,
                        "error": metric.error,
                    },
                    timestamp=metric.timestamp,
                )
                self.db.add(audit_entry)

            await self.db.flush()
            self._metrics_buffer.clear()

        except Exception as e:
            logger.error(f"Failed to flush Graph API metrics: {e}")

    def _sanitize_endpoint(self, endpoint: str) -> str:
        """Sanitize endpoint URL to remove IDs for grouping."""
        import re

        # Remove GUIDs
        endpoint = re.sub(
            r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", "{id}", endpoint
        )

        # Remove specific ID patterns (abc-123, xyz-789, 456-def, etc.)
        # Match patterns like letters-numbers or numbers-letters
        endpoint = re.sub(r"/[a-z]+-\d+(?=/|$)", "/{id}", endpoint, flags=re.IGNORECASE)
        endpoint = re.sub(r"/\d+-[a-z]+(?=/|$)", "/{id}", endpoint, flags=re.IGNORECASE)

        # Remove pure numeric IDs
        endpoint = re.sub(r"/\d+(?=/|$)", "/{id}", endpoint)

        # Remove query parameters
        if "?" in endpoint:
            endpoint = endpoint.split("?")[0]

        return endpoint

    def _extract_endpoint(self, url: str) -> str:
        """Extract endpoint from full URL."""
        if "graph.microsoft.com" in url:
            parts = url.split("graph.microsoft.com")[-1]
            return self._sanitize_endpoint(parts)
        return self._sanitize_endpoint(url)

    def _percentile(self, values: list[float], percentile: int) -> float:
        """Calculate percentile value."""
        if not values:
            return 0.0

        index = int(len(values) * percentile / 100)
        if index >= len(values):
            index = len(values) - 1

        return values[index]

    def _classify_error(self, error: str) -> str:
        """Classify error type from error message."""
        error_lower = error.lower()

        if "timeout" in error_lower:
            return "timeout"
        elif "rate" in error_lower or "429" in error:
            return "rate_limit"
        elif "auth" in error_lower or "401" in error or "403" in error:
            return "authentication"
        elif "not found" in error_lower or "404" in error:
            return "not_found"
        elif "server" in error_lower or "500" in error or "503" in error:
            return "server_error"
        else:
            return "other"

    async def cleanup_old_metrics(self, days: int = 7) -> int:
        """Clean up metrics older than specified days.

        Args:
            days: Number of days to keep metrics

        Returns:
            Number of metrics cleaned
        """
        cutoff = datetime.now(UTC) - timedelta(days=days)

        # Clean in-memory metrics
        cleaned = 0
        for hour_key in list(self._metrics_by_hour.keys()):
            hour_date = datetime.strptime(hour_key, "%Y%m%d%H").replace(tzinfo=UTC)
            if hour_date < cutoff:
                cleaned += len(self._metrics_by_hour[hour_key])
                del self._metrics_by_hour[hour_key]

        logger.info(f"Cleaned {cleaned} old Graph API metrics")
        return cleaned


# Global metrics collector instance
_metrics_collector: GraphMetricsCollector | None = None


def get_metrics_collector(db_session: AsyncSession | None = None) -> GraphMetricsCollector:
    """Get or create the global metrics collector instance."""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = GraphMetricsCollector(db_session)
    return _metrics_collector
