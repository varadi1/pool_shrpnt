"""Authentication services module."""

from .graph_auth import GraphAuthService, get_graph_auth_service


# For backward compatibility
def _get_graph_auth_service_compat():
    return get_graph_auth_service()


graph_auth_service = None  # Will be initialized lazily when needed

__all__ = ["GraphAuthService", "get_graph_auth_service", "graph_auth_service"]
