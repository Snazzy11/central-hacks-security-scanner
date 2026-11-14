"""Import every model here so Base.metadata knows about it before create_all()."""

from app.models.note import Note
from app.models.user import User

__all__ = ["Note", "User"]
