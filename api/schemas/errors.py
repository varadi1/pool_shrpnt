"""Error response schemas for the API."""

from typing import Any

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Detailed error information."""

    field: str | None = Field(None, description="Field that caused the error")
    message: str = Field(..., description="Error message")
    code: str | None = Field(None, description="Error code")
    value: Any | None = Field(None, description="Invalid value that was provided")


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Main error message")
    correlation_id: str = Field(..., description="Correlation ID for tracking")
    code: str | None = Field(None, description="Error code")
    details: list[ErrorDetail] | None = Field(None, description="Field-level error details")


class ValidationErrorResponse(ErrorResponse):
    """Validation error response with field-level details."""

    code: str = Field(default="ValidationError")
    details: list[ErrorDetail] = Field(..., description="Field validation errors")


class RateLimitErrorResponse(ErrorResponse):
    """Rate limit error response."""

    code: str = Field(default="RateLimitExceeded")
    retry_after: int = Field(..., description="Seconds to wait before retrying")


class GraphAPIErrorResponse(ErrorResponse):
    """Microsoft Graph API error response."""

    code: str = Field(default="GraphAPIError")
    graph_error: dict[str, Any] = Field(..., description="Original Graph API error")


# OpenAPI response definitions for documentation
responses_400 = {
    "description": "Bad Request - Validation Error",
    "content": {
        "application/json": {
            "schema": ValidationErrorResponse.model_json_schema(),
            "example": {
                "error": "Validation failed",
                "correlation_id": "abc-123-def",
                "code": "ValidationError",
                "details": [
                    {
                        "field": "contract_number",
                        "message": "Contract number already exists",
                        "code": "duplicate",
                        "value": "C-2025-001",
                    }
                ],
            },
        }
    },
}

responses_404 = {
    "description": "Not Found",
    "content": {
        "application/json": {
            "schema": ErrorResponse.model_json_schema(),
            "example": {
                "error": "Contract with id 123 not found",
                "correlation_id": "abc-123-def",
                "code": "NotFound",
            },
        }
    },
}

responses_409 = {
    "description": "Conflict",
    "content": {
        "application/json": {
            "schema": ErrorResponse.model_json_schema(),
            "example": {
                "error": "Resource already exists",
                "correlation_id": "abc-123-def",
                "code": "Conflict",
            },
        }
    },
}

responses_429 = {
    "description": "Too Many Requests",
    "content": {
        "application/json": {
            "schema": RateLimitErrorResponse.model_json_schema(),
            "example": {
                "error": "Rate limit exceeded. Retry after 60 seconds",
                "correlation_id": "abc-123-def",
                "code": "RateLimitExceeded",
                "retry_after": 60,
            },
        }
    },
    "headers": {
        "Retry-After": {
            "description": "Number of seconds to wait before retrying",
            "schema": {"type": "integer"},
        }
    },
}

responses_500 = {
    "description": "Internal Server Error",
    "content": {
        "application/json": {
            "schema": ErrorResponse.model_json_schema(),
            "example": {
                "error": "Internal server error",
                "correlation_id": "abc-123-def",
                "code": "InternalError",
            },
        }
    },
}

responses_502 = {
    "description": "Bad Gateway - External Service Error",
    "content": {
        "application/json": {
            "schema": GraphAPIErrorResponse.model_json_schema(),
            "example": {
                "error": "Microsoft 365 service error",
                "correlation_id": "abc-123-def",
                "code": "GraphAPIError",
                "graph_error": {
                    "error": {"code": "Request_Timeout", "message": "The request timed out"}
                },
            },
        }
    },
}
