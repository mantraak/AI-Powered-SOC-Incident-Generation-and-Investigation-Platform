"""24-hour scheduler for the automated threat-lab pipeline.

The backend has no Celery worker deployed today (the dependency is declared but
no broker-backed worker/beat service exists), so the scheduler runs as an
asyncio task inside the FastAPI lifespan - the same place the MITRE catalogue
is initialised. That keeps the feature working in every existing deployment
(``run-dev.sh`` and ``docker compose`` alike) with no new infrastructure.

Deployments that *do* run a Celery worker can instead disable this loop
(``THREAT_LAB_SCHEDULER_ENABLED=false``) and schedule
``app.workers.threat_tasks.run_daily_threat_pipeline_task`` from beat; both
paths call the identical ``ThreatPipelineService``.

Safety:
* the loop never raises into the app;
* the pipeline itself is idempotent, so an extra tick cannot duplicate labs;
* the last run time is read from the database, so a restart loop cannot cause
  repeated executions.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.threat_intel import ThreatFeedRun, ThreatFeedRunStatus
from app.services.threat_intel.pipeline import (
    ThreatPipelineAlreadyRunning,
    ThreatPipelineDisabled,
    run_daily_threat_pipeline,
)

logger = logging.getLogger(__name__)

# How often the loop wakes up to check whether a run is due.
TICK_SECONDS = 300

_task: asyncio.Task | None = None


def interval() -> timedelta:
    return timedelta(hours=max(1, settings.THREAT_FEED_INTERVAL_HOURS))


def last_completed_run() -> ThreatFeedRun | None:
    db = SessionLocal()
    try:
        return (
            db.query(ThreatFeedRun)
            .filter(ThreatFeedRun.status != ThreatFeedRunStatus.running)
            .order_by(ThreatFeedRun.started_at.desc().nullslast(), ThreatFeedRun.id.desc())
            .first()
        )
    finally:
        db.close()


def next_run_at(reference: datetime | None = None) -> datetime:
    """When the next automated execution is due."""
    run = last_completed_run()
    started = run.started_at if run else None
    if started is None:
        return reference or datetime.now(timezone.utc)
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return started + interval()


def is_due(now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    return next_run_at(now) <= now


async def _loop() -> None:
    logger.info(
        "Automated threat-lab scheduler started (interval=%sh, limit=%s)",
        settings.THREAT_FEED_INTERVAL_HOURS, settings.THREAT_LAB_GENERATION_LIMIT,
    )
    if settings.THREAT_LAB_RUN_ON_STARTUP:
        await _tick("startup")
    while True:
        try:
            await asyncio.sleep(TICK_SECONDS)
            if is_due():
                await _tick("scheduled")
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - the loop must survive anything
            logger.exception("Threat-lab scheduler tick failed")


async def _tick(trigger: str) -> None:
    try:
        summary = await run_daily_threat_pipeline(trigger=trigger)
        logger.info("Automated threat-lab pipeline finished: %s", summary)
    except ThreatPipelineDisabled as exc:
        logger.info("Automated threat-lab pipeline skipped: %s", exc)
    except ThreatPipelineAlreadyRunning as exc:
        logger.info("Automated threat-lab pipeline skipped: %s", exc)
    except Exception:  # noqa: BLE001
        logger.exception("Automated threat-lab pipeline raised unexpectedly")


def start() -> bool:
    """Start the background scheduler. Returns True when it was started."""
    global _task
    if not (settings.AUTOMATED_THREAT_LABS_ENABLED and settings.THREAT_LAB_SCHEDULER_ENABLED):
        logger.info("Automated threat-lab scheduler is disabled by configuration")
        return False
    if _task and not _task.done():
        return True
    _task = asyncio.create_task(_loop(), name="threat-lab-scheduler")
    return True


async def stop() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
    _task = None


def is_running() -> bool:
    return bool(_task and not _task.done())
