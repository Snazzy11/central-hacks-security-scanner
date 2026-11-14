from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.roles import Permission, Role
from app.core.security import decode_access_token
from app.db.session import DbSession
from app.models import User

# tokenUrl is what makes the "Authorize" button in /docs work
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# Add `user: CurrentUser` to an endpoint to require login.
CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: Role):
    """Endpoint dependency: `user: User = Depends(require_role(Role.IT_ADMIN))`.
    Prefer require_permission; use this only when an action is tied to a specific role."""

    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return checker


def require_permission(permission: Permission):
    """Endpoint dependency: `user: User = Depends(require_permission(Permission.MANAGE_USERS))`."""

    def checker(user: CurrentUser) -> User:
        if not user.has_permission(permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker
