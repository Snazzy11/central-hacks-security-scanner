from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.common import UTCDatetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    # from_attributes lets us return a SQLAlchemy object directly
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: UTCDatetime
