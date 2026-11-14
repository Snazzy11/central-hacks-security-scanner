"""Roles and permissions. This is the one file to edit when you add a role.

- Role: what a user *is* (stored on User.role).
- Permission: what an action *needs* (checked by endpoints).
- ROLE_PERMISSIONS: which roles grant which permissions.

To add a role:       add it to Role and give it a row in ROLE_PERMISSIONS.
To add a permission: add it to Permission, list it under the roles that get it,
                     then guard an endpoint with `require_permission(Permission.X)`.
"""

from enum import StrEnum


class Role(StrEnum):
    UNTRUSTED_EMPLOYEE = "untrusted_employee"  # new accounts start here (least privilege)
    EMPLOYEE = "employee"
    MANAGER = "manager"
    IT = "it"
    IT_ADMIN = "it_admin"  # highest role


class Permission(StrEnum):
    MANAGE_USERS = "manage_users"
    READ_ALL_NOTES = "read_all_notes"


# Roles are not a strict ladder (manager and it are different branches), so each role
# lists its permissions explicitly instead of "higher role inherits lower role".
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.UNTRUSTED_EMPLOYEE: frozenset(),
    Role.EMPLOYEE: frozenset(),
    Role.MANAGER: frozenset(),
    Role.IT: frozenset({Permission.READ_ALL_NOTES}),
    Role.IT_ADMIN: frozenset(Permission),  # every permission, including future ones
}

DEFAULT_ROLE = Role.UNTRUSTED_EMPLOYEE


def role_has_permission(role: Role, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, frozenset())
