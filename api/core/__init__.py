from .errors import (
    PoolDRVError,
    BadRequestError,
    ValidationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    GraphAPIError,
    PermissionApplicationError,
    LockError,
    PermissionError,
    ForbiddenError,
    BatchProcessingError,
    map_graph_error_to_user_message,
    handle_pool_drv_error,
    create_error_response,
    log_exception_with_context,
)

# Backward-compatible exception names expected by tests
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


