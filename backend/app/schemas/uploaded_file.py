from pydantic import BaseModel, ConfigDict

from app.models import DetectionMode, OutputMode
from app.schemas.common import UTCDatetime


class UploadedFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    original_filename: str
    stored_filename: str
    file_path: str
    mime_type: str | None
    size: int
    sha256: str
    detection_mode: DetectionMode
    output_mode: OutputMode
    status: str
    created_at: UTCDatetime


class UploadedFileList(BaseModel):
    count: int
    files: list[UploadedFileRead]
