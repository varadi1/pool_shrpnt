"""Retry logic utilities for handling transient failures."""

import asyncio
import random
from collections.abc import Callable
from functools import wraps
from typing import Any

from api.core.logging import get_logger

logger = get_logger(__name__)


class RetryConfig:
    """Configuration for retry behavior."""

    def __init__(
        self,
        max_attempts: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        retry_on: tuple[type[Exception], ...] | None = None,
    ):
        """Initialize retry configuration.

        Args:
            max_attempts: Maximum number of retry attempts
            initial_delay: Initial delay in seconds
            max_delay: Maximum delay in seconds
            exponential_base: Base for exponential backoff
            jitter: Whether to add jitter to delays
            retry_on: Tuple of exception types to retry on
        """
        self.max_attempts = max_attempts
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.retry_on = retry_on or (Exception,)

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for a given attempt.

        Args:
            attempt: Attempt number (0-based)

        Returns:
            Delay in seconds
        """
        delay = min(self.initial_delay * (self.exponential_base**attempt), self.max_delay)

        if self.jitter:
            # Add jitter: random value between 0 and 25% of delay
            jitter_amount = delay * 0.25 * random.random()
            delay += jitter_amount

        return delay


def with_retry(config: RetryConfig | None = None):
    """Decorator for adding retry logic to async functions.

    Args:
        config: Retry configuration

    Returns:
        Decorated function
    """
    if config is None:
        config = RetryConfig()

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            last_exception = None

            for attempt in range(config.max_attempts):
                try:
                    result = await func(*args, **kwargs)

                    if attempt > 0:
                        logger.info(
                            f"Retry successful for {func.__name__} after {attempt} attempts"
                        )

                    return result

                except config.retry_on as e:
                    last_exception = e

                    if attempt < config.max_attempts - 1:
                        delay = config.calculate_delay(attempt)

                        logger.warning(
                            f"Attempt {attempt + 1}/{config.max_attempts} failed "
                            f"for {func.__name__}: {str(e)}. "
                            f"Retrying in {delay:.2f} seconds..."
                        )

                        await asyncio.sleep(delay)
                    else:
                        logger.error(
                            f"All {config.max_attempts} attempts failed "
                            f"for {func.__name__}: {str(e)}"
                        )

            # All attempts failed
            if last_exception:
                raise last_exception

        return wrapper

    return decorator


class GraphAPIRetryConfig(RetryConfig):
    """Specialized retry configuration for Microsoft Graph API calls."""

    def __init__(self):
        super().__init__(
            max_attempts=5,
            initial_delay=2.0,
            max_delay=120.0,
            exponential_base=2.0,
            jitter=True,
        )

    def calculate_delay_from_headers(
        self,
        headers: dict,
        attempt: int,
    ) -> float:
        """Calculate delay based on rate limit headers.

        Args:
            headers: Response headers
            attempt: Attempt number

        Returns:
            Delay in seconds
        """
        # Check for Retry-After header
        retry_after = headers.get("Retry-After")
        if retry_after:
            try:
                return float(retry_after)
            except (ValueError, TypeError):
                pass

        # Check for RateLimit headers
        rate_limit_reset = headers.get("RateLimit-Reset")
        if rate_limit_reset:
            try:
                # Calculate delay until reset
                import time

                reset_time = float(rate_limit_reset)
                current_time = time.time()
                if reset_time > current_time:
                    return reset_time - current_time
            except (ValueError, TypeError):
                pass

        # Fall back to exponential backoff
        return self.calculate_delay(attempt)


async def retry_async(func: Callable, *args, config: RetryConfig | None = None, **kwargs) -> Any:
    """Execute an async function with retry logic.

    Args:
        func: Async function to execute
        *args: Positional arguments for func
        config: Retry configuration
        **kwargs: Keyword arguments for func

    Returns:
        Result from func

    Raises:
        Last exception if all retries fail
    """
    if config is None:
        config = RetryConfig()

    last_exception = None

    for attempt in range(config.max_attempts):
        try:
            result = await func(*args, **kwargs)

            if attempt > 0:
                logger.info(f"Retry successful for {func.__name__} after {attempt} attempts")

            return result

        except config.retry_on as e:
            last_exception = e

            if attempt < config.max_attempts - 1:
                delay = config.calculate_delay(attempt)

                logger.warning(
                    f"Attempt {attempt + 1}/{config.max_attempts} failed: {str(e)}. "
                    f"Retrying in {delay:.2f} seconds..."
                )

                await asyncio.sleep(delay)
            else:
                logger.error(f"All {config.max_attempts} attempts failed: {str(e)}")

    # All attempts failed
    if last_exception:
        raise last_exception


def exponential_backoff_with_jitter(
    attempt: int, base_delay: float = 1.0, max_delay: float = 60.0
) -> float:
    """Calculate exponential backoff delay with jitter.

    Args:
        attempt: Attempt number (0-based)
        base_delay: Base delay in seconds
        max_delay: Maximum delay in seconds

    Returns:
        Delay in seconds with jitter applied
    """
    delay = min(base_delay * (2**attempt), max_delay)
    jitter = delay * 0.25 * random.random()
    return delay + jitter


def is_transient_error(exception: Exception) -> bool:
    """Check if an exception is a transient error that should be retried.

    Args:
        exception: Exception to check

    Returns:
        True if error is transient
    """
    transient_messages = [
        "timeout",
        "timed out",
        "connection reset",
        "connection refused",
        "temporarily unavailable",
        "service unavailable",
        "throttled",
        "rate limit",
        "too many requests",
        "network unreachable",
        "gateway timeout",
        "bad gateway",
    ]

    error_message = str(exception).lower()
    return any(msg in error_message for msg in transient_messages)


class CircuitBreaker:
    """Circuit breaker for preventing cascading failures."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exception: type[Exception] = Exception,
    ):
        """Initialize circuit breaker.

        Args:
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Time to wait before attempting recovery
            expected_exception: Exception type to track
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception

        self.failure_count = 0
        self.last_failure_time: float | None = None
        self.state = "closed"  # closed, open, half-open

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Call function with circuit breaker protection.

        Args:
            func: Function to call
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            Function result

        Raises:
            Exception: If circuit is open or function fails
        """
        if self.state == "open":
            if self._should_attempt_reset():
                self.state = "half-open"
            else:
                raise Exception(f"Circuit breaker is open for {func.__name__}")

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result

        except self.expected_exception as e:
            self._on_failure()
            raise e

    def _should_attempt_reset(self) -> bool:
        """Check if we should attempt to reset the circuit."""
        if self.last_failure_time is None:
            return True

        import time

        return (time.time() - self.last_failure_time) >= self.recovery_timeout

    def _on_success(self):
        """Handle successful call."""
        self.failure_count = 0
        self.state = "closed"

    def _on_failure(self):
        """Handle failed call."""
        import time

        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold:
            self.state = "open"
            logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
