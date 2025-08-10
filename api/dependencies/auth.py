"""Authentication dependencies for FastAPI routes."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Security scheme for Bearer token
# Set auto_error=False so we can return 401 for missing credentials instead of 403
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    """Dependency to get the current authenticated user.

    This is a placeholder implementation. In production, this would:
    - Validate the JWT token
    - Decode user information
    - Check token expiration
    - Return user data from the token

    Args:
        credentials: Bearer token from Authorization header

    Returns:
        User information dict

    Raises:
        HTTPException: If authentication fails
    """
    # TODO: Implement actual JWT validation
    # For now, require presence of a Bearer token and return a mock user for development
    # This is temporary to allow frontend testing

    if credentials is None or not getattr(credentials, "credentials", None):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Mock user - replace with actual JWT decoding
    return {
        "user_id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "user@example.com",
        "roles": ["admin", "user", "PM"],
    }


async def require_admin(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Dependency to require admin role.

    Args:
        current_user: Current authenticated user

    Returns:
        User information if admin

    Raises:
        HTTPException: If user is not admin
    """
    if "admin" not in current_user.get("roles", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def require_permission(permission: str):
    """Factory for permission-based dependencies.

    Args:
        permission: Required permission name

    Returns:
        Dependency function that checks for the permission
    """

    async def check_permission(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
        # TODO: Implement actual permission checking
        # For now, admins have all permissions
        if "admin" in current_user.get("roles", []):
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission '{permission}' required",
        )

    return check_permission


async def require_pm(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Dependency to require PM role.

    Args:
        current_user: Current authenticated user

    Returns:
        User information if PM

    Raises:
        HTTPException: If user is not PM
    """
    if "PM" not in current_user.get("roles", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project Manager access required",
        )
    return current_user


# Type aliases for cleaner annotations
CurrentUser = Annotated[dict, Depends(get_current_user)]
AdminUser = Annotated[dict, Depends(require_admin)]
PMUser = Annotated[dict, Depends(require_pm)]
