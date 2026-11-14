from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.roles import DEFAULT_ROLE, Permission, Role, role_has_permission
from app.db.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.note import Note


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))

    # Stored as string not an enum
    role: Mapped[Role] = mapped_column(
        Enum(Role, native_enum=False, length=20, values_callable=lambda r: [x.value for x in r]),
        default=DEFAULT_ROLE,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    notes: Mapped[list["Note"]] = relationship(back_populates="owner", cascade="all, delete-orphan")

    def has_permission(self, permission: Permission) -> bool:
        return role_has_permission(self.role, permission)
