from datetime import UTC, datetime

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """All models inherit from this."""


def utcnow() -> datetime:
    return datetime.now(UTC)
