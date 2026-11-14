import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.roles import Role
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User

log = logging.getLogger(__name__)


def seed_admin() -> None:
    """Create the built-in it_admin account from ADMIN_* settings if it's missing.
    Never overwrites an existing account, so changing the password in .env later
    won't change it (change it in the app instead)."""
    if not settings.admin_password:
        log.warning("ADMIN_PASSWORD is not set; skipping admin account creation")
        return
    email = settings.admin_email.lower()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)):
            return
        db.add(
            User(
                first_name=settings.admin_first_name,
                last_name=settings.admin_last_name,
                email=email,
                hashed_password=hash_password(settings.admin_password),
                role=Role.IT_ADMIN,
            )
        )
        db.commit()
        log.info("Created admin account %s", email)
