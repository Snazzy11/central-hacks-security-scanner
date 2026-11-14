"""Import every model here so Base.metadata knows about it before create_all()."""

from app.models.uploaded_file import DetectionMode, OutputMode, UploadedFile
from app.models.user import User

__all__ = ["DetectionMode", "OutputMode", "UploadedFile", "User"]
