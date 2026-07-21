from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.ai_provider import AIProviderError
from app.services.news_service import (
    NewsError,
    NewsKeyMissing,
    fetch_latest_news,
    get_public_news_config,
    save_api_key,
)

router = APIRouter()


class NewsSettingsOut(BaseModel):
    api_key_configured: bool
    source: str


class NewsSettingsUpdate(BaseModel):
    api_key: str = Field(min_length=8, max_length=200)


class NewsArticle(BaseModel):
    id: str
    title: str
    link: str
    description: str
    published_at: str | None = None
    source: str
    image_url: str | None = None
    categories: list[str] = Field(default_factory=list)


class NewsFeed(BaseModel):
    query: str
    articles: list[NewsArticle]
    next_page: str | None = None
    total_results: int
    cached: bool


@router.get("/latest", response_model=NewsFeed)
async def latest_news(
    q: str | None = Query(default=None, max_length=100),
    page: str | None = Query(default=None, max_length=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Latest cybersecurity headlines. Available to admins and players alike."""
    try:
        return await fetch_latest_news(db, q, page)
    except NewsKeyMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (NewsError, AIProviderError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/settings", response_model=NewsSettingsOut)
def read_news_settings(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return get_public_news_config(db)


@router.put("/settings", response_model=NewsSettingsOut)
def update_news_settings(
    request: NewsSettingsUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        return save_api_key(db, request.api_key, current_user.id)
    except NewsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/settings/test")
async def test_news_settings(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        feed = await fetch_latest_news(db)
    except NewsKeyMissing as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (NewsError, AIProviderError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "message": f"newsdata.io returned {len(feed['articles'])} article(s).",
    }
