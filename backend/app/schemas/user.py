from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.roles import Role
from app.schemas.common import UTCDatetime


class UserCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    # from_attributes lets us return a SQLAlchemy object directly
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    email: EmailStr
    role: Role
    created_at: UTCDatetime


class UserRoleUpdate(BaseModel):
    role: Role
