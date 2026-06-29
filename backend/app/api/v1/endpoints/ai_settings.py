import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.services.ai_provider import (
    AIProviderError,
    call_ai_async,
    get_ai_config,
    get_public_ai_config,
    save_ai_config,
)

router = APIRouter()


class AISettingsOut(BaseModel):
    endpoint: str
    model: str
    api_key_configured: bool
    source: str


class AISettingsUpdate(BaseModel):
    endpoint: str = Field(min_length=10, max_length=500)
    model: str = Field(min_length=1, max_length=255)
    api_key: str | None = Field(default=None, min_length=10, max_length=1000)


@router.get("/", response_model=AISettingsOut)
def read_ai_settings(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return get_public_ai_config(db)


@router.put("/", response_model=AISettingsOut)
def update_ai_settings(
    request: AISettingsUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        return save_ai_config(
            db, request.endpoint, request.model, request.api_key, current_user.id
        )
    except AIProviderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/test")
async def test_ai_settings(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        config = get_ai_config(db)
        content = await call_ai_async(
            config,
            [{"role": "user", "content": "Reply with exactly: AI connection successful"}],
            max_tokens=32,
        )
        return {"ok": True, "message": content[:200]}
    except AIProviderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        detail = f"AI provider rejected the request (HTTP {exc.response.status_code})"
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider is unreachable") from exc
