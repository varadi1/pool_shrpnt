"""Error handling utilities for the poolDRV API."""

import traceback
from typing import Any

from fastapi import Request, status
from fastapi.responses import JSONResponse

from api.core.logging import get_logger

logger = get_logger(__name__)


class PoolDRVError(Exception):
    """Base exception for poolDRV API errors."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}
        super().__init__(message)


class BadRequestError(PoolDRVError):
    """Raised when request is malformed or invalid."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_400_BAD_REQUEST, **kwargs)


class ValidationError(PoolDRVError):
    """Raised when validation fails."""

    def __init__(self, message: str, field: str | None = None, **kwargs):
        super().__init__(message, status.HTTP_400_BAD_REQUEST, **kwargs)
        if field:
            self.details["field"] = field


class NotFoundError(PoolDRVError):
    """Raised when a resource is not found."""

    def __init__(self, resource_type: str, resource_id: Any, **kwargs):
        message = f"{resource_type} with id {resource_id} not found"
        super().__init__(message, status.HTTP_404_NOT_FOUND, **kwargs)
        self.details["resource_type"] = resource_type
        self.details["resource_id"] = str(resource_id)


class ConflictError(PoolDRVError):
    """Raised when there's a conflict with existing data."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_409_CONFLICT, **kwargs)


class RateLimitError(PoolDRVError):
    """Raised when rate limit is exceeded."""

    def __init__(self, retry_after: int, **kwargs):
        message = f"Rate limit exceeded. Retry after {retry_after} seconds"
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS, **kwargs)
        self.details["retry_after"] = retry_after


class GraphAPIError(PoolDRVError):
    """Raised when Microsoft Graph API returns an error."""

    def __init__(
        self,
        message: str,
        graph_error: dict[str, Any] | None = None,
        status_code: int = status.HTTP_502_BAD_GATEWAY,
        **kwargs,
    ):
        # Allow callers to override status_code (e.g., 429 for throttling)
        super().__init__(message, status_code, **kwargs)
        if graph_error:
            self.details["graph_error"] = graph_error


class PermissionApplicationError(PoolDRVError):
    """Raised when permission application fails."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_500_INTERNAL_SERVER_ERROR, **kwargs)


class LockError(PoolDRVError):
    """Raised when lock operations fail."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_409_CONFLICT, **kwargs)


class PermissionError(PoolDRVError):
    """Raised when user lacks permissions."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_403_FORBIDDEN, **kwargs)


class ForbiddenError(PoolDRVError):
    """Raised when action is forbidden."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_403_FORBIDDEN, **kwargs)


class BatchProcessingError(PoolDRVError):
    """Raised when batch processing fails."""

    def __init__(self, message: str, **kwargs):
        super().__init__(message, status.HTTP_500_INTERNAL_SERVER_ERROR, **kwargs)


def map_graph_error_to_user_message(graph_error: dict[str, Any]) -> str:
    """Map Microsoft Graph API errors to user-friendly messages.

    Args:
        graph_error: Error response from Graph API

    Returns:
        User-friendly error message
    """
    error_code = graph_error.get("error", {}).get("code", "Unknown")
    error_message = graph_error.get("error", {}).get("message", "Unknown error")

    error_mappings = {
        "Request_ResourceNotFound": "The requested resource was not found in Microsoft 365",
        "Authorization_RequestDenied": "You don't have permission to perform this operation",
        "Request_BadRequest": "The request contains invalid data. Please check your input",
        "Directory_QuotaExceeded": (
            "Microsoft 365 quota exceeded. Please contact your administrator"
        ),
        "Request_Timeout": "The request to Microsoft 365 timed out. Please try again",
        "Service_ServiceUnavailable": "Microsoft 365 service is temporarily unavailable",
        "Authentication_Unauthorized": "Authentication failed. Please sign in again",
        "Request_EntityTooLarge": "The request data is too large",
        "Directory_ExpiredSubscription": "Your Microsoft 365 subscription has expired",
        "Request_ThrottledTemporarily": "Too many requests to Microsoft 365. Please wait a moment",
    }

    user_message = error_mappings.get(error_code)
    if user_message:
        return user_message

    # Check for specific keywords in the message
    if "throttl" in error_message.lower():
        return "Microsoft 365 is rate limiting requests. Please wait before trying again"
    elif "permission" in error_message.lower() or "access" in error_message.lower():
        return "Permission denied. Please check your access rights"
    elif "not found" in error_message.lower():
        return "The requested resource was not found in Microsoft 365"
    elif "exist" in error_message.lower():
        return "A resource with this name already exists"

    # Default message
    return f"Microsoft 365 error: {error_message}"


async def handle_pool_drv_error(request: Request, exc: PoolDRVError) -> JSONResponse:
    """Handle PoolDRV-specific errors.

    Args:
        request: The incoming request
        exc: The exception that was raised

    Returns:
        JSON error response
    """
    correlation_id = getattr(request.state, "correlation_id", "unknown")

    logger.error(
        f"{exc.error_code}: {exc.message}",
        extra={
            "correlation_id": correlation_id,
            "error_code": exc.error_code,
            "status_code": exc.status_code,
            "details": exc.details,
        },
    )

    response_content = {
        "error": {
            "code": exc.error_code,
            "message": exc.message,
            "correlation_id": correlation_id,
        }
    }

    if exc.details:
        response_content["error"]["details"] = exc.details

    # Add Retry-After header for rate limit errors
    headers = {}
    if isinstance(exc, RateLimitError) and "retry_after" in exc.details:
        headers["Retry-After"] = str(exc.details["retry_after"])

    return JSONResponse(
        status_code=exc.status_code,
        content=response_content,
        headers=headers,
    )


def create_error_response(
    status_code: int,
    message: str,
    correlation_id: str,
    error_code: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a standardized error response.

    Args:
        status_code: HTTP status code
        message: Error message
        correlation_id: Correlation ID for tracking
        error_code: Optional error code
        details: Optional additional details

    Returns:
        Error response dictionary
    """
    response = {
        "error": {
            "message": message,
            "correlation_id": correlation_id,
        }
    }

    if error_code:
        response["error"]["code"] = error_code

    if details:
        response["error"]["details"] = details

    return response


def log_exception_with_context(
    exc: Exception,
    correlation_id: str,
    context: dict[str, Any],
    include_traceback: bool = True,
) -> None:
    """Log an exception with full context.

    Args:
        exc: The exception to log
        correlation_id: Correlation ID
        context: Additional context to log
        include_traceback: Whether to include stack trace
    """
    error_info = {
        "correlation_id": correlation_id,
        "error_type": type(exc).__name__,
        "error_message": str(exc),
        **context,
    }

    if include_traceback:
        error_info["traceback"] = traceback.format_exc()

    logger.error(
        f"Exception occurred: {type(exc).__name__}: {str(exc)}",
        extra=error_info,
        exc_info=True,
    )
