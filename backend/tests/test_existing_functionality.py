"""Regression tests for functionality that existed before this feature.

None of these tests know anything about the threat pipeline: they exist purely
to prove that authentication, the threat feed, manual lab creation, scenarios,
labs, investigation, scoring and admin management still behave as before.
"""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers


# -- authentication --------------------------------------------------------------


def test_login_logout_and_me(client, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "admin@test.local", "password": "Admin@1234"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]

    me = client.get("/api/v1/auth/profile", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "admin@test.local"
    assert me.json()["role"] == "admin"


def test_login_rejects_bad_credentials(client, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "admin@test.local", "password": "wrong"},
    )
    assert response.status_code == 401


def test_invalid_token_is_rejected(client):
    response = client.get("/api/v1/auth/profile", headers={"Authorization": "Bearer nonsense"})
    assert response.status_code == 401


def test_role_based_access_is_unchanged(client, player_user, admin_user):
    assert client.get("/api/v1/scenarios/", headers=auth_headers(player_user)).status_code == 403
    assert client.get("/api/v1/scenarios/", headers=auth_headers(admin_user)).status_code == 200
    assert client.get("/api/v1/users/", headers=auth_headers(player_user)).status_code == 403
    assert client.get("/api/v1/users/", headers=auth_headers(admin_user)).status_code == 200


def test_registration_still_works(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "new.analyst@test.local",
        "password": "Analyst@1234",
        "full_name": "New Analyst",
    })
    assert response.status_code in (200, 201)


# -- threat feed (existing) --------------------------------------------------------


def test_existing_news_feed_endpoint_still_works(client, player_user, monkeypatch):
    async def fake_fetch(db, query=None, page=None):
        return {
            "query": query or "cybersecurity",
            "articles": [{
                "id": "a1", "title": "Existing feed article",
                "link": "https://news.test/a1", "description": "desc",
                "published_at": "2026-08-07 10:00:00", "source": "TestWire",
                "image_url": None, "categories": ["technology"],
            }],
            "next_page": None, "total_results": 1, "cached": False,
        }

    monkeypatch.setattr("app.api.v1.endpoints.news.fetch_latest_news", fake_fetch)
    response = client.get("/api/v1/news/latest", headers=auth_headers(player_user))
    assert response.status_code == 200
    assert response.json()["articles"][0]["title"] == "Existing feed article"


def test_news_feed_filtering_by_query_still_works(client, player_user, monkeypatch):
    seen = {}

    async def fake_fetch(db, query=None, page=None):
        seen["query"] = query
        return {"query": query, "articles": [], "next_page": None,
                "total_results": 0, "cached": False}

    monkeypatch.setattr("app.api.v1.endpoints.news.fetch_latest_news", fake_fetch)
    client.get("/api/v1/news/latest?q=ransomware", headers=auth_headers(player_user))
    assert seen["query"] == "ransomware"


def test_news_settings_remain_admin_only(client, player_user, admin_user):
    assert client.get("/api/v1/news/settings", headers=auth_headers(player_user)).status_code == 403
    assert client.get("/api/v1/news/settings", headers=auth_headers(admin_user)).status_code == 200


# -- manual lab creation (existing workflow) ---------------------------------------


def test_manual_draft_lab_creation_from_article_still_works(client, admin_user):
    headers = auth_headers(admin_user)
    response = client.post("/api/v1/scenarios/from-source", headers=headers, json={
        "title": "Manual lab from Threat Feed article",
        "description": "Created by an administrator",
        "source_url": "https://news.test/manual-1",
        "source_title": "TestWire",
        "source_article": "Article body",
        "mitre_techniques": ["T1190"],
    })
    assert response.status_code == 201
    scenario = response.json()
    assert scenario["created_from_ai"] is True
    assert scenario["status"] == "draft"
    # The new provenance columns default to "not automated" for manual labs.
    assert scenario["auto_generated"] is False
    assert scenario["threat_score"] is None

    conflict = client.post("/api/v1/scenarios/from-source", headers=headers, json={
        "title": "Duplicate attempt",
        "source_url": "https://news.test/manual-1",
    })
    assert conflict.status_code == 409

    forced = client.post("/api/v1/scenarios/from-source", headers=headers, json={
        "title": "Second version",
        "source_url": "https://news.test/manual-1",
        "force_new_version": True,
    })
    assert forced.status_code == 201
    assert forced.json()["draft_version"] == 2

    check = client.get(
        "/api/v1/scenarios/check-source?source_url=https://news.test/manual-1", headers=headers
    )
    assert check.status_code == 200
    assert check.json()["existing_scenario_id"]


def test_ai_drafts_list_still_returns_manual_drafts(client, admin_user):
    headers = auth_headers(admin_user)
    client.post("/api/v1/scenarios/from-source", headers=headers, json={
        "title": "Draft for listing", "source_url": "https://news.test/list-1",
    })
    drafts = client.get("/api/v1/scenarios/drafts", headers=headers).json()
    assert any(draft["title"] == "Draft for listing" for draft in drafts)


# -- scenarios ---------------------------------------------------------------------


def test_scenario_crud_and_publishing_still_work(client, admin_user, db):
    headers = auth_headers(admin_user)
    created = client.post("/api/v1/scenarios/", headers=headers, json={
        "title": "Manually authored scenario",
        "description": "Hand written",
        "mitre_techniques": ["T1190"],
        "iocs": ["1.2.3.4"],
        "difficulty": "beginner",
        "num_questions": 5,
    })
    assert created.status_code == 201
    scenario_id = created.json()["id"]

    updated = client.put(f"/api/v1/scenarios/{scenario_id}", headers=headers, json={
        "title": "Renamed scenario",
    })
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed scenario"

    from app.models.scenario import Scenario

    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    scenario.status = "ready"
    db.commit()

    assert client.post(f"/api/v1/scenarios/{scenario_id}/publish", headers=headers).status_code == 200
    db.refresh(scenario)
    assert scenario.status == "published"

    published = client.get("/api/v1/scenarios/published", headers=headers).json()
    assert any(item["id"] == scenario_id for item in published)

    assert client.delete(f"/api/v1/scenarios/{scenario_id}", headers=headers).status_code == 204


def test_invalid_mitre_ids_are_still_rejected(client, admin_user):
    response = client.post("/api/v1/scenarios/", headers=auth_headers(admin_user), json={
        "title": "Bad techniques", "mitre_techniques": ["T9999"],
    })
    assert response.status_code == 422


# -- labs / investigation / scoring -------------------------------------------------


@pytest.fixture
def published_scenario(db, admin_user):
    from app.models.question import Question
    from app.models.scenario import Scenario

    scenario = Scenario(
        title="Existing published scenario",
        description="Pre-existing lab content",
        status="published",
        created_by=admin_user.id,
        mitre_techniques=["T1190"],
        iocs=[],
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    db.add(Question(
        scenario_id=scenario.id, order=1, question_text="What happened?",
        question_type="text", choices=[], correct_answer="exploitation",
        required_keywords=["exploitation"], points=10,
    ))
    db.commit()
    return scenario


def test_admin_assignment_and_player_investigation_still_work(
    client, admin_user, player_user, published_scenario, db
):
    admin_headers = auth_headers(admin_user)
    player_headers = auth_headers(player_user)

    assigned = client.post("/api/v1/labs/assign", headers=admin_headers, json={
        "player_id": player_user.id, "scenario_id": published_scenario.id,
    })
    assert assigned.status_code == 201
    lab_id = assigned.json()["id"]

    duplicate = client.post("/api/v1/labs/assign", headers=admin_headers, json={
        "player_id": player_user.id, "scenario_id": published_scenario.id,
    })
    assert duplicate.status_code == 400

    assert client.get("/api/v1/labs/my", headers=player_headers).json()[0]["id"] == lab_id
    assert client.get(f"/api/v1/labs/{lab_id}", headers=player_headers).status_code == 200
    assert client.post(f"/api/v1/labs/{lab_id}/start", headers=player_headers).status_code == 200

    from app.models.question import Question

    question = db.query(Question).filter(Question.scenario_id == published_scenario.id).first()
    answer = client.post(f"/api/v1/labs/{lab_id}/answer", headers=player_headers, json={
        "question_id": question.id, "lab_id": lab_id, "answer_text": "exploitation of the gateway",
    })
    assert answer.status_code == 200
    assert answer.json()["is_correct"] is True

    submitted = client.post(f"/api/v1/labs/{lab_id}/submit", headers=player_headers)
    assert submitted.status_code == 200
    assert submitted.json()["grade"] == "A"

    score = client.get(f"/api/v1/labs/{lab_id}/score", headers=player_headers)
    assert score.status_code == 200
    assert score.json()["total_score"] == 10

    assert client.get("/api/v1/labs/all", headers=admin_headers).status_code == 200
    assert client.post(f"/api/v1/labs/{lab_id}/reset", headers=admin_headers).status_code == 200
    assert client.delete(f"/api/v1/labs/{lab_id}", headers=admin_headers).status_code == 200


def test_players_cannot_read_other_players_labs(client, admin_user, player_user, db,
                                                published_scenario):
    from app.core.security import get_password_hash
    from app.models.lab import PlayerLab
    from app.models.user import User

    other = User(
        email="other@test.local", full_name="Other", role="player", is_active=True,
        hashed_password=get_password_hash("Other@1234"),
    )
    db.add(other)
    db.commit()
    lab = PlayerLab(player_id=other.id, scenario_id=published_scenario.id)
    db.add(lab)
    db.commit()
    db.refresh(lab)

    response = client.get(f"/api/v1/labs/{lab.id}", headers=auth_headers(player_user))
    assert response.status_code == 403


def test_scenario_visibility_rules_are_unchanged(client, player_user, published_scenario):
    """A player may only read a scenario that is assigned to them."""
    response = client.get(
        f"/api/v1/scenarios/{published_scenario.id}", headers=auth_headers(player_user)
    )
    assert response.status_code == 403


# -- admin management ---------------------------------------------------------------


def test_user_management_still_works(client, admin_user):
    headers = auth_headers(admin_user)
    created = client.post("/api/v1/users/", headers=headers, json={
        "email": "managed@test.local", "password": "Managed@1234",
        "full_name": "Managed User", "role": "player",
    })
    assert created.status_code in (200, 201)
    users = client.get("/api/v1/users/", headers=headers).json()
    assert any(user["email"] == "managed@test.local" for user in users)


def test_mitre_endpoints_still_work(client, admin_user):
    headers = auth_headers(admin_user)
    assert client.get("/api/v1/mitre/techniques", headers=headers).status_code == 200


def test_health_endpoint_still_works(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_existing_routes_are_all_still_registered(client):
    paths = set(client.get('/openapi.json').json()['paths'])
    paths.update(getattr(route, 'path', '') for route in client.app.routes)
    for expected in (
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/profile",
        "/api/v1/scenarios/",
        "/api/v1/scenarios/from-source",
        "/api/v1/labs/assign",
        "/api/v1/labs/my",
        "/api/v1/news/latest",
        "/api/v1/news/settings",
        "/api/v1/investigation/scenarios/{scenario_id}/events",
        "/api/v1/mitre/techniques",
        "/api/v1/lab-groups/my",
        "/api/v1/assistant/player/chat",
        "/api/v1/assistant/admin/chat",
        "/api/v1/ai-settings/",
        "/api/v1/tools/",
        "/api/v1/moderator/analyze",
        "/health",
    ):
        assert expected in paths, f"existing route disappeared: {expected}"
