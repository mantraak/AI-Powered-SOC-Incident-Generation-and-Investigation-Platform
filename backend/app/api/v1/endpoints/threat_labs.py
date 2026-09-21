"""API for the automated 24h Threat-Feed -> SOC Lab pipeline.

Additive only: the existing /news, /scenarios and /labs endpoints are untouched,
and every automated lab is an ordinary published Scenario + PlayerLab, so the
existing investigation, scoring and reporting flows apply unchanged.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_admin, get_current_player, get_current_user
from app.db.session import get_db
from app.models.lab import PlayerLab
from app.models.scenario import Scenario
from app.models.threat_intel import ThreatCandidate, ThreatCandidateStatus, ThreatFeedRun
from app.models.user import User
from app.schemas.threat_intel import (
    ThreatCandidateOut,
    ThreatFeedRunDetail,
    ThreatFeedRunOut,
    ThreatLabOut,
    ThreatLabStart,
    ThreatPipelineStatus,
)
from app.services.news_service import get_public_news_config
from app.services.threat_intel import scheduler
from app.services.threat_intel.pipeline import (
    ThreatPipelineAlreadyRunning,
    ThreatPipelineDisabled,
    active_run,
    retry_candidate,
)
from app.services.workspace_service import provision_lab_workspace

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_LAB_LIMIT = 12


# -- helpers -------------------------------------------------------------------


def _enum_value(value) -> str:
    return getattr(value, "value", value)


def _candidate_for(db: Session, scenario: Scenario) -> ThreatCandidate | None:
    if not scenario.threat_fingerprint:
        return None
    return (
        db.query(ThreatCandidate)
        .filter(ThreatCandidate.fingerprint == scenario.threat_fingerprint)
        .first()
    )


def _to_threat_lab(db: Session, scenario: Scenario, user: User) -> ThreatLabOut:
    candidate = _candidate_for(db, scenario)
    my_lab = (
        db.query(PlayerLab)
        .filter(PlayerLab.scenario_id == scenario.id, PlayerLab.player_id == user.id)
        .first()
    )
    breakdown = (candidate.score_breakdown or {}) if candidate else {}
    explanation = breakdown.get("explanation") or []
    return ThreatLabOut(
        scenario_id=scenario.id,
        title=scenario.title,
        description=scenario.description,
        status=_enum_value(scenario.status),
        difficulty=_enum_value(scenario.difficulty) or "intermediate",
        threat_score=scenario.threat_score,
        threat_rank=scenario.threat_rank,
        threat_category=scenario.threat_category,
        threat_severity=scenario.threat_severity,
        active_exploitation=bool(scenario.active_exploitation),
        mitre_techniques=scenario.mitre_techniques or [],
        iocs=[str(value) for value in (scenario.iocs or [])][:25],
        source_url=scenario.source_url,
        source_title=scenario.source_title,
        auto_generated_at=scenario.auto_generated_at,
        threat_feed_run_id=scenario.threat_feed_run_id,
        cve_ids=(candidate.cve_ids or []) if candidate else [],
        article_count=(candidate.article_count or 1) if candidate else 1,
        sources=(candidate.sources or []) if candidate else [],
        score_explanation=[str(item) for item in explanation][:8],
        my_lab_id=my_lab.id if my_lab else None,
        my_lab_status=my_lab.status if my_lab else None,
    )


def _published_auto_scenarios(db: Session, limit: int):
    return (
        db.query(Scenario)
        .filter(Scenario.auto_generated.is_(True), Scenario.status == "published")
        .order_by(Scenario.auto_generated_at.desc().nullslast(), Scenario.id.desc())
        .limit(limit)
        .all()
    )


# -- student / shared endpoints -------------------------------------------------


@router.get("/today", response_model=list[ThreatLabOut])
def todays_threat_labs(
    limit: int = Query(default=0, ge=0, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Today's automatically generated Top-N threat labs.

    Falls back to the most recent generated set when today's run produced
    nothing, so the section is never empty for no reason.
    """
    effective_limit = limit or settings.THREAT_LAB_GENERATION_LIMIT
    latest_run_id = (
        db.query(Scenario.threat_feed_run_id)
        .filter(
            Scenario.auto_generated.is_(True),
            Scenario.status == "published",
            Scenario.threat_feed_run_id.isnot(None),
        )
        .order_by(Scenario.threat_feed_run_id.desc())
        .limit(1)
        .scalar()
    )

    query = db.query(Scenario).filter(
        Scenario.auto_generated.is_(True), Scenario.status == "published"
    )
    if latest_run_id is not None:
        query = query.filter(Scenario.threat_feed_run_id == latest_run_id)

    scenarios = (
        query.order_by(
            Scenario.threat_rank.asc().nullslast(),
            Scenario.threat_score.desc().nullslast(),
            Scenario.id.desc(),
        )
        .limit(effective_limit)
        .all()
    )
    return [_to_threat_lab(db, scenario, current_user) for scenario in scenarios]


@router.get("/", response_model=list[ThreatLabOut])
def list_threat_labs(
    limit: int = Query(default=DEFAULT_LAB_LIMIT, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Archive of every published automated threat lab, newest first."""
    scenarios = _published_auto_scenarios(db, limit)
    return [_to_threat_lab(db, scenario, current_user) for scenario in scenarios]


@router.post("/{scenario_id}/start", response_model=ThreatLabStart, status_code=201)
def start_threat_lab(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    """Self-enrol the caller into an automated threat lab.

    Creates the same ``PlayerLab`` assignment an administrator would create, so
    the ordinary investigation workspace, answers, scoring and reporting work
    without any special-casing. Idempotent: a second call returns the same lab.
    """
    scenario = (
        db.query(Scenario)
        .filter(
            Scenario.id == scenario_id,
            Scenario.auto_generated.is_(True),
            Scenario.status == "published",
        )
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Published threat lab not found")

    existing = (
        db.query(PlayerLab)
        .filter(PlayerLab.scenario_id == scenario_id, PlayerLab.player_id == current_user.id)
        .first()
    )
    if existing:
        return ThreatLabStart(
            lab_id=existing.id,
            scenario_id=scenario_id,
            status=existing.status,
            created=False,
        )

    lab = PlayerLab(player_id=current_user.id, scenario_id=scenario_id)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    try:
        provision_lab_workspace(db, lab)
    except Exception:  # noqa: BLE001 - SIEM provisioning is best-effort
        logger.exception("Workspace provisioning failed for automated lab %s", lab.id)
    return ThreatLabStart(
        lab_id=lab.id,
        scenario_id=scenario_id,
        status=lab.status,
        created=True,
    )


# -- admin endpoints ------------------------------------------------------------


@router.get("/status", response_model=ThreatPipelineStatus)
def pipeline_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    last_run = (
        db.query(ThreatFeedRun)
        .order_by(ThreatFeedRun.started_at.desc().nullslast(), ThreatFeedRun.id.desc())
        .first()
    )
    total_labs = (
        db.query(Scenario)
        .filter(Scenario.auto_generated.is_(True), Scenario.status == "published")
        .count()
    )
    failed = (
        db.query(ThreatCandidate)
        .filter(ThreatCandidate.status == ThreatCandidateStatus.failed)
        .count()
    )
    return ThreatPipelineStatus(
        enabled=settings.AUTOMATED_THREAT_LABS_ENABLED,
        scheduler_enabled=settings.THREAT_LAB_SCHEDULER_ENABLED,
        scheduler_running=scheduler.is_running(),
        interval_hours=settings.THREAT_FEED_INTERVAL_HOURS,
        lookback_hours=settings.THREAT_FEED_LOOKBACK_HOURS,
        generation_limit=settings.THREAT_LAB_GENERATION_LIMIT,
        min_score=settings.THREAT_LAB_MIN_SCORE,
        auto_publish=settings.THREAT_LAB_AUTO_PUBLISH,
        last_run=_run_out(last_run) if last_run else None,
        next_run_at=scheduler.next_run_at() if settings.AUTOMATED_THREAT_LABS_ENABLED else None,
        total_labs_generated=total_labs,
        failed_candidates=failed,
        news_api_key_configured=bool(get_public_news_config(db).get("api_key_configured")),
    )


def _run_out(run: ThreatFeedRun) -> ThreatFeedRunOut:
    return ThreatFeedRunOut(
        id=run.id,
        status=_enum_value(run.status),
        trigger=run.trigger,
        started_at=run.started_at,
        completed_at=run.completed_at,
        articles_processed=run.articles_processed or 0,
        unique_threats_identified=run.unique_threats_identified or 0,
        threats_selected=run.threats_selected or 0,
        labs_created=run.labs_created or 0,
        labs_failed=run.labs_failed or 0,
        errors=[e for e in (run.errors or []) if isinstance(e, dict)],
        triggered_by=run.triggered_by,
    )


def _candidate_out(candidate: ThreatCandidate) -> ThreatCandidateOut:
    return ThreatCandidateOut(
        id=candidate.id,
        fingerprint=candidate.fingerprint,
        title=candidate.title,
        summary=candidate.summary,
        category=candidate.category,
        severity=candidate.severity,
        active_exploitation=bool(candidate.active_exploitation),
        threat_score=candidate.threat_score or 0.0,
        rank=candidate.rank,
        status=_enum_value(candidate.status),
        scenario_id=candidate.scenario_id,
        error=candidate.error,
        cve_ids=candidate.cve_ids or [],
        malware_names=candidate.malware_names or [],
        threat_actors=candidate.threat_actors or [],
        affected_products=candidate.affected_products or [],
        mitre_techniques=candidate.mitre_techniques or [],
        iocs=[ioc for ioc in (candidate.iocs or []) if isinstance(ioc, dict)],
        sources=[s for s in (candidate.sources or []) if isinstance(s, dict)],
        article_count=candidate.article_count or 1,
        source_url=candidate.source_url,
        source_title=candidate.source_title,
        published_at=candidate.published_at,
        score_breakdown=candidate.score_breakdown or {},
        first_seen_at=candidate.first_seen_at,
        last_seen_at=candidate.last_seen_at,
    )


@router.get("/runs", response_model=list[ThreatFeedRunOut])
def list_runs(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    runs = (
        db.query(ThreatFeedRun)
        .order_by(ThreatFeedRun.id.desc())
        .limit(limit)
        .all()
    )
    return [_run_out(run) for run in runs]


@router.get("/runs/{run_id}", response_model=ThreatFeedRunDetail)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    run = db.query(ThreatFeedRun).filter(ThreatFeedRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Threat feed run not found")
    candidates = (
        db.query(ThreatCandidate)
        .filter(
            (ThreatCandidate.run_id == run_id) | (ThreatCandidate.last_seen_run_id == run_id)
        )
        .order_by(ThreatCandidate.rank.asc().nullslast(), ThreatCandidate.threat_score.desc())
        .all()
    )
    detail = ThreatFeedRunDetail(**_run_out(run).model_dump())
    detail.candidates = [_candidate_out(candidate) for candidate in candidates]
    return detail


@router.post("/runs", status_code=202)
def trigger_run(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Run the daily pipeline now (same code path as the scheduler)."""
    if not settings.AUTOMATED_THREAT_LABS_ENABLED:
        raise HTTPException(
            status_code=409,
            detail="Automated threat labs are disabled (AUTOMATED_THREAT_LABS_ENABLED=false)",
        )
    in_flight = active_run(db)
    if in_flight:
        raise HTTPException(
            status_code=409,
            detail=f"Threat pipeline run #{in_flight.id} is already in progress",
        )
    background_tasks.add_task(_run_pipeline_background, current_user.id)
    return {"message": "Threat intelligence pipeline started", "trigger": "manual"}


def _run_pipeline_background(user_id: int) -> None:
    import asyncio

    from app.services.threat_intel.pipeline import run_daily_threat_pipeline

    try:
        summary = asyncio.run(run_daily_threat_pipeline(trigger="manual", triggered_by=user_id))
        logger.info("Manual threat pipeline finished: %s", summary)
    except (ThreatPipelineDisabled, ThreatPipelineAlreadyRunning) as exc:
        logger.info("Manual threat pipeline skipped: %s", exc)
    except Exception:  # noqa: BLE001
        logger.exception("Manual threat pipeline failed")


@router.get("/candidates", response_model=list[ThreatCandidateOut])
def list_candidates(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    query = db.query(ThreatCandidate)
    if status:
        try:
            query = query.filter(ThreatCandidate.status == ThreatCandidateStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Unknown status: {status}") from exc
    candidates = (
        query.order_by(ThreatCandidate.last_seen_at.desc().nullslast(), ThreatCandidate.id.desc())
        .limit(limit)
        .all()
    )
    return [_candidate_out(candidate) for candidate in candidates]


@router.post("/candidates/{candidate_id}/retry", response_model=ThreatCandidateOut)
def retry_failed_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Re-attempt scenario generation for one threat (e.g. after an AI failure)."""
    candidate = db.query(ThreatCandidate).filter(ThreatCandidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Threat candidate not found")
    if not settings.AUTOMATED_THREAT_LABS_ENABLED:
        raise HTTPException(status_code=409, detail="Automated threat labs are disabled")
    try:
        candidate = retry_candidate(db, candidate, triggered_by=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _candidate_out(candidate)


@router.get("/runs/{run_id}/labs", response_model=list[ThreatLabOut])
def run_labs(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Every scenario a specific pipeline run produced (published or not)."""
    scenarios = (
        db.query(Scenario)
        .filter(Scenario.threat_feed_run_id == run_id)
        .order_by(Scenario.threat_rank.asc().nullslast(), Scenario.id.asc())
        .all()
    )
    return [_to_threat_lab(db, scenario, current_user) for scenario in scenarios]
