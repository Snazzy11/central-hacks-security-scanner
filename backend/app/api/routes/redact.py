import asyncio
import base64
import hashlib
import logging
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUser
from app.db.session import DbSession, SessionLocal
from app.models import DetectionMode, OutputMode, UploadedFile
from app.orchestrator import Finding, clean_file, clean_text, process_file
from app.orchestrator.documents import SUPPORTED_EXTENSIONS
from app.redact import DISPLAY_NAMES, entity_label
from app.schemas.redaction import (
    Capabilities,
    EntityType,
    FileCleanResult,
    TextCleanRequest,
    TextCleanResult,
)
from app.schemas.redaction import Finding as FindingOut
from app.schemas.uploaded_file import UploadedFileList, UploadedFileRead

router = APIRouter(prefix="/redact", tags=["redact"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_TOTAL_SIZE = 50 * 1024 * 1024  # 50 MiB, combined across all files in one request
MAX_FILES = 20


# Form fields shared by the upload endpoints (the files themselves are multipart too).
DetectionModeForm = Annotated[DetectionMode, Form()]
OutputModeForm = Annotated[OutputMode, Form()]
EntitiesForm = Annotated[list[str] | None, Form()]  # which types to look for; leave out for all


async def save_upload(
    file: UploadFile,
    owner_id: int,
    batch_id: str,
    detection_mode: DetectionMode,
    output_mode: OutputMode,
    max_size: int = MAX_TOTAL_SIZE,
) -> UploadedFile:
    """Validate and store one upload on disk. Returns an UploadedFile row that the caller
    must add to the session. `max_size` is how many bytes this file may use."""
    extension = _checked_extension(file.filename)
    filename = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / filename
    size, sha256 = await _write_upload(file, file_path, max_size)

    return UploadedFile(
        original_filename=Path(file.filename or "").name[:255],
        stored_filename=filename,
        file_path=str(file_path),
        mime_type=file.content_type,
        size=size,
        sha256=sha256,
        detection_mode=detection_mode,
        output_mode=output_mode,
        batch_id=batch_id,
        owner_id=owner_id,
    )


def _checked_extension(filename: str | None) -> str:
    """The file's extension, if it's a type the pipeline can handle."""
    if not filename:
        raise HTTPException(status_code=400, detail="No file selected")
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename}")
    return extension


async def _write_upload(file: UploadFile, destination: Path, max_size: int) -> tuple[int, str]:
    """Stream the upload to `destination` and return its size and sha256.
    Removes the partial file if anything fails."""
    size = 0
    digest = hashlib.sha256()
    try:
        with destination.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(status_code=413, detail="Upload exceeds the 50 MB total size limit")
                digest.update(chunk)
                await asyncio.to_thread(buffer.write, chunk)
    except Exception:
        await asyncio.to_thread(destination.unlink, missing_ok=True)
        raise
    finally:
        await file.close()
    return size, digest.hexdigest()


def _checked_entities(entities: list[str] | None) -> list[str] | None:
    unknown = set(entities or ()) - DISPLAY_NAMES.keys()
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown entity types: {', '.join(sorted(unknown))}")
    return entities


async def _discard(rows: list[UploadedFile]) -> None:
    for row in rows:
        await asyncio.to_thread(Path(row.file_path).unlink, missing_ok=True)


def process_uploads(file_ids: list[int]) -> None:
    """Background task: run the redaction pipeline on each file, one commit per file so
    clients polling the batch see progress. Always deletes the original upload."""
    with SessionLocal() as db:
        for row in db.scalars(select(UploadedFile).where(UploadedFile.id.in_(file_ids))):
            try:
                result = process_file(row)
                row.output_path = str(result.output_path)
                row.summary = result.summary
                row.status = "completed"
            except Exception:
                logger.exception("Redaction failed for file %s", row.id)
                row.status = "failed"
            finally:
                Path(row.file_path).unlink(missing_ok=True) # This doesnt seem to be actually deleting the files
            db.commit()


@router.post("/single", response_model=UploadedFileRead, status_code=status.HTTP_202_ACCEPTED)
async def upload_single_file(
    user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    detection_mode: DetectionModeForm = DetectionMode.SCRIPT,
    output_mode: OutputModeForm = OutputMode.REDACT,
) -> UploadedFile:
    row = await save_upload(file, user.id, str(uuid.uuid4()), detection_mode, output_mode)
    try:
        db.add(row)
        db.commit()
    except Exception:
        await _discard([row])
        raise
    background_tasks.add_task(process_uploads, [row.id])
    return row


@router.post("/multiple", response_model=UploadedFileList, status_code=status.HTTP_202_ACCEPTED)
async def upload_multiple_files(
    user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    detection_mode: DetectionModeForm = DetectionMode.SCRIPT,
    output_mode: OutputModeForm = OutputMode.REDACT,
) -> UploadedFileList:
    if not files:
        raise HTTPException(status_code=400, detail="No files selected")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files (max {MAX_FILES})")

    batch_id = str(uuid.uuid4())
    saved: list[UploadedFile] = []
    try:
        for file in files:
            used = sum(row.size for row in saved)
            saved.append(await save_upload(
                    file, user.id, batch_id, detection_mode, output_mode, MAX_TOTAL_SIZE - used
                ))
        db.add_all(saved)
        db.commit()
    except Exception:
        # All-or-nothing: don't leave earlier files of a failed batch on disk or in the DB.
        db.rollback()
        await _discard(saved)
        raise

    background_tasks.add_task(process_uploads, [row.id for row in saved])
    return UploadedFileList(
        batch_id=batch_id, count=len(saved), files=[UploadedFileRead.model_validate(r) for r in saved]
    )


# ---- Instant endpoints --------------------------------------------------------
# For the browser extension. A website is waiting for the file while these run, so they answer
# straight away instead of returning 202 and making the client poll. Nothing is saved: files
# caught on other websites don't belong in the user's history, and nothing stays on disk.


@router.get("/capabilities", response_model=Capabilities)
def get_capabilities() -> Capabilities:
    """What the instant endpoints accept, so clients don't keep their own copy of these lists."""
    return Capabilities(
        entities=[EntityType(id=entity, label=entity_label(entity)) for entity in DISPLAY_NAMES],
        file_types=sorted(SUPPORTED_EXTENSIONS),
        max_file_size=MAX_TOTAL_SIZE,
    )


@router.post("/instant", response_model=FileCleanResult)
async def clean_file_now(
    file: UploadFile = File(...),
    detection_mode: DetectionModeForm = DetectionMode.SCRIPT,
    output_mode: OutputModeForm = OutputMode.REDACT,
    entities: EntitiesForm = None,
) -> FileCleanResult:
    """Clean one file and send it back in the response."""
    extension = _checked_extension(file.filename)
    entities = _checked_entities(entities)

    with TemporaryDirectory() as folder:
        source = Path(folder) / f"original{extension}"
        await _write_upload(file, source, MAX_TOTAL_SIZE)
        try:
            result = await asyncio.to_thread(
                clean_file, source, Path(folder) / f"cleaned{extension}", detection_mode, output_mode, entities
            )
        except Exception:
            logger.exception("Instant redaction failed for %s", file.filename)
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This file could not be checked") from None
        cleaned = base64.b64encode(result.output_path.read_bytes()).decode() if result.findings else None

    return FileCleanResult(
        filename=file.filename or "",
        findings=_findings_out(result.findings),
        summary=result.summary,
        file_base64=cleaned,
    )


@router.post("/text", response_model=TextCleanResult)
def clean_text_now(request: TextCleanRequest) -> TextCleanResult:
    """Clean a piece of text, e.g. something about to be pasted into a website."""
    try:
        result = clean_text(
            request.text, request.detection_mode, request.output_mode, _checked_entities(request.entities)
        )
    except RuntimeError:
        logger.exception("Instant redaction failed for pasted text")
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This text could not be checked") from None
    return TextCleanResult(text=result.text, findings=_findings_out(result.findings), summary=result.summary)


def _findings_out(findings: list[Finding]) -> list[FindingOut]:
    return [FindingOut(type=f.entity_type, value=f.value, replacement=f.replacement) for f in findings]


# ---- Reading back stored uploads ------------------------------------------------


@router.get("", response_model=list[UploadedFileRead])
def list_my_files(user: CurrentUser, db: DbSession) -> list[UploadedFile]:
    query = (
        select(UploadedFile)
        .where(UploadedFile.owner_id == user.id)
        .order_by(UploadedFile.created_at.desc())
    )
    return list(db.scalars(query))


@router.get("/batches/{batch_id}", response_model=UploadedFileList)
def get_my_batch(batch_id: str, user: CurrentUser, db: DbSession) -> UploadedFileList:
    """All files uploaded together in one request, e.g. for a client polling a batch."""
    query = (
        select(UploadedFile)
        .where(UploadedFile.batch_id == batch_id, UploadedFile.owner_id == user.id)
        .order_by(UploadedFile.id)
    )
    rows = list(db.scalars(query))
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found")
    return UploadedFileList(batch_id=batch_id, count=len(rows), files=[UploadedFileRead.model_validate(r) for r in rows])


def _get_owned(file_id: int, user: CurrentUser, db: DbSession) -> UploadedFile:
    row = db.get(UploadedFile, file_id)
    # 404 (not 403) for other people's files, so ids don't leak what exists
    if row is None or row.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return row


@router.get("/{file_id}", response_model=UploadedFileRead)
def get_my_file(file_id: int, user: CurrentUser, db: DbSession) -> UploadedFile:
    return _get_owned(file_id, user, db)


@router.get("/{file_id}/download")
def download_my_file(file_id: int, user: CurrentUser, db: DbSession) -> FileResponse:
    row = _get_owned(file_id, user, db)
    if row.status != "completed" or row.output_path is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"File is not ready (status: {row.status})")
    suffix = Path(row.output_path).suffix  # the redacted copy keeps the original file type
    return FileResponse(row.output_path, filename=f"{Path(row.original_filename).stem}.redacted{suffix}")
