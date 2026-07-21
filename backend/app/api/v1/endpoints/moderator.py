import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.services.ai_provider import AIProviderError, get_ai_config
from app.services.mitre_service import MitreDataUnavailable, mitre_catalog
from app.services.moderator_service import ModeratorError, analyze_incident

router = APIRouter()


class ModeratorRequest(BaseModel):
    links: list[HttpUrl] = Field(default_factory=list, max_length=4)
    mitre_ids: list[str] = Field(default_factory=list, max_length=20)
    focus: str = Field(default="", max_length=1000)


class AttackFlowStep(BaseModel):
    order: int
    phase: str
    action: str
    mitre_id: str | None = None
    evidence: str


class SimulationEvent(BaseModel):
    source: str
    event_type: str
    description: str
    mitre_id: str | None = None
    malicious_count: int = 0
    normal_count: int = 0


class SimulationPlan(BaseModel):
    assets: list[str] = Field(default_factory=list)
    events: list[SimulationEvent] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    alerts: list[str] = Field(default_factory=list)
    investigation_questions: list[str] = Field(default_factory=list)
    containment_actions: list[str] = Field(default_factory=list)


class SourceSummary(BaseModel):
    url: str
    title: str
    character_count: int


class SourceError(BaseModel):
    url: str
    error: str


class ModeratorResponse(BaseModel):
    title: str
    executive_summary: str
    attack_description: str
    attack_flow: list[AttackFlowStep]
    simulation_plan: SimulationPlan
    recommended_mitre_ids: list[str]
    assumptions: list[str]
    safety_notes: list[str]
    sources: list[SourceSummary]
    source_errors: list[SourceError]
    analysis_mode: str


@router.post("/analyze", response_model=ModeratorResponse)
async def analyze(
    request: ModeratorRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if len(request.links) > settings.MODERATOR_MAX_LINKS:
        raise HTTPException(status_code=422, detail="Too many source links")
    normalized_ids = sorted({value.strip().upper() for value in request.mitre_ids if value.strip()})
    if not request.links and not normalized_ids:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one public incident link or one MITRE ATT&CK technique",
        )
    try:
        invalid_ids = mitre_catalog.invalid_ids(normalized_ids)
    except MitreDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if invalid_ids:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid MITRE ATT&CK technique IDs: {', '.join(invalid_ids)}",
        )
    try:
        return await analyze_incident(
            [str(link) for link in request.links],
            normalized_ids,
            request.focus.strip(),
            get_ai_config(db),
        )
    except (ModeratorError, AIProviderError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="AI provider request failed") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider is unreachable") from exc
