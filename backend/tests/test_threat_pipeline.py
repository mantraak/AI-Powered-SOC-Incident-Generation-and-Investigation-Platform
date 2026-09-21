"""End-to-end pipeline tests: feed -> correlate -> rank -> generate -> publish.

The feed and the AI provider are the only things stubbed; every other layer
(correlation, scoring, scenario persistence, validation, publishing, lab
assignment) is the real production code running against a real database.
"""

from __future__ import annotations

import asyncio

import pytest

from tests import factories


# -- stubs ---------------------------------------------------------------------


class FakeFeed:
    """Stands in for newsdata.io. Records how often it was called."""

    def __init__(self, rows: list[dict] | None = None, error: Exception | None = None):
        self.rows = rows if rows is not None else factories.mixed_feed()
        self.error = error
        self.calls = 0

    async def __call__(self, db, query=None, page=None):
        self.calls += 1
        if self.error:
            raise self.error
        return {
            "query": query or "test",
            "articles": list(self.rows),
            "next_page": None,
            "total_results": len(self.rows),
            "cached": False,
        }


@pytest.fixture
def patch_feed(monkeypatch):
    def _apply(feed: FakeFeed):
        monkeypatch.setattr(
            "app.services.threat_intel.collector.fetch_latest_news", feed
        )
        return feed

    return _apply


@pytest.fixture
def patch_ai(monkeypatch):
    """Make the existing generator service use a canned AI response."""
    state = {"calls": 0, "fail_first": 0, "payload": None}

    class _Config:
        api_key = "test-key"
        endpoint = "https://ai.test/v1/chat/completions"
        model = "test-model"

    def fake_get_ai_config(db):
        return _Config()

    def fake_call_provider(prompt, db):
        state["calls"] += 1
        if state["calls"] <= state["fail_first"]:
            raise RuntimeError("AI provider timed out")
        return state["payload"] or factories.ai_scenario_payload()

    monkeypatch.setattr("app.services.generator_service.get_ai_config", fake_get_ai_config)
    monkeypatch.setattr("app.services.generator_service._call_provider", fake_call_provider)
    return state


@pytest.fixture
def pipeline(db, monkeypatch):
    """Pipeline wired to the test session (generator uses its own session)."""
    from sqlalchemy.orm import Session

    from app.services.threat_intel.pipeline import ThreatPipelineService

    class _SameSession:
        def __call__(self, *args, **kwargs):
            return _NonClosingSession(db)

    class _NonClosingSession:
        """The generator closes its session; the test session must survive."""

        def __init__(self, session: Session):
            self._session = session

        def __getattr__(self, item):
            return getattr(self._session, item)

        def close(self):
            return None

    monkeypatch.setattr("app.services.generator_service.SessionLocal", _SameSession())
    monkeypatch.setattr("app.services.threat_intel.pipeline.SessionLocal", _SameSession())
    return ThreatPipelineService()


def run(coro):
    return asyncio.run(coro)


def _labs(db):
    from app.models.scenario import Scenario

    return db.query(Scenario).filter(Scenario.auto_generated.is_(True)).all()


# -- happy path -----------------------------------------------------------------


def test_full_pipeline_creates_top_three_labs(db, pipeline, patch_feed, patch_ai):
    from app.models.threat_intel import ThreatCandidateStatus, ThreatFeedRunStatus

    patch_feed(FakeFeed(factories.bulk_feed(100)))
    result = run(pipeline.run(db, trigger="manual"))

    assert result.status in (ThreatFeedRunStatus.completed, ThreatFeedRunStatus.partial)
    assert result.articles_processed >= 90
    assert result.unique_threats_identified >= 3
    assert result.threats_selected == 3
    assert result.labs_created == 3

    scenarios = _labs(db)
    assert len(scenarios) == 3
    for scenario in scenarios:
        assert scenario.status == "published"
        assert scenario.auto_generated is True
        assert scenario.threat_score and 0 < scenario.threat_score <= 10
        assert scenario.threat_rank in (1, 2, 3)
        assert scenario.threat_fingerprint
        assert scenario.threat_feed_run_id == result.id
        assert scenario.source_url
        assert scenario.mitre_techniques

    from app.models.threat_intel import ThreatCandidate

    created = db.query(ThreatCandidate).filter(
        ThreatCandidate.status == ThreatCandidateStatus.lab_created
    ).all()
    assert len(created) == 3


def test_generated_lab_has_real_investigation_content(db, pipeline, patch_feed, patch_ai):
    from app.models.alert import Alert
    from app.models.event import ScenarioEvent
    from app.models.indicator import Indicator
    from app.models.question import Question

    patch_feed(FakeFeed(factories.ZERO_DAY_CVE))
    run(pipeline.run(db, trigger="manual"))

    scenario = _labs(db)[0]
    assert db.query(Question).filter(Question.scenario_id == scenario.id).count() >= 1
    assert db.query(ScenarioEvent).filter(ScenarioEvent.scenario_id == scenario.id).count() >= 1
    assert db.query(Alert).filter(Alert.scenario_id == scenario.id).count() >= 1
    assert db.query(Indicator).filter(Indicator.scenario_id == scenario.id).count() >= 1
    assert scenario.summary


# -- Scenario B: many articles, one threat --------------------------------------


def test_ten_articles_one_campaign_yield_one_lab(db, pipeline, patch_feed, patch_ai):
    rows = []
    for index in range(10):
        rows.append(factories.feed_row(
            f"akira-{index}",
            f"Akira ransomware campaign update {index}",
            "Akira ransomware operators continue double extortion attacks against "
            "manufacturing firms after compromising VPN appliances.",
            source=f"Outlet{index}",
            hours_ago=1 + index * 0.5,
        ))
    patch_feed(FakeFeed(rows))
    result = run(pipeline.run(db, trigger="manual"))

    assert result.unique_threats_identified == 1
    assert result.threats_selected == 1
    assert result.labs_created == 1
    assert len(_labs(db)) == 1


# -- Scenario C: fewer than three quality threats -------------------------------


def test_only_two_quality_threats_creates_two_labs(db, pipeline, patch_feed, patch_ai):
    patch_feed(FakeFeed(factories.ZERO_DAY_CVE + factories.CLOUD_IDENTITY + factories.NOISE))
    result = run(pipeline.run(db, trigger="manual"))

    assert result.threats_selected == 2
    assert result.labs_created == 2
    assert len(_labs(db)) == 2


# -- Scenario D: AI failure on one threat ---------------------------------------


def test_ai_failure_on_one_threat_does_not_stop_the_run(db, pipeline, patch_feed, patch_ai):
    from app.models.threat_intel import ThreatCandidate, ThreatCandidateStatus

    patch_ai["fail_first"] = 1  # first generation call raises
    patch_feed(FakeFeed(factories.mixed_feed()))
    result = run(pipeline.run(db, trigger="manual"))

    # The failed threat must not stop the others.
    assert result.labs_created >= 2
    published = [s for s in _labs(db) if s.status == "published"]
    assert len(published) >= 2

    failed = db.query(ThreatCandidate).filter(
        ThreatCandidate.status == ThreatCandidateStatus.failed
    ).all()
    # The generator falls back to deterministic content on provider errors, so a
    # failure may be absorbed; when it is not, it must be recorded, not raised.
    for candidate in failed:
        assert candidate.error


def test_invalid_ai_response_does_not_publish_a_broken_lab(
    db, pipeline, patch_feed, patch_ai, monkeypatch
):
    """An AI payload with no evidence and no questions must fail validation."""
    from app.models.threat_intel import ThreatCandidate, ThreatCandidateStatus

    monkeypatch.setattr(
        "app.services.generator_service._call_provider",
        lambda prompt, db: {"summary": "", "questions": [], "events": []},
    )
    # Also neutralise the deterministic fallback so validation really is exercised.
    monkeypatch.setattr(
        "app.services.generator_service._mitre_scenario",
        lambda scenario: {"summary": "", "questions": [], "events": []},
    )
    monkeypatch.setattr(
        "app.services.generator_service._demo_scenario",
        lambda: {"summary": "", "questions": [], "events": []},
    )
    monkeypatch.setattr(
        "app.services.generator_service._ensure_required_techniques",
        lambda data, scenario: data,
    )
    patch_feed(FakeFeed(factories.ZERO_DAY_CVE))
    result = run(pipeline.run(db, trigger="manual"))

    assert result.labs_created == 0
    assert result.labs_failed == 1
    assert not [s for s in _labs(db) if s.status == "published"]
    candidate = db.query(ThreatCandidate).first()
    assert candidate.status == ThreatCandidateStatus.failed
    assert candidate.error
    assert result.errors


# -- Scenario E: scheduler runs twice -------------------------------------------


def test_second_run_creates_no_duplicate_labs(db, pipeline, patch_feed, patch_ai):
    patch_feed(FakeFeed(factories.mixed_feed()))
    first = run(pipeline.run(db, trigger="scheduled"))
    labs_after_first = len(_labs(db))
    assert labs_after_first >= 1

    second = run(pipeline.run(db, trigger="scheduled"))
    assert len(_labs(db)) == labs_after_first
    assert second.labs_created == 0


def test_concurrent_run_is_refused_while_one_is_in_flight(db, pipeline, patch_feed, patch_ai):
    from app.models.threat_intel import ThreatFeedRun, ThreatFeedRunStatus
    from app.services.threat_intel.pipeline import ThreatPipelineAlreadyRunning
    from datetime import datetime, timezone

    db.add(ThreatFeedRun(
        started_at=datetime.now(timezone.utc),
        status=ThreatFeedRunStatus.running,
        trigger="scheduled",
        errors=[],
    ))
    db.commit()
    patch_feed(FakeFeed())
    with pytest.raises(ThreatPipelineAlreadyRunning):
        run(pipeline.run(db, trigger="scheduled"))


# -- Scenario F: feed unavailable -----------------------------------------------


def test_feed_outage_fails_gracefully(db, pipeline, patch_feed, patch_ai):
    from app.models.threat_intel import ThreatFeedRunStatus
    from app.services.news_service import NewsError

    patch_feed(FakeFeed(error=NewsError("newsdata.io is unreachable")))
    result = run(pipeline.run(db, trigger="scheduled"))

    assert result.status in (ThreatFeedRunStatus.partial, ThreatFeedRunStatus.completed)
    assert result.labs_created == 0
    assert result.errors
    assert any("unreachable" in str(error.get("error", "")) for error in result.errors)
    assert _labs(db) == []


def test_missing_api_key_is_recorded_not_raised(db, pipeline, patch_feed, patch_ai):
    from app.services.news_service import NewsKeyMissing

    patch_feed(FakeFeed(error=NewsKeyMissing("No newsdata.io API key is configured.")))
    result = run(pipeline.run(db, trigger="scheduled"))
    assert result.labs_created == 0
    assert result.errors


def test_rate_limit_error_is_recorded(db, pipeline, patch_feed, patch_ai):
    from app.services.news_service import NewsError

    patch_feed(FakeFeed(error=NewsError("newsdata.io rate limit reached. Try again later.")))
    result = run(pipeline.run(db, trigger="scheduled"))
    assert result.labs_created == 0
    assert any("rate limit" in str(e.get("error", "")) for e in result.errors)


def test_malformed_feed_rows_are_skipped(db, pipeline, patch_feed, patch_ai):
    rows = [
        {"title": None, "link": None},
        {"nonsense": True},
        *factories.ZERO_DAY_CVE,
    ]
    patch_feed(FakeFeed(rows))
    result = run(pipeline.run(db, trigger="manual"))
    assert result.labs_created == 1


# -- Scenario G: manual lab already exists --------------------------------------


def test_existing_manual_lab_prevents_a_duplicate_auto_lab(
    db, pipeline, patch_feed, patch_ai, admin_user
):
    from app.models.scenario import Scenario
    from app.models.threat_intel import ThreatCandidate, ThreatCandidateStatus

    manual = Scenario(
        title="Manually created lab from the same article",
        description="Created by an administrator from the Threat Feed.",
        status="published",
        created_by=admin_user.id,
        created_from_ai=True,
        source_url=factories.ZERO_DAY_CVE[0]["link"],
        mitre_techniques=[],
        iocs=[],
    )
    db.add(manual)
    db.commit()

    patch_feed(FakeFeed(factories.ZERO_DAY_CVE))
    result = run(pipeline.run(db, trigger="manual"))

    assert result.labs_created == 0
    assert _labs(db) == []
    candidate = db.query(ThreatCandidate).first()
    assert candidate.status == ThreatCandidateStatus.duplicate
    assert candidate.scenario_id == manual.id
    # The manual lab is untouched.
    db.refresh(manual)
    assert manual.status == "published"
    assert manual.auto_generated is False


# -- retry ----------------------------------------------------------------------


def test_failed_candidate_can_be_retried(db, pipeline, patch_feed, patch_ai, monkeypatch):
    from app.models.threat_intel import ThreatCandidate, ThreatCandidateStatus
    from app.services.threat_intel.pipeline import retry_candidate

    broken = {"summary": "", "questions": [], "events": []}
    monkeypatch.setattr("app.services.generator_service._call_provider", lambda p, d: broken)
    monkeypatch.setattr("app.services.generator_service._mitre_scenario", lambda s: broken)
    monkeypatch.setattr("app.services.generator_service._demo_scenario", lambda: broken)
    monkeypatch.setattr(
        "app.services.generator_service._ensure_required_techniques", lambda data, s: data
    )
    patch_feed(FakeFeed(factories.ZERO_DAY_CVE))
    run(pipeline.run(db, trigger="manual"))

    candidate = db.query(ThreatCandidate).first()
    assert candidate.status == ThreatCandidateStatus.failed

    # Restore a healthy AI response and retry just that threat.
    monkeypatch.setattr(
        "app.services.generator_service._call_provider",
        lambda p, d: factories.ai_scenario_payload(),
    )
    retried = retry_candidate(db, candidate, triggered_by=None, service=pipeline)
    assert retried.status == ThreatCandidateStatus.lab_created
    assert retried.scenario_id
    assert len([s for s in _labs(db) if s.status == "published"]) == 1


# -- run bookkeeping ------------------------------------------------------------


def test_run_records_full_statistics(db, pipeline, patch_feed, patch_ai):
    patch_feed(FakeFeed(factories.bulk_feed(60)))
    result = run(pipeline.run(db, trigger="manual", triggered_by=None))

    assert result.started_at and result.completed_at
    assert result.trigger == "manual"
    assert result.articles_processed > 0
    assert result.unique_threats_identified > 0
    assert result.threats_selected <= 3
    assert isinstance(result.errors, list)


def test_pipeline_disabled_raises(db, pipeline, patch_feed, monkeypatch):
    from app.services.threat_intel.pipeline import ThreatPipelineDisabled

    monkeypatch.setattr(
        "app.services.threat_intel.pipeline.settings.AUTOMATED_THREAT_LABS_ENABLED", False
    )
    with pytest.raises(ThreatPipelineDisabled):
        run(pipeline.run(db))


def test_generation_limit_is_configurable(db, patch_feed, patch_ai, monkeypatch):
    from app.services.threat_intel.pipeline import ThreatPipelineService
    from app.services.threat_intel.ranker import ThreatRanker

    class _Same:
        def __call__(self, *a, **k):
            return _NonClosing(db)

    class _NonClosing:
        def __init__(self, s):
            self._s = s

        def __getattr__(self, item):
            return getattr(self._s, item)

        def close(self):
            return None

    monkeypatch.setattr("app.services.generator_service.SessionLocal", _Same())
    patch_feed(FakeFeed(factories.bulk_feed(60)))
    service = ThreatPipelineService(ranker=ThreatRanker(limit=1, min_score=0.0))
    result = run(service.run(db, trigger="manual"))
    assert result.threats_selected == 1
    assert result.labs_created == 1
