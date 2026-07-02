import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.core.security import get_current_admin
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate, _normalize_email
from app.core.security import get_password_hash

router = APIRouter()


class AdminUserCreate(BaseModel):
    email: str
    full_name: str
    role: str = "player"

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v):
        return _normalize_email(v)


def _temporary_password() -> str:
    return f"{secrets.token_urlsafe(12)}A1!"


@router.post("/", status_code=201)
def create_user(
    user_in: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if user_in.role not in {"player", "admin"}:
        raise HTTPException(status_code=422, detail="Invalid user role")
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    password = _temporary_password()
    user = User(
        email=user_in.email,
        full_name=user_in.full_name.strip(),
        hashed_password=get_password_hash(password),
        role=user_in.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "user": UserOut.model_validate(user).model_dump(),
        "temporary_password": password,
    }


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    password = _temporary_password()
    user.hashed_password = get_password_hash(password)
    db.commit()
    return {"user_id": user.id, "temporary_password": password}


@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
