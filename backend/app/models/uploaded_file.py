from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.user import User


class DetectionMode(StrEnum):
    """script: rule-based PII detection. ai: script mode plus an AI check layer on top."""

    SCRIPT = "script"
    AI = "ai"


class OutputMode(StrEnum):
    """redact: blank out all PII. replace: swap PII for consistent fake data."""

    REDACT = "redact"
    REPLACE = "replace"


class UploadedFile(Base):
    """
    A file a user uploaded for redaction.
    The actual file is stored as a file, this just tracks it
    """

    __tablename__ = "uploaded_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255), unique=True)
    file_path: Mapped[str] = mapped_column(String(1024))
    mime_type: Mapped[str | None] = mapped_column(String(255))
    size: Mapped[int]  # bytes
    # Files uploaded in the same request share a batch id, so a client can track them together.
    batch_id: Mapped[str] = mapped_column(String(36), index=True, server_default="")
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    detection_mode: Mapped[str] = mapped_column(
        String(16), default=DetectionMode.SCRIPT, server_default=DetectionMode.SCRIPT
    )
    output_mode: Mapped[str] = mapped_column(
        String(16), default=OutputMode.REDACT, server_default=OutputMode.REDACT
    )
    status: Mapped[str] = mapped_column(String(32), default="uploaded")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    owner: Mapped["User"] = relationship(back_populates="files")
