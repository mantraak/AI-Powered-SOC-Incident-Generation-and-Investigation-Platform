from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin, get_current_player
from app.db.session import get_db
from app.models.user import User
from app.services.terminal_service import (
    TerminalError,
    exec_command,
    expire_if_needed,
    extend_session,
    get_active_session,
    get_terminal_settings,
    session_payload,
    spawn_session,
    stop_session,
    terminal_setting_payload,
)

router = APIRouter()


class TerminalSettingsUpdate(BaseModel):
    enabled: bool = True
    image: str = Field(default="ubuntu:22.04", min_length=3, max_length=180)
    default_minutes: int = Field(default=45, ge=1, le=480)
    extension_minutes: int = Field(default=15, ge=1, le=240)
    max_extensions: int = Field(default=2, ge=0, le=20)
    command_timeout_seconds: int = Field(default=20, ge=1, le=120)
    network_enabled: bool = False
    memory_limit: str = Field(default="256m", min_length=2, max_length=30)
    cpu_quota: int = Field(default=50000, ge=10000, le=400000)


class TerminalCommand(BaseModel):
    command: str = Field(min_length=1, max_length=2000)
    lab_id: int | None = None


def _fail(exc: TerminalError):
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/settings")
def read_terminal_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    return terminal_setting_payload(get_terminal_settings(db))


@router.put("/settings")
def update_terminal_settings(
    payload: TerminalSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    settings = get_terminal_settings(db)
    for key, value in payload.model_dump().items():
        setattr(settings, key, value)
    settings.updated_by = current_user.id
    db.commit()
    db.refresh(settings)
    return terminal_setting_payload(settings)


@router.get("/session")
def read_terminal_session(
    lab_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    settings = get_terminal_settings(db)
    session = expire_if_needed(db, get_active_session(db, current_user, lab_id))
    return session_payload(session, settings)


@router.post("/session")
def start_terminal_session(
    lab_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    try:
        session = spawn_session(db, current_user, lab_id=lab_id, respawn=False)
        return session_payload(session, get_terminal_settings(db))
    except TerminalError as exc:
        _fail(exc)


@router.post("/session/extend")
def extend_terminal_session(
    lab_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    try:
        session = extend_session(db, current_user, lab_id=lab_id)
        return session_payload(session, get_terminal_settings(db))
    except TerminalError as exc:
        _fail(exc)


@router.post("/session/respawn")
def respawn_terminal_session(
    lab_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    try:
        session = spawn_session(db, current_user, lab_id=lab_id, respawn=True)
        return session_payload(session, get_terminal_settings(db))
    except TerminalError as exc:
        _fail(exc)


@router.delete("/session")
def terminate_terminal_session(
    lab_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    try:
        session = stop_session(db, current_user, lab_id=lab_id)
        return session_payload(session, get_terminal_settings(db))
    except TerminalError as exc:
        _fail(exc)


@router.post("/exec")
def execute_terminal_command(
    payload: TerminalCommand,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    try:
        return exec_command(db, current_user, payload.command, lab_id=payload.lab_id)
    except TerminalError as exc:
        _fail(exc)
