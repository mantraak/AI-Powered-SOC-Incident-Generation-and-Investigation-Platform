"""Stage 8 - orchestration of the daily Threat Feed -> Top-N SOC Lab pipeline.

    fetch -> normalise -> correlate -> score -> rank -> select Top-N
          -> generate scenario -> validate -> publish -> record run

Design rules enforced here:

* **Idempotent.** ``ThreatCandidate.fingerprint`` is globally unique and a
  threat that already produced a lab is never regenerated, so a double-fired
  scheduler, a retry or a restart cannot create duplicate labs.
* **Partial failure is normal.** Every stage is guarded; one bad AI response or
  one unreachable query degrades that item only, and the reason is recorded on
  the run.
* **Nothing existing is mutated.** The pipeline only ever inserts new rows
  (ThreatFeedRun / ThreatCandidate / Scenario + its generated children).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.scenario import Scenario
from app.models.threat_intel import (
    ThreatCandidate,
    ThreatCandidateStatus,
    ThreatFeedRun,
    ThreatFeedRunStatus,
)
from app.services.threat_intel.collector import ThreatFeedCollector
from app.services.threat_intel.correlator import ThreatCluster, ThreatCorrelator
from app.services.threat_intel.lab_creator import ThreatLabCreator, ThreatLabValidationError
from app.services.threat_intel.normalizer import ThreatNormalizer
from app.services.threat_intel.ranker import ScoredThreat, ThreatRanker
from app.services.threat_intel.scenario_generator import ThreatScenarioGenerator
from app.services.threat_intel.scorer import ThreatScorer

logger = logging.getLogger(__name__)

# Scenario statuses that make a manually-created lab count as existing coverage.
_LIVE_SCENARIO_STATUSES = ("draft", "generating", "generated", "ready", "published")


class ThreatPipelineDisabled(RuntimeError):
    """Raised when the pipeline is invoked while disabled by configuration."""


class ThreatPipelineAlreadyRunning(RuntimeError):
    """Raised when a second execution starts while one is still in flight."""


class ThreatPipelineService:
    """Runs one full daily threat-intelligence pipeline execution."""

    def __init__(
        self,
        collector: ThreatFeedCollector | None = None,
        normalizer: ThreatNormalizer | None = None,
        correlator: ThreatCorrelator | None = None,
        scorer: ThreatScorer | None = None,
        ranker: ThreatRanker | None = None,
        scenario_generator: ThreatScenarioGenerator | None = None,
        lab_creator: ThreatLabCreator | None = None,
    ):
        self.collector = collector or ThreatFeedCollector()
        self.normalizer = normalizer or ThreatNormalizer()
        self.correlator = correlator or ThreatCorrelator()
        self.scorer = scorer or ThreatScorer()
        self.ranker = ranker or ThreatRanker()
        self.scenario_generator = scenario_generator or ThreatScenarioGenerator()
        self.lab_creator = lab_creator or ThreatLabCreator()

    # -- entry point ----------------------------------------------------------

    async def run(
        self,
        db: Session,
        trigger: str = "scheduled",
        triggered_by: int | None = None,
    ) -> ThreatFeedRun:
        if not settings.AUTOMATED_THREAT_LABS_ENABLED:
            raise ThreatPipelineDisabled(
                "Automated threat labs are disabled (AUTOMATED_THREAT_LABS_ENABLED=false)"
            )

        in_flight = active_run(db)
        if in_flight:
            raise ThreatPipelineAlreadyRunning(
                f"Threat pipeline run #{in_flight.id} is already in progress"
            )

        run = ThreatFeedRun(
            started_at=datetime.now(timezone.utc),
            status=ThreatFeedRunStatus.running,
            trigger=trigger,
            triggered_by=triggered_by,
            errors=[],
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        errors: list[dict] = []
        try:
            await self._execute(db, run, errors)
        except Exception as exc:  # noqa: BLE001 - the run record must always close
            logger.exception("Threat intelligence pipeline failed")
            errors.append({"stage": "pipeline", "error": f"{exc.__class__.__name__}: {exc}"})
            run.status = ThreatFeedRunStatus.failed
        finally:
            self._finalize(db, run, errors)
        return run

    # -- stages ---------------------------------------------------------------

    async def _execute(self, db: Session, run: ThreatFeedRun, errors: list[dict]) -> None:
        raw_articles, collect_errors = await self.collector.collect(db)
        errors.extend(collect_errors)

        windowed = self.collector.within_window(raw_articles)
        articles = [
            article
            for article in self.normalizer.normalize_many(windowed)
            if article.security_relevant
        ]
        run.articles_processed = len(windowed)
        db.commit()

        if not articles:
            logger.info("Threat pipeline run %s found no usable articles", run.id)
            return

        clusters = self.correlator.correlate(articles)
        scored = self._score_clusters(clusters)
        run.unique_threats_identified = len(scored)
        db.commit()

        # Persist every identified threat (admin visibility + stable identity).
        candidates: dict[str, ThreatCandidate] = {}
        for threat in self.ranker.rank(scored):
            try:
                candidates[threat.fingerprint] = self._upsert_candidate(db, run, threat)
            except SQLAlchemyError as exc:
                db.rollback()
                errors.append({
                    "stage": "persist_candidate",
                    "fingerprint": threat.fingerprint,
                    "error": f"{exc.__class__.__name__}: {exc}",
                })

        selected = self.ranker.select_top([t for t in scored if t.fingerprint in candidates])
        run.threats_selected = len(selected)
        db.commit()

        for threat in selected:
            candidate = candidates[threat.fingerprint]
            candidate.rank = threat.rank
            candidate.status = ThreatCandidateStatus.selected
            db.commit()
            self._build_lab(db, run, candidate, threat, errors)

    def _score_clusters(self, clusters: list[ThreatCluster]) -> list[ScoredThreat]:
        scored: list[ScoredThreat] = []
        for cluster in clusters:
            score, breakdown = self.scorer.score(cluster)
            scored.append(ScoredThreat(cluster=cluster, score=score, breakdown=breakdown))
        return scored

    # -- persistence ----------------------------------------------------------

    def _upsert_candidate(
        self,
        db: Session,
        run: ThreatFeedRun,
        threat: ScoredThreat,
    ) -> ThreatCandidate:
        """Create or refresh the row for this threat identity.

        The unique fingerprint is the idempotency key: a threat seen again on a
        later run updates its existing row instead of creating a second one.
        """
        cluster = threat.cluster
        now = datetime.now(timezone.utc)
        candidate = (
            db.query(ThreatCandidate)
            .filter(ThreatCandidate.fingerprint == threat.fingerprint)
            .first()
        )
        created = candidate is None
        if created:
            candidate = ThreatCandidate(
                fingerprint=threat.fingerprint,
                run_id=run.id,
                first_seen_at=now,
                status=ThreatCandidateStatus.identified,
            )
            db.add(candidate)

        candidate.last_seen_run_id = run.id
        candidate.last_seen_at = now
        candidate.title = cluster.title[:300]
        candidate.summary = (cluster.primary.description or cluster.title)[:4000]
        candidate.category = cluster.category
        candidate.severity = cluster.severity
        candidate.active_exploitation = cluster.active_exploitation
        candidate.threat_score = threat.score
        candidate.score_breakdown = threat.breakdown
        candidate.rank = threat.rank
        candidate.cve_ids = cluster.cve_ids
        candidate.malware_names = cluster.malware_names
        candidate.threat_actors = cluster.threat_actors
        candidate.affected_products = cluster.affected_products
        candidate.iocs = cluster.iocs
        candidate.mitre_techniques = candidate.mitre_techniques or cluster.mitre_techniques
        candidate.source_url = cluster.primary.link
        candidate.source_title = cluster.primary.source
        candidate.sources = cluster.sources
        candidate.article_ids = [article.article_id for article in cluster.articles]
        candidate.article_count = cluster.article_count
        candidate.article_text = cluster.summary_text()
        candidate.published_at = cluster.published_at

        try:
            db.commit()
        except IntegrityError:
            # Concurrent run inserted the same fingerprint first - adopt its row.
            db.rollback()
            candidate = (
                db.query(ThreatCandidate)
                .filter(ThreatCandidate.fingerprint == threat.fingerprint)
                .first()
            )
            if candidate is None:
                raise
        db.refresh(candidate)
        return candidate

    # -- duplicate protection -------------------------------------------------

    @staticmethod
    def existing_pipeline_scenario(db: Session, candidate: ThreatCandidate) -> Scenario | None:
        """The scenario this pipeline already produced for this exact threat."""
        if candidate.scenario_id:
            scenario = db.query(Scenario).filter(Scenario.id == candidate.scenario_id).first()
            if scenario:
                return scenario
        return (
            db.query(Scenario)
            .filter(Scenario.threat_fingerprint == candidate.fingerprint)
            .order_by(Scenario.id.desc())
            .first()
        )

    @staticmethod
    def existing_manual_coverage(db: Session, cluster: ThreatCluster) -> Scenario | None:
        """A lab an administrator already created by hand from this threat."""
        urls = [article.link for article in cluster.articles if article.link]
        if not urls:
            return None
        return (
            db.query(Scenario)
            .filter(
                Scenario.source_url.in_(urls),
                Scenario.status.in_(_LIVE_SCENARIO_STATUSES),
            )
            .order_by(Scenario.id.desc())
            .first()
        )

    # -- lab construction -----------------------------------------------------

    def _build_lab(
        self,
        db: Session,
        run: ThreatFeedRun,
        candidate: ThreatCandidate,
        threat: ScoredThreat,
        errors: list[dict],
    ) -> None:
        """Generate + validate + publish one lab. Never raises."""
        scenario: Scenario | None = None
        try:
            scenario = self.existing_pipeline_scenario(db, candidate)

            if scenario and scenario.status in ("published", "ready"):
                # Already delivered on an earlier run/retry - nothing to do.
                candidate.scenario_id = scenario.id
                candidate.status = ThreatCandidateStatus.lab_created
                candidate.error = None
                db.commit()
                logger.info(
                    "Threat %s already has lab scenario #%s; skipping duplicate generation",
                    candidate.fingerprint[:12], scenario.id,
                )
                return

            if scenario is None:
                manual = self.existing_manual_coverage(db, threat.cluster)
                if manual:
                    candidate.status = ThreatCandidateStatus.duplicate
                    candidate.scenario_id = manual.id
                    candidate.error = None
                    db.commit()
                    reason = f"Existing scenario #{manual.id} was already created from this source"
                    logger.info("Skipping duplicate threat %s: %s", candidate.fingerprint[:12], reason)
                    errors.append({
                        "stage": "duplicate_check",
                        "fingerprint": candidate.fingerprint,
                        "info": reason,
                    })
                    return

                scenario = self.scenario_generator.create_draft(
                    db, candidate, threat.cluster, run.id, run.triggered_by
                )
            else:
                # An unfinished draft from a crashed/failed attempt - reuse it
                # rather than leaving an orphan and creating a second scenario.
                candidate.scenario_id = scenario.id
                candidate.status = ThreatCandidateStatus.generating
                db.commit()

            scenario = self.scenario_generator.generate(db, scenario)
            if scenario is None:
                raise ThreatLabValidationError("scenario disappeared during generation")

            validation = self.lab_creator.validate(db, scenario, candidate)
            self.lab_creator.publish(db, scenario, candidate, approved_by=run.triggered_by)

            candidate.status = ThreatCandidateStatus.lab_created
            candidate.mitre_techniques = scenario.mitre_techniques or []
            candidate.error = None
            run.labs_created = (run.labs_created or 0) + 1
            db.commit()
            logger.info(
                "Automated threat lab created: scenario=%s rank=%s score=%s evidence=%s",
                scenario.id, candidate.rank, candidate.threat_score, validation["counts"],
            )

        except ThreatLabValidationError as exc:
            # Keep the scenario out of the student catalogue and out of the
            # "already delivered" fast path, so an admin can retry or fix it.
            self._mark_scenario_failed(db, scenario)
            self._fail_candidate(db, run, candidate, errors, "validation", str(exc))
        except Exception as exc:  # noqa: BLE001 - one bad threat must not stop the run
            logger.exception("Automated lab generation failed for %s", candidate.fingerprint[:12])
            self._fail_candidate(
                db, run, candidate, errors, "generation", f"{exc.__class__.__name__}: {exc}"
            )

    @staticmethod
    def _mark_scenario_failed(db: Session, scenario: Scenario | None) -> None:
        if scenario is None:
            return
        try:
            if scenario.status not in ("published",):
                scenario.status = "validation_failed"
                db.commit()
        except SQLAlchemyError:
            db.rollback()

    @staticmethod
    def _fail_candidate(
        db: Session,
        run: ThreatFeedRun,
        candidate: ThreatCandidate,
        errors: list[dict],
        stage: str,
        message: str,
    ) -> None:
        try:
            db.rollback()
        except SQLAlchemyError:
            pass
        try:
            candidate.status = ThreatCandidateStatus.failed
            candidate.error = message[:2000]
            run.labs_failed = (run.labs_failed or 0) + 1
            db.commit()
        except SQLAlchemyError:
            db.rollback()
        errors.append({
            "stage": stage,
            "fingerprint": candidate.fingerprint,
            "threat": candidate.title,
            "error": message[:500],
        })
        logger.warning("Threat lab %s failed at %s: %s", candidate.fingerprint[:12], stage, message)

    # -- bookkeeping ----------------------------------------------------------

    @staticmethod
    def _finalize(db: Session, run: ThreatFeedRun, errors: list[dict]) -> None:
        try:
            run.completed_at = datetime.now(timezone.utc)
            run.errors = errors
            if run.status != ThreatFeedRunStatus.failed:
                if run.labs_failed:
                    run.status = ThreatFeedRunStatus.partial
                elif errors and not run.labs_created:
                    run.status = ThreatFeedRunStatus.partial
                else:
                    run.status = ThreatFeedRunStatus.completed
            db.commit()
        except SQLAlchemyError:
            logger.exception("Could not finalise threat feed run %s", getattr(run, "id", "?"))
            db.rollback()


def active_run(db: Session) -> ThreatFeedRun | None:
    """A still-running execution inside the stale-lock TTL, if any.

    First line of defence against a double-fired scheduler: only one pipeline
    execution may be in flight at a time. Runs older than the TTL are treated
    as crashed and no longer block new executions.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.THREAT_LAB_LOCK_TTL_SECONDS)
    candidates = (
        db.query(ThreatFeedRun)
        .filter(ThreatFeedRun.status == ThreatFeedRunStatus.running)
        .order_by(ThreatFeedRun.id.desc())
        .all()
    )
    for run in candidates:
        started = run.started_at
        if started is None:
            return run
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if started >= cutoff:
            return run
    return None


def rebuild_cluster(candidate: ThreatCandidate) -> ThreatCluster:
    """Reconstruct a cluster from a persisted candidate (used by admin retry)."""
    normalizer = ThreatNormalizer()
    rows = []
    for source in candidate.sources or []:
        if not isinstance(source, dict):
            continue
        rows.append({
            "id": source.get("article_id"),
            "title": source.get("title"),
            "link": source.get("url"),
            "description": source.get("description") or candidate.summary or "",
            "source": source.get("source"),
            "published_at": source.get("published_at"),
        })
    if not rows:
        rows.append({
            "id": candidate.fingerprint,
            "title": candidate.title,
            "link": candidate.source_url or f"urn:threat:{candidate.fingerprint}",
            "description": candidate.article_text or candidate.summary or "",
            "source": candidate.source_title or "Threat intelligence",
            "published_at": candidate.published_at.isoformat() if candidate.published_at else None,
        })
    articles = normalizer.normalize_many(rows)
    if not articles:
        raise ValueError("Candidate has no reconstructable source articles")
    return ThreatCluster(articles=articles)


def retry_candidate(
    db: Session,
    candidate: ThreatCandidate,
    triggered_by: int | None = None,
    service: "ThreatPipelineService | None" = None,
) -> ThreatCandidate:
    """Re-attempt lab generation for a single failed/identified candidate.

    Runs inside a dedicated ThreatFeedRun so the retry is visible in the admin
    run history and still counts towards the duplicate protection.
    """
    service = service or ThreatPipelineService()
    cluster = rebuild_cluster(candidate)
    score, breakdown = service.scorer.score(cluster)
    threat = ScoredThreat(
        cluster=cluster,
        score=candidate.threat_score or score,
        breakdown=candidate.score_breakdown or breakdown,
        rank=candidate.rank or 1,
    )

    run = ThreatFeedRun(
        started_at=datetime.now(timezone.utc),
        status=ThreatFeedRunStatus.running,
        trigger="manual-retry",
        triggered_by=triggered_by,
        errors=[],
        unique_threats_identified=1,
        threats_selected=1,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    errors: list[dict] = []
    candidate.status = ThreatCandidateStatus.selected
    candidate.error = None
    candidate.last_seen_run_id = run.id
    db.commit()
    service._build_lab(db, run, candidate, threat, errors)
    ThreatPipelineService._finalize(db, run, errors)
    db.refresh(candidate)
    return candidate


# -- convenience entry points --------------------------------------------------


async def run_daily_threat_pipeline(
    trigger: str = "scheduled",
    triggered_by: int | None = None,
    db: Session | None = None,
) -> dict:
    """Run the pipeline with its own session unless one is supplied.

    Returns a small JSON-safe summary so callers (scheduler, Celery task,
    admin endpoint) can log/report without touching ORM objects.
    """
    owned = db is None
    session = db or SessionLocal()
    try:
        run = await ThreatPipelineService().run(session, trigger=trigger, triggered_by=triggered_by)
        return summarize_run(run)
    finally:
        if owned:
            session.close()


def summarize_run(run: ThreatFeedRun) -> dict:
    return {
        "id": run.id,
        "status": getattr(run.status, "value", run.status),
        "trigger": run.trigger,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "articles_processed": run.articles_processed,
        "unique_threats_identified": run.unique_threats_identified,
        "threats_selected": run.threats_selected,
        "labs_created": run.labs_created,
        "labs_failed": run.labs_failed,
        "errors": run.errors or [],
    }


def run_daily_threat_pipeline_sync(
    trigger: str = "scheduled",
    triggered_by: int | None = None,
) -> dict:
    """Blocking wrapper for non-async callers (Celery worker, CLI)."""
    return asyncio.run(run_daily_threat_pipeline(trigger=trigger, triggered_by=triggered_by))
