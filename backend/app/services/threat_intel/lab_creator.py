"""Stage 7 - validate a generated scenario and publish it as a student lab.

A generated scenario is only published when it really is investigable. If it is
not, the scenario stays unpublished (invisible to students, exactly like any
other unpublished scenario), the candidate is marked ``failed`` with a reason,
and an administrator can retry it from the existing scenario editor.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.artifact import ScenarioArtifact
from app.models.event import ScenarioEvent
from app.models.indicator import Indicator
from app.models.question import Question
from app.models.scenario import Scenario
from app.models.threat_intel import ThreatCandidate
from app.models.trace import ScenarioTrace
from app.models.traffic import ScenarioTraffic

logger = logging.getLogger(__name__)

MIN_TITLE_CHARS = 10
MIN_DESCRIPTION_CHARS = 60


class ThreatLabValidationError(RuntimeError):
    """Raised when a generated scenario is not fit to publish to students."""


class ThreatLabCreator:
    """Validates and publishes automated threat labs."""

    def __init__(self, auto_publish: bool | None = None):
        from app.core.config import settings

        self.auto_publish = (
            settings.THREAT_LAB_AUTO_PUBLISH if auto_publish is None else auto_publish
        )

    # -- validation -----------------------------------------------------------

    def validate(self, db: Session, scenario: Scenario, candidate: ThreatCandidate) -> dict:
        """Check the minimum publishable content. Raises on failure."""
        problems: list[str] = []

        if not scenario.title or len(scenario.title.strip()) < MIN_TITLE_CHARS:
            problems.append("missing or too-short title")
        if not scenario.description or len(scenario.description.strip()) < MIN_DESCRIPTION_CHARS:
            problems.append("missing or too-short description")
        if not (scenario.source_url or scenario.source_article):
            problems.append("missing threat source")
        if not scenario.threat_category:
            problems.append("missing threat category")
        if not scenario.threat_severity:
            problems.append("missing severity")

        counts = {
            "questions": db.query(Question).filter(Question.scenario_id == scenario.id).count(),
            "events": db.query(ScenarioEvent).filter(ScenarioEvent.scenario_id == scenario.id).count(),
            "artifacts": db.query(ScenarioArtifact).filter(ScenarioArtifact.scenario_id == scenario.id).count(),
            "alerts": db.query(Alert).filter(Alert.scenario_id == scenario.id).count(),
            "indicators": db.query(Indicator).filter(Indicator.scenario_id == scenario.id).count(),
            "traffic": db.query(ScenarioTraffic).filter(ScenarioTraffic.scenario_id == scenario.id).count(),
            "traces": db.query(ScenarioTrace).filter(ScenarioTrace.scenario_id == scenario.id).count(),
        }

        # Investigation objectives: the generated questions drive the lab.
        if counts["questions"] < 1:
            problems.append("no investigation objectives (questions) were generated")

        # At least one meaningful evidence source to investigate.
        evidence_total = (
            counts["events"] + counts["artifacts"] + counts["alerts"]
            + counts["traffic"] + counts["traces"]
        )
        if evidence_total < 1:
            problems.append("no investigation evidence was generated")

        if scenario.status == "validation_failed":
            problems.append("AI generation reported a validation failure")

        if problems:
            raise ThreatLabValidationError("; ".join(problems))

        return {
            "counts": counts,
            "mitre_techniques": scenario.mitre_techniques or [],
            "timeline_steps": len(scenario.timeline or []),
            "expected_findings": bool(scenario.summary),
        }

    # -- publishing -----------------------------------------------------------

    def publish(
        self,
        db: Session,
        scenario: Scenario,
        candidate: ThreatCandidate,
        approved_by: int | None = None,
    ) -> Scenario:
        """Publish the validated scenario so students can pick it up."""
        now = datetime.now(timezone.utc)
        if self.auto_publish:
            scenario.status = "published"
            scenario.published_at = now
            scenario.approved_by = approved_by
            scenario.approved_at = now
        else:
            # Leave for manual admin approval, still marked ready.
            scenario.status = "ready"
        db.commit()
        db.refresh(scenario)
        logger.info(
            "Automated threat lab %s for candidate %s is now %s",
            scenario.id, candidate.fingerprint[:12], scenario.status,
        )
        return scenario
