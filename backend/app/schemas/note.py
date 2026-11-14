from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UTCDatetime


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = ""
    is_public: bool = False


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    is_public: bool
    created_at: UTCDatetime
