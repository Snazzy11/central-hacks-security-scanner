from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base

# SQLite refuses to share a connection across threads, and FastAPI runs sync
# endpoints in a threadpool, so turn that check off for SQLite only.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


# Add `db: DbSession` to an endpoint to get a session.
DbSession = Annotated[Session, Depends(get_db)]


def init_db() -> None:
    """Create any missing tables. There are no migrations: if you change an existing
    model, delete app.db (or add Alembic)."""
    import app.models  # noqa: F401  (importing registers the models on Base.metadata)

    Base.metadata.create_all(bind=engine)
