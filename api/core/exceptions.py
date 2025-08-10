"""
Backward-compatible exceptions module.

Tests import from api.core.exceptions; this module proxies to errors.py
and defines legacy class names expected by tests.
"""

from .errors import (
    PoolDRVError,
    ValidationError,
    NotFoundError,
    GraphAPIError,
)


class GraphAPIException(GraphAPIError):
    pass


class NotificationError(PoolDRVError):
    pass


class PolicyViolationError(ValidationError):
    pass


class PartialFailureError(PoolDRVError):
    pass


class ResourceNotFoundError(NotFoundError):
    pass


__all__ = [
    "PoolDRVError",
    "ValidationError",
    "NotFoundError",
    "GraphAPIError",
    "GraphAPIException",
    "NotificationError",
    "PolicyViolationError",
    "PartialFailureError",
    "ResourceNotFoundError",
]


