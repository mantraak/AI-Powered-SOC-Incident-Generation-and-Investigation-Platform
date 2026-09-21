"""Optional Celery entry point for the daily threat-intelligence pipeline.

The repository already declares ``celery`` and ships a Redis service, but no
worker/beat process is deployed, so the in-process asyncio scheduler in
``app.services.threat_intel.scheduler`` is the default. Deployments that add a
worker can use this module instead - both call the same
``ThreatPipelineService``, so behaviour and idempotency are identical.

    celery -A app.workers.threat_tasks.celery_app worker -l info
    celery -A app.workers.threat_tasks.celery_app beat   -l info

Importing this module without Celery installed does not fail; ``celery_app``
is simply ``None`` and the plain callable below stays usable.
"""

from __future__ import annotations

import logging

from app.core.config import settings
from app.services.threat_intel.pipeline import run_daily_threat_pipeline_sync

logger = logging.getLogger(__name__)

try:  # pragma: no cover - depends on optional deployment dependency
    from celery import Celery
    from celery.schedules import crontab
except ImportError:  # pragma: no cover
    Celery = None
    crontab = None

celery_app = None

if Celery is not None:  # pragma: no cover - exercised only with a broker
    celery_app = Celery(
        "romulus_threat_intel",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
    )
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        beat_schedule={
            "daily-threat-lab-pipeline": {
                "task": "threat_intel.run_daily_pipeline",
                "schedule": crontab(hour=5, minute=0),
                "kwargs": {"trigger": "scheduled"},
            },
        },
    )

    @celery_app.task(name="threat_intel.run_daily_pipeline", bind=True, max_retries=0)
    def run_daily_threat_pipeline_task(self, trigger: str = "scheduled") -> dict:
        return run_pipeline(trigger)


def run_pipeline(trigger: str = "scheduled") -> dict:
    """Broker-independent callable (also handy from a shell/cron)."""
    summary = run_daily_threat_pipeline_sync(trigger=trigger)
    logger.info("Threat pipeline (%s) finished: %s", trigger, summary)
    return summary
