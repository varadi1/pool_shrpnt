"""Retry adapter for Graph API with rate limiting and exponential backoff."""

import asyncio
import logging
import random
import time
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any, TypeVar

import httpx

from api.services.telemetry.graph_metrics import GraphMetricsCollector

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RateLimitTracker:
    """Track rate limit status for Graph API."""

    def __init__(self):
        """Initialize rate limit tracker."""
        self.retry_after: datetime | None = None
        self.request_count = 0
        self.window_start = time.time()
        self.max_requests_per_minute = 50  # Conservative limit
        self._lock = asyncio.Lock()

    async def check_rate_limit(self) -> bool:
        """Check if we should proceed with request.

        Returns:
            bool: True if request can proceed, False if rate limited
        """
        async with self._lock:
            now = datetime.now()

            # Check if we're in a retry-after period
            if self.retry_after and now < self.retry_after:
                wait_seconds = (self.retry_after - now).total_seconds()
                logger.warning(
                    f"Rate limited. Waiting {wait_seconds:.1f} seconds until {self.retry_after}"
                )
                return False

            # Check our own rate limiting
            current_time = time.time()
            if current_time - self.window_start > 60:
                # Reset window
                self.request_count = 0
                self.window_start = current_time

            if self.request_count >= self.max_requests_per_minute:
                logger.warning("Approaching rate limit, throttling requests")
                return False

            self.request_count += 1
            return True

    async def set_retry_after(self, seconds: int) -> None:
        """Set retry-after period from 429 response.

        Args:
            seconds: Number of seconds to wait
        """
        async with self._lock:
            self.retry_after = datetime.now() + timedelta(seconds=seconds)
            logger.info(f"Rate limit hit. Retry after {seconds} seconds")


class CircuitBreaker:
    """Circuit breaker for handling repeated failures."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        """Initialize circuit breaker.

        Args:
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Seconds to wait before attempting recovery
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: float | None = None
        self.state = "closed"  # closed, open, half-open
        self._lock = asyncio.Lock()

    async def call_with_circuit_breaker(
        self,
        func: Callable[..., T],
        *args: Any,
        **kwargs: Any,
    ) -> T:
        """Execute function with circuit breaker protection.

        Args:
            func: Function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            Function result

        Raises:
            Exception: If circuit is open or function fails
        """
        async with self._lock:
            # Check circuit state
            if self.state == "open":
                if (
                    self.last_failure_time
                    and time.time() - self.last_failure_time > self.recovery_timeout
                ):
                    self.state = "half-open"
                    logger.info("Circuit breaker entering half-open state")
                else:
                    raise Exception("Circuit breaker is open - service unavailable")

        try:
            result = await func(*args, **kwargs)

            # Success - reset failure count
            async with self._lock:
                if self.state == "half-open":
                    self.state = "closed"
                    logger.info("Circuit breaker closed - service recovered")
                self.failure_count = 0

            return result

        except Exception as e:
            async with self._lock:
                self.failure_count += 1
                self.last_failure_time = time.time()

                if self.failure_count >= self.failure_threshold:
                    self.state = "open"
                    logger.error(f"Circuit breaker opened after {self.failure_count} failures")

            raise e


class GraphRetryAdapter:
    """Retry adapter for Graph API with exponential backoff and rate limiting."""

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        metrics_collector: GraphMetricsCollector | None = None,
    ):
        """Initialize retry adapter.

        Args:
            max_retries: Maximum number of retry attempts
            base_delay: Base delay in seconds for exponential backoff
            max_delay: Maximum delay in seconds
            exponential_base: Base for exponential backoff calculation
            metrics_collector: Optional metrics collector for telemetry
        """
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.rate_limiter = RateLimitTracker()
        self.circuit_breaker = CircuitBreaker()
        self.metrics_collector = metrics_collector

    async def execute_with_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """Execute HTTP request with retry logic.

        Args:
            client: HTTP client
            method: HTTP method
            url: Request URL
            **kwargs: Additional request arguments

        Returns:
            HTTP response

        Raises:
            Exception: If all retries are exhausted
        """
        correlation_id = kwargs.get("headers", {}).get("client-request-id", "unknown")
        start_time = time.time()
        retry_count = 0

        async def make_request() -> httpx.Response:
            # Check rate limit
            while not await self.rate_limiter.check_rate_limit():
                await asyncio.sleep(1)

            # Make the actual request
            response = await client.request(method, url, **kwargs)

            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", "60"))
                await self.rate_limiter.set_retry_after(retry_after)
                raise httpx.HTTPStatusError(
                    f"Rate limited - retry after {retry_after} seconds",
                    request=response.request,
                    response=response,
                )

            # Handle client errors (4xx except 429)
            if 400 <= response.status_code < 500 and response.status_code != 429:
                raise httpx.HTTPStatusError(
                    f"Client error: {response.status_code}",
                    request=response.request,
                    response=response,
                )

            # Handle server errors
            if response.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"Server error: {response.status_code}",
                    request=response.request,
                    response=response,
                )

            return response

        # Execute with circuit breaker and retry logic
        last_exception = None

        for attempt in range(self.max_retries + 1):
            try:
                response = await self.circuit_breaker.call_with_circuit_breaker(make_request)

                # Record successful metric
                if self.metrics_collector:
                    await self.metrics_collector.record_api_call(
                        method=method,
                        url=url,
                        start_time=start_time,
                        response=response,
                        retry_count=retry_count,
                        correlation_id=correlation_id,
                    )

                # Log successful request
                if attempt > 0:
                    logger.info(
                        f"Request succeeded after {attempt} retries",
                        extra={"correlation_id": correlation_id},
                    )

                return response

            except (httpx.HTTPStatusError, httpx.RequestError) as e:
                last_exception = e
                retry_count = attempt

                # Don't retry on client errors (4xx except 429)
                if isinstance(e, httpx.HTTPStatusError):
                    if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                        # Record failed metric
                        if self.metrics_collector:
                            await self.metrics_collector.record_api_call(
                                method=method,
                                url=url,
                                start_time=start_time,
                                response=e.response,
                                error=e,
                                retry_count=retry_count,
                                correlation_id=correlation_id,
                            )

                        logger.error(
                            f"Client error {e.response.status_code} - not retrying",
                            extra={"correlation_id": correlation_id},
                        )
                        raise

                if attempt < self.max_retries:
                    # Calculate delay with exponential backoff and jitter
                    delay = min(self.base_delay * (self.exponential_base**attempt), self.max_delay)
                    jitter = random.uniform(0, delay * 0.1)  # Add 10% jitter
                    total_delay = delay + jitter

                    logger.warning(
                        f"Request failed (attempt {attempt + 1}/{self.max_retries + 1}). "
                        f"Retrying in {total_delay:.1f} seconds. Error: {str(e)}",
                        extra={"correlation_id": correlation_id},
                    )

                    await asyncio.sleep(total_delay)
                else:
                    # Record final failed metric
                    if self.metrics_collector:
                        await self.metrics_collector.record_api_call(
                            method=method,
                            url=url,
                            start_time=start_time,
                            error=e,
                            retry_count=retry_count,
                            correlation_id=correlation_id,
                        )

                    logger.error(
                        f"Request failed after {self.max_retries + 1} attempts",
                        extra={"correlation_id": correlation_id},
                    )

        # All retries exhausted
        if last_exception:
            raise last_exception
        else:
            raise Exception(f"Request failed after {self.max_retries + 1} attempts")

    def create_client_with_retry(
        self,
        base_url: str = "https://graph.microsoft.com/v1.0",
        timeout: int = 30,
    ) -> httpx.AsyncClient:
        """Create HTTP client with retry adapter.

        Args:
            base_url: Base URL for requests
            timeout: Request timeout in seconds

        Returns:
            Configured HTTP client
        """
        transport = httpx.AsyncHTTPTransport(retries=0)  # We handle retries ourselves

        return httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(timeout),
            transport=transport,
            event_hooks={
                "request": [self._log_request],
                "response": [self._log_response],
            },
        )

    async def _log_request(self, request: httpx.Request) -> None:
        """Log outgoing request.

        Args:
            request: HTTP request
        """
        correlation_id = request.headers.get("client-request-id", "unknown")
        logger.debug(
            f"Graph API request: {request.method} {request.url}",
            extra={"correlation_id": correlation_id},
        )

    async def _log_response(self, response: httpx.Response) -> None:
        """Log incoming response.

        Args:
            response: HTTP response
        """
        correlation_id = response.request.headers.get("client-request-id", "unknown")
        logger.debug(
            f"Graph API response: {response.status_code} from {response.request.url}",
            extra={
                "correlation_id": correlation_id,
                "duration_ms": response.elapsed.total_seconds() * 1000,
            },
        )

    async def get(self, url: str, headers: dict) -> httpx.Response:
        """Execute GET request with retry."""
        async with httpx.AsyncClient() as client:
            return await self.execute_with_retry(client, "GET", url, headers=headers)

    async def post(self, url: str, json: dict = None, headers: dict = None) -> httpx.Response:
        """Execute POST request with retry."""
        async with httpx.AsyncClient() as client:
            return await self.execute_with_retry(client, "POST", url, json=json, headers=headers)

    async def patch(self, url: str, json: dict = None, headers: dict = None) -> httpx.Response:
        """Execute PATCH request with retry."""
        async with httpx.AsyncClient() as client:
            return await self.execute_with_retry(client, "PATCH", url, json=json, headers=headers)

    async def delete(self, url: str, headers: dict = None) -> httpx.Response:
        """Execute DELETE request with retry."""
        async with httpx.AsyncClient() as client:
            return await self.execute_with_retry(client, "DELETE", url, headers=headers)


# Global retry adapter instance
graph_retry_adapter = GraphRetryAdapter()
