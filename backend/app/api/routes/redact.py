import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/redact", tags=["redact"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MiB
MAX_FILES = 20
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


async def save_upload(file: UploadFile) -> dict:
    """Validate and store one upload. Removes the partial file if anything fails."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    # get file extension and check it is allowed
    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.filename}"
        )

    # Generate a uuid
    filename = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / filename

    size = 0

    try:
        with file_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)

                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"{file.filename} exceeds 50 MB limit"
                    )

                await asyncio.to_thread(buffer.write, chunk)

    except Exception:
        await asyncio.to_thread(file_path.unlink, missing_ok=True)
        raise

    finally:
        await file.close()

    return {
        "filename": filename,
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": size,
        "location": str(file_path)
    }


@router.post("/single")
async def upload_single_file(file: UploadFile = File(...)):
    return await save_upload(file)


@router.post("/multiple")
async def upload_multiple_files(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files selected")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files (max {MAX_FILES})")

    saved: list[dict] = []
    try:
        for file in files:
            saved.append(await save_upload(file))
    except Exception:
        # don't leave earlier files of a failed batch on disk
        for item in saved:
            await asyncio.to_thread(Path(item["location"]).unlink, missing_ok=True)
        raise

    return {"count": len(saved), "files": saved}
