"""Shared fixtures.

Every test runs against a throwaway SQLite database so the developer's real
Postgres data is never touched. The MITRE catalogue is pointed at a tiny
fixture file so technique validation is deterministic and offline.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

TEST_TECHNIQUES = [
    "T1190", "T1059", "T1059.001", "T1105", "T1068", "T1486", "T1490", "T1078",
    "T1021", "T1204", "T1071", "T1566", "T1114", "T1550", "T1528", "T1098",
    "T1195", "T1072", "T1005", "T1041", "T1567", "T1498", "T1499", "T1583",
    "T1052", "T1133", "T1053", "T1552",
]


def _write_catalog(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({
            "metadata": {"version": "test"},
            "tactics": [{"id": "TA0001", "name": "Initial Access"}],
            "techniques": [
                {
                    "id": technique,
                    "name": f"Technique {technique}",
                    "description": "Test technique",
                    "tactics": ["initial-access"],
                    "platforms": ["Windows", "Linux"],
                    "data_sources": ["Process: Process Creation"],
                    "is_subtechnique": "." in technique,
                }
                for technique in TEST_TECHNIQUES
            ],
        }),
        encoding="utf-8",
    )


# Configure the environment before app modules import their settings.
_TMP = BACKEND_ROOT / ".pytest-tmp"
_TMP.mkdir(exist_ok=True)
_CATALOG = _TMP / "catalog.json"
_write_catalog(_CATALOG)

os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["MITRE_CATALOG_PATH"] = str(_CATALOG)
os.environ["MITRE_ATTACK_VERSION"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-0123456789"
os.environ["THREAT_LAB_SCHEDULER_ENABLED"] = "false"
os.environ["NEWSDATA_API_KEY"] = "test-news-key"


@pytest.fixture(scope="session")
def engine():
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    import app.db.init_db  # noqa: F401 - registers every model
    from app.db.base import Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db(engine):
    """A clean session; all tables truncated between tests."""
    from sqlalchemy.orm import sessionmaker

    import app.db.init_db  # noqa: F401
    from app.db.base import Base

    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        with engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.exec_driver_sql(f'DELETE FROM "{table.name}"')


@pytest.fixture
def admin_user(db):
    from app.core.security import get_password_hash
    from app.models.user import User

    user = User(
        email="admin@test.local",
        full_name="Test Admin",
        hashed_password=get_password_hash("Admin@1234"),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def player_user(db):
    from app.core.security import get_password_hash
    from app.models.user import User

    user = User(
        email="player@test.local",
        full_name="Test Player",
        hashed_password=get_password_hash("Player@1234"),
        role="player",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def client(engine, db):
    """FastAPI TestClient wired to the test session."""
    from fastapi.testclient import TestClient

    from app.db.session import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(user) -> dict:
    from app.core.security import create_access_token

    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}
