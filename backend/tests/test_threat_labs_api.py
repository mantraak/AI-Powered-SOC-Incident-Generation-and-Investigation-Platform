"""API tests for the automated threat-lab endpoints (auth, student, admin)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from tests.conftest import auth_headers


@pytest.fixture
def auto_scenario(db, admin_user):
    from app.models.question import Question
    from app.models.scenario import Scenario
    from app.models.threat_intel import (
        ThreatCandidate,
        ThreatCandidateStatus,
        ThreatFeedRun,
        ThreatFeedRunStatus,
    )

    run = ThreatFeedRun(
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        status=ThreatFeedRunStatus.completed,
        trigger="scheduled",
        articles_processed=42,
        unique_threats_identified=7,
        threats_selected=1,
        labs_created=1,
        errors=[],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    scenario = Scenario(
        title="Enterprise Gateway Zero-Day - Exploitation Investigation",
        description="An automated threat lab generated from the daily intelligence run. " * 3,
        status="published",
        created_by=admin_user.id,
        created_from_ai=True,
        source_url="https://news.example.test/cve-1",
        source_title="TestWire",
        mitre_techniques=["T1190"],
        iocs=["185.220.101.44"],
        auto_generated=True,
        threat_score=9.4,
        threat_rank=1,
        threat_category="vulnerability",
        threat_severity="critical",
        active_exploitation=True,
        threat_fingerprint="fp-test-1",
        threat_feed_run_id=run.id,
        auto_generated_at=datetime.now(timezone.utc),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)

    db.add(Question(
        scenario_id=scenario.id, order=1, question_text="Which host was hit first?",
        question_type="text", choices=[], correct_answer="WEB-01",
        required_keywords=["web-01"], points=10,
    ))
    db.add(ThreatCandidate(
        fingerprint="fp-test-1",
        run_id=run.id,
        last_seen_run_id=run.id,
        title="Enterprise gateway zero-day",
        summary="Actively exploited RCE",
        category="vulnerability",
        severity="critical",
        active_exploitation=True,
        threat_score=9.4,
        rank=1,
        cve_ids=["CVE-2026-1234"],
        sources=[{"title": "Zero-day", "url": "https://news.example.test/cve-1"}],
        article_count=2,
        score_breakdown={"explanation": ["Active exploitation reported in the wild (+2.5)"]},
        status=ThreatCandidateStatus.lab_created,
        scenario_id=scenario.id,
    ))
    db.commit()
    return scenario


# -- authentication / authorization ---------------------------------------------


def test_threat_lab_endpoints_require_authentication(client):
    assert client.get("/api/v1/threat-labs/today").status_code == 401
    assert client.get("/api/v1/threat-labs/status").status_code == 401
    assert client.post("/api/v1/threat-labs/runs").status_code == 401


def test_admin_endpoints_reject_players(client, player_user):
    headers = auth_headers(player_user)
    assert client.get("/api/v1/threat-labs/status", headers=headers).status_code == 403
    assert client.get("/api/v1/threat-labs/runs", headers=headers).status_code == 403
    assert client.post("/api/v1/threat-labs/runs", headers=headers).status_code == 403
    assert client.get("/api/v1/threat-labs/candidates", headers=headers).status_code == 403


# -- student experience ----------------------------------------------------------


def test_student_sees_todays_threat_labs(client, player_user, auto_scenario):
    response = client.get("/api/v1/threat-labs/today", headers=auth_headers(player_user))
    assert response.status_code == 200
    labs = response.json()
    assert len(labs) == 1
    lab = labs[0]
    assert lab["scenario_id"] == auto_scenario.id
    assert lab["threat_score"] == 9.4
    assert lab["threat_rank"] == 1
    assert lab["threat_severity"] == "critical"
    assert lab["active_exploitation"] is True
    assert lab["mitre_techniques"] == ["T1190"]
    assert lab["cve_ids"] == ["CVE-2026-1234"]
    assert lab["score_explanation"]
    assert lab["my_lab_id"] is None


def test_unpublished_auto_scenarios_are_hidden_from_students(client, player_user, db, auto_scenario):
    auto_scenario.status = "draft"
    db.commit()
    response = client.get("/api/v1/threat-labs/today", headers=auth_headers(player_user))
    assert response.json() == []


def test_student_can_start_and_resume_a_threat_lab(client, player_user, auto_scenario):
    headers = auth_headers(player_user)
    first = client.post(f"/api/v1/threat-labs/{auto_scenario.id}/start", headers=headers)
    assert first.status_code == 201
    payload = first.json()
    assert payload["created"] is True
    lab_id = payload["lab_id"]

    # Idempotent: starting again returns the same lab, not a second one.
    second = client.post(f"/api/v1/threat-labs/{auto_scenario.id}/start", headers=headers)
    assert second.status_code == 201
    assert second.json()["lab_id"] == lab_id
    assert second.json()["created"] is False

    listed = client.get("/api/v1/labs/my", headers=headers).json()
    assert [lab["id"] for lab in listed] == [lab_id]

    # The lab now shows as the student's own on the threat-lab list.
    today = client.get("/api/v1/threat-labs/today", headers=headers).json()
    assert today[0]["my_lab_id"] == lab_id


def test_started_threat_lab_supports_the_existing_investigation_flow(
    client, player_user, auto_scenario, db
):
    headers = auth_headers(player_user)
    lab_id = client.post(
        f"/api/v1/threat-labs/{auto_scenario.id}/start", headers=headers
    ).json()["lab_id"]

    assert client.post(f"/api/v1/labs/{lab_id}/start", headers=headers).status_code == 200

    from app.models.question import Question

    question = db.query(Question).filter(Question.scenario_id == auto_scenario.id).first()
    answer = client.post(
        f"/api/v1/labs/{lab_id}/answer",
        headers=headers,
        json={"question_id": question.id, "lab_id": lab_id, "answer_text": "WEB-01"},
    )
    assert answer.status_code == 200
    assert answer.json()["is_correct"] is True

    submit = client.post(f"/api/v1/labs/{lab_id}/submit", headers=headers)
    assert submit.status_code == 200
    assert submit.json()["max"] == 10
    assert client.get(f"/api/v1/labs/{lab_id}/score", headers=headers).status_code == 200


def test_starting_an_unknown_or_manual_lab_is_rejected(client, player_user, db, admin_user):
    from app.models.scenario import Scenario

    manual = Scenario(
        title="Manual scenario", status="published", created_by=admin_user.id,
        mitre_techniques=[], iocs=[],
    )
    db.add(manual)
    db.commit()
    headers = auth_headers(player_user)
    assert client.post("/api/v1/threat-labs/999999/start", headers=headers).status_code == 404
    assert client.post(f"/api/v1/threat-labs/{manual.id}/start", headers=headers).status_code == 404


# -- admin visibility -------------------------------------------------------------


def test_admin_status_reports_pipeline_state(client, admin_user, auto_scenario):
    response = client.get("/api/v1/threat-labs/status", headers=auth_headers(admin_user))
    assert response.status_code == 200
    status = response.json()
    assert status["enabled"] is True
    assert status["generation_limit"] == 3
    assert status["interval_hours"] == 24
    assert status["total_labs_generated"] == 1
    assert status["last_run"]["articles_processed"] == 42
    assert status["last_run"]["labs_created"] == 1
    assert status["next_run_at"]


def test_admin_can_inspect_runs_and_candidates(client, admin_user, auto_scenario):
    headers = auth_headers(admin_user)
    runs = client.get("/api/v1/threat-labs/runs", headers=headers).json()
    assert len(runs) == 1
    run_id = runs[0]["id"]

    detail = client.get(f"/api/v1/threat-labs/runs/{run_id}", headers=headers).json()
    assert detail["unique_threats_identified"] == 7
    assert len(detail["candidates"]) == 1
    assert detail["candidates"][0]["scenario_id"] == auto_scenario.id

    labs = client.get(f"/api/v1/threat-labs/runs/{run_id}/labs", headers=headers).json()
    assert labs[0]["scenario_id"] == auto_scenario.id

    candidates = client.get("/api/v1/threat-labs/candidates", headers=headers).json()
    assert candidates[0]["fingerprint"] == "fp-test-1"

    filtered = client.get(
        "/api/v1/threat-labs/candidates?status=lab_created", headers=headers
    ).json()
    assert len(filtered) == 1
    assert client.get(
        "/api/v1/threat-labs/candidates?status=bogus", headers=headers
    ).status_code == 422


def test_unknown_run_returns_404(client, admin_user):
    assert client.get(
        "/api/v1/threat-labs/runs/424242", headers=auth_headers(admin_user)
    ).status_code == 404


def test_manual_trigger_is_rejected_while_a_run_is_in_flight(client, admin_user, db):
    from app.models.threat_intel import ThreatFeedRun, ThreatFeedRunStatus

    db.add(ThreatFeedRun(
        started_at=datetime.now(timezone.utc),
        status=ThreatFeedRunStatus.running,
        trigger="scheduled",
        errors=[],
    ))
    db.commit()
    response = client.post("/api/v1/threat-labs/runs", headers=auth_headers(admin_user))
    assert response.status_code == 409


def test_error_responses_do_not_leak_secrets(client, admin_user, db):
    """Run errors are surfaced to admins but must never contain the API key."""
    from app.models.threat_intel import ThreatFeedRun, ThreatFeedRunStatus

    db.add(ThreatFeedRun(
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        status=ThreatFeedRunStatus.partial,
        trigger="scheduled",
        errors=[{"stage": "collect", "error": "newsdata.io rate limit reached."}],
    ))
    db.commit()
    runs = client.get("/api/v1/threat-labs/runs", headers=auth_headers(admin_user)).json()
    body = str(runs)
    assert "test-news-key" not in body
    assert "apikey" not in body.lower()
