import re

from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _normalize_email(v: str) -> str:
    if not isinstance(v, str) or not _EMAIL_RE.match(v):
        raise ValueError("Invalid email address")
    return v.strip().lower()


class UserBase(BaseModel):
    email: str
    full_name: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v):
        return _normalize_email(v)


class UserCreate(UserBase):
    password: str
    role: Optional[str] = "player"


class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v):
        return _normalize_email(v)


class UserOut(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None
