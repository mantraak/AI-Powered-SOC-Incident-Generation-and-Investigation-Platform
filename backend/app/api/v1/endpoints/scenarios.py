from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.core.security import get_current_admin, get_current_user
from app.models.scenario import Scenario
from app.models.user import User
from app.schemas.scenario import (
    ScenarioCreate,
    ScenarioUpdate,
    ScenarioOut,
    ScenarioFromSource,
    DraftConflict,
)
from app.services.generator_service import run_ai_generation
from app.services.mitre_service import MitreDataUnavailable, mitre_catalog
from app.models.lab import PlayerLab

router = APIRouter()

# Statuses that still represent a "live" draft for duplicate-detection purposes.
# A previously-rejected (validation_failed) or already-published scenario should
# not block a fresh attempt at drafting the same source article.
_OPEN_DRAFT_STATUSES = ("draft", "generating", "generated", "ready")


def validate_mitre_ids(technique_ids: List[str]):
    try:
        invalid = mitre_catalog.invalid_ids(technique_ids)
    except MitreDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid MITRE ATT&CK technique IDs: {', '.join(invalid)}",
        )


@router.get("/", response_model=List[ScenarioOut])
def list_scenarios(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return db.query(Scenario).order_by(Scenario.created_at.desc()).all()

@router.get("/published", response_model=List[ScenarioOut])
def list_published_scenarios(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Player-accessible list of published scenarios - used e.g. when starting
    a new collaborative lab group, without exposing the full admin catalogue."""
    return db.query(Scenario).filter(Scenario.status == "published").order_by(Scenario.created_at.desc()).all()


@router.get("/drafts", response_model=List[ScenarioOut])
def list_ai_drafts(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    """Scenarios created via the AI-to-Draft-Lab workflow (Threat Feed / AI Assistant),
    most recent first. Players never see this list - it is admin-only."""
    return (
        db.query(Scenario)
        .filter(Scenario.created_from_ai.is_(True))
        .order_by(Scenario.created_at.desc())
        .all()
    )


@router.get("/check-source", response_model=Optional[DraftConflict])
def check_source_conflict(
    source_url: str = Query(..., max_length=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Look up whether a Draft Lab already exists for a given article URL, so the
    AI Generator / Threat Feed 'Create Lab' button can avoid silent duplicates."""
    existing = (
        db.query(Scenario)
        .filter(Scenario.source_url == source_url, Scenario.status.in_(_OPEN_DRAFT_STATUSES))
        .order_by(Scenario.created_at.desc())
        .first()
    )
    if not existing:
        return None
    return DraftConflict(
        existing_scenario_id=existing.id,
        existing_title=existing.title,
        existing_status=existing.status,
    )


@router.post("/from-source", response_model=ScenarioOut, status_code=201)
def create_scenario_from_source(
    payload: ScenarioFromSource,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """AI-to-Draft-Lab entry point used by both the Threat Feed 'Create Lab' button
    and the AI Assistant / AI Generator. Creates a Draft scenario pre-filled with
    the source article, without triggering AI generation - the administrator
    reviews and clicks 'Generate with AI' (or edits by hand) from the draft editor.
    Invisible to players until published, exactly like every other scenario."""
    validate_mitre_ids(payload.mitre_techniques or [])

    if payload.source_url and not payload.force_new_version:
        existing = (
            db.query(Scenario)
            .filter(Scenario.source_url == payload.source_url, Scenario.status.in_(_OPEN_DRAFT_STATUSES))
            .order_by(Scenario.created_at.desc())
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "existing_scenario_id": existing.id,
                    "existing_title": existing.title,
                    "existing_status": existing.status,
                    "message": "A Draft Lab already exists for this source.",
                },
            )

    draft_version = 1
    if payload.source_url and payload.force_new_version:
        latest = (
            db.query(Scenario)
            .filter(Scenario.source_url == payload.source_url)
            .order_by(Scenario.draft_version.desc())
            .first()
        )
        if latest:
            draft_version = (latest.draft_version or 1) + 1

    scenario = Scenario(
        title=payload.title,
        description=payload.description,
        article_text=payload.source_article,
        mitre_techniques=payload.mitre_techniques or [],
        iocs=payload.iocs or [],
        difficulty=payload.difficulty or "intermediate",
        num_questions=payload.num_questions or 10,
        status="draft",
        created_by=current_user.id,
        created_from_ai=True,
        source_url=payload.source_url,
        source_title=payload.source_title,
        source_article=payload.source_article,
        ai_prompt=payload.ai_prompt,
        draft_version=draft_version,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.post("/", response_model=ScenarioOut, status_code=201)
def create_scenario(
    scenario_in: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    validate_mitre_ids(scenario_in.mitre_techniques or [])
    scenario = Scenario(**scenario_in.model_dump(), created_by=current_user.id)
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if current_user.role != "admin":
        assignment = db.query(PlayerLab).filter(
            PlayerLab.scenario_id == scenario_id,
            PlayerLab.player_id == current_user.id,
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="Scenario is not assigned to this player")
    return scenario


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    update: ScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if update.mitre_techniques is not None:
        validate_mitre_ids(update.mitre_techniques)
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    db.delete(scenario)
    db.commit()


@router.post("/{scenario_id}/generate")
def generate_scenario(
    scenario_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    scenario.status = "generating"
    db.commit()
    background_tasks.add_task(run_ai_generation, scenario_id)
    return {"message": "Generation started", "scenario_id": scenario_id, "status": "generating"}


@router.post("/{scenario_id}/publish")
def publish_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if scenario.status not in ("ready", "generated"):
        raise HTTPException(status_code=400, detail="Scenario is not ready to publish")
    scenario.status = "published"
    scenario.approved_by = current_user.id
    scenario.approved_at = datetime.now(timezone.utc)
    scenario.published_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Scenario published"}
