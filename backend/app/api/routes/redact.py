import asyncio
import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUser
from app.db.session import DbSession
from app.models import UploadedFile
from app.schemas.uploaded_file import UploadedFileList, UploadedFileRead

router = APIRouter(prefix="/redact", tags=["redact"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MiB
MAX_FILES = 20
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


async def save_upload(file: UploadFile, owner_id: int) -> UploadedFile:
    """Validate and store one upload on disk. Returns an UploadedFile row that the caller
    must add to the session. Removes the partial file if anything fails."""
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
    digest = hashlib.sha256()

    try:
        with file_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)

                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"{file.filename} exceeds 50 MB limit"
                    )

                digest.update(chunk)
                await asyncio.to_thread(buffer.write, chunk)

    except Exception:
        await asyncio.to_thread(file_path.unlink, missing_ok=True)
        raise

    finally:
        await file.close()

    return UploadedFile(
        original_filename=Path(file.filename).name[:255],
        stored_filename=filename,
        file_path=str(file_path),
        mime_type=file.content_type,
        size=size,
        sha256=digest.hexdigest(),
        owner_id=owner_id,
    )


async def _discard(rows: list[UploadedFile]) -> None:
    for row in rows:
        await asyncio.to_thread(Path(row.file_path).unlink, missing_ok=True)


@router.post("/single", response_model=UploadedFileRead, status_code=status.HTTP_201_CREATED)
async def upload_single_file(
    user: CurrentUser, db: DbSession, file: UploadFile = File(...)
) -> UploadedFile:
    row = await save_upload(file, user.id)
    try:
        db.add(row)
        db.commit()
    except Exception:
        await _discard([row])
        raise
    return row


@router.post("/multiple", response_model=UploadedFileList, status_code=status.HTTP_201_CREATED)
async def upload_multiple_files(
    user: CurrentUser, db: DbSession, files: list[UploadFile] = File(...)
) -> UploadedFileList:
    if not files:
        raise HTTPException(status_code=400, detail="No files selected")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files (max {MAX_FILES})")

    saved: list[UploadedFile] = []
    try:
        for file in files:
            saved.append(await save_upload(file, user.id))
        db.add_all(saved)
        db.commit()
    except Exception:
        # All-or-nothing: don't leave earlier files of a failed batch on disk or in the DB.
        db.rollback()
        await _discard(saved)
        raise

    return UploadedFileList(
        count=len(saved), files=[UploadedFileRead.model_validate(r) for r in saved]
    )


@router.get("", response_model=list[UploadedFileRead])
def list_my_files(user: CurrentUser, db: DbSession) -> list[UploadedFile]:
    query = (
        select(UploadedFile)
        .where(UploadedFile.owner_id == user.id)
        .order_by(UploadedFile.created_at.desc())
    )
    return list(db.scalars(query))


@router.get("/{file_id}", response_model=UploadedFileRead)
def get_my_file(file_id: int, user: CurrentUser, db: DbSession) -> UploadedFile:
    row = db.get(UploadedFile, file_id)
    # 404 (not 403) for other people's files, so ids don't leak what exists
    if row is None or row.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return row
