import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_admin, get_current_player
from app.db.session import get_db
from app.models.lab import PlayerLab
from app.models.user import User
from app.services.ai_provider import AIProviderError, get_ai_config
from app.services.assistant_service import (
    AssistantError,
    admin_chat,
    build_admin_scenario_context,
    build_player_context,
    collect_protected_values,
    fetch_reference_sources,
    gather_web_context,
    normalize_history,
    player_chat,
    redact_protected_values,
    search_scenarios,
)
from app.services.search_service import SearchError

router = APIRouter()

TIME_FILTERS = {"d", "w", "m", "y"}


class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=4000)


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    date: str | None = None


class PlayerChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    lab_id: int | None = None
    web_search: bool = False


class PlayerChatResponse(BaseModel):
    reply: str
    guarded: bool
    lab_id: int | None = None
    scenario_title: str | None = None
    search_results: list[SearchResult] = Field(default_factory=list)
    search_error: str | None = None


class AdminChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    scenario_id: int | None = None
    links: list[HttpUrl] = Field(default_factory=list, max_length=4)
    web_search: bool = False
    news_mode: bool = False
    timelimit: str | None = Field(default=None, max_length=1)


class SourceSummary(BaseModel):
    url: str
    title: str


class SourceError(BaseModel):
    url: str
    error: str


class AdminChatResponse(BaseModel):
    reply: str
    sources: list[SourceSummary]
    source_errors: list[SourceError]
    scenario_title: str | None = None
    search_results: list[SearchResult] = Field(default_factory=list)
    search_error: str | None = None


class ScenarioHit(BaseModel):
    id: int
    title: str
    difficulty: str
    status: str
    mitre_techniques: list[str]


def _ai_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, httpx.HTTPStatusError):
        return HTTPException(status_code=502, detail="AI provider request failed")
    return HTTPException(status_code=502, detail="AI provider is unreachable")


@router.post("/player/chat", response_model=PlayerChatResponse)
async def player_assistant(
    request: PlayerChatRequest,
    current_user: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Socratic mentor for players. The lab answer key is never sent to the model."""
    lab = None
    if request.lab_id is not None:
        lab = db.query(PlayerLab).filter(PlayerLab.id == request.lab_id).first()
        if not lab:
            raise HTTPException(status_code=404, detail="Lab not found")
        if current_user.role != "admin" and lab.player_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    search_results: list[dict] = []
    search_context: str | None = None
    search_error: str | None = None

    try:
        history = normalize_history([message.model_dump() for message in request.messages])
        context = build_player_context(db, lab) if lab else None

        if request.web_search:
            # A failed search degrades to a normal answer rather than breaking the chat.
            try:
                search_results, _, search_context = await gather_web_context(history[-1]["content"])
            except SearchError as exc:
                search_error = str(exc)

        reply = await player_chat(history, context, search_context, get_ai_config(db))
    except (AssistantError, AIProviderError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _ai_http_error(exc) from exc

    guarded = False
    if lab:
        reply, guarded = redact_protected_values(reply, collect_protected_values(db, lab.scenario_id))

    return PlayerChatResponse(
        reply=reply,
        guarded=guarded,
        lab_id=lab.id if lab else None,
        scenario_title=context["scenario_title"] if context else None,
        search_results=[SearchResult(**result) for result in search_results],
        search_error=search_error,
    )


@router.get("/admin/scenarios", response_model=list[ScenarioHit])
def admin_scenario_search(
    q: str = Query(default="", max_length=200),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Look up a platform incident to ground the assistant on."""
    return search_scenarios(db, q)


@router.post("/admin/chat", response_model=AdminChatResponse)
async def admin_assistant(
    request: AdminChatRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Threat-intel research assistant with optional platform-incident and web-source grounding."""
    if len(request.links) > settings.MODERATOR_MAX_LINKS:
        raise HTTPException(status_code=422, detail="Too many reference links")
    if request.timelimit and request.timelimit not in TIME_FILTERS:
        raise HTTPException(status_code=422, detail="Time filter must be one of d, w, m, y")

    search_results: list[dict] = []
    search_context: str | None = None
    search_error: str | None = None

    try:
        history = normalize_history([message.model_dump() for message in request.messages])
        scenario_context = (
            build_admin_scenario_context(db, request.scenario_id)
            if request.scenario_id is not None
            else None
        )
        sources, source_errors = await fetch_reference_sources([str(link) for link in request.links])

        if request.web_search:
            # A failed search degrades to a normal answer rather than breaking the chat.
            try:
                search_results, read_sources, search_context = await gather_web_context(
                    history[-1]["content"],
                    news=request.news_mode,
                    timelimit=request.timelimit,
                    read_top_results=settings.WEB_SEARCH_FETCH_TOP,
                )
                sources.extend(read_sources)
            except SearchError as exc:
                search_error = str(exc)

        reply = await admin_chat(history, scenario_context, sources, search_context, get_ai_config(db))
    except (AssistantError, AIProviderError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _ai_http_error(exc) from exc

    return AdminChatResponse(
        reply=reply,
        sources=[SourceSummary(url=source["url"], title=source["title"]) for source in sources],
        source_errors=[SourceError(**error) for error in source_errors],
        scenario_title=scenario_context["title"] if scenario_context else None,
        search_results=[SearchResult(**result) for result in search_results],
        search_error=search_error,
    )
