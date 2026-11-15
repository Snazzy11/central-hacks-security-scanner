"""Schemas for the 'instant' endpoints
These are mainly used just by the browser extension"""

from typing import Any

from pydantic import BaseModel, Field

from app.models import DetectionMode, OutputMode

MAX_TEXT_LENGTH = 200_000  # characters; far more than anyone pastes


class Finding(BaseModel):
    type: str  # entity type, e.g. "EMAIL_ADDRESS"
    value: str  # the PII as it appeared
    replacement: str  # what took its place


class TextCleanRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT_LENGTH)
    detection_mode: DetectionMode = DetectionMode.SCRIPT
    output_mode: OutputMode = OutputMode.REDACT
    entities: list[str] | None = None  # which types to look for; None means all


class TextCleanResult(BaseModel):
    text: str
    findings: list[Finding]
    summary: dict[str, Any]


class FileCleanResult(BaseModel):
    filename: str
    findings: list[Finding]
    summary: dict[str, Any]
    file_base64: str | None  # the cleaned file; None when nothing was found


class EntityType(BaseModel):
    id: str
    label: str


class Capabilities(BaseModel):
    """What can be asked of the instant endpoints."""

    entities: list[EntityType]
    file_types: list[str]  # extensions, e.g. ".pdf"
    max_file_size: int  # bytes
