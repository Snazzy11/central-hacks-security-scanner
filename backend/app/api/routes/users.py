"""Admin-only user management. Example of guarding a whole router with a permission."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, require_permission
from app.core.roles import Permission
from app.db.session import DbSession
from app.models import User
from app.schemas.user import UserRead, UserRoleUpdate

# `dependencies=[...]` applies the check to every endpoint in this router.
router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_permission(Permission.MANAGE_USERS))],
)


@router.get("", response_model=list[UserRead])
def list_users(db: DbSession) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)))


@router.patch("/{user_id}/role", response_model=UserRead)
def set_user_role(user_id: int, body: UserRoleUpdate, me: CurrentUser, db: DbSession) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't change your own role")
    user.role = body.role
    db.commit()
    return user
