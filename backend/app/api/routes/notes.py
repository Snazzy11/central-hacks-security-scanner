"""Example feature showing a public endpoint next to protected ones.
Copy this file when you add a new resource."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser
from app.db.session import DbSession
from app.models import Note
from app.schemas.note import NoteCreate, NoteRead

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/public", response_model=list[NoteRead])
def list_public_notes(db: DbSession) -> list[Note]:
    """No auth: anyone can read notes that their owners marked public."""
    query = select(Note).where(Note.is_public).order_by(Note.created_at.desc())
    return list(db.scalars(query))


@router.get("", response_model=list[NoteRead])
def list_my_notes(user: CurrentUser, db: DbSession) -> list[Note]:
    """Auth required: `user: CurrentUser` is all it takes."""
    query = select(Note).where(Note.owner_id == user.id).order_by(Note.created_at.desc())
    return list(db.scalars(query))


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(body: NoteCreate, user: CurrentUser, db: DbSession) -> Note:
    note = Note(**body.model_dump(), owner_id=user.id)
    db.add(note)
    db.commit()
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, user: CurrentUser, db: DbSession) -> None:
    note = db.get(Note, note_id)
    # 404 (not 403) for other people's notes, so ids don't leak what exists
    if note is None or note.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    db.delete(note)
    db.commit()
