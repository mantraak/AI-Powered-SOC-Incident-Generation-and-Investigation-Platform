"""Schema management (app.db.init_db) - replaces the former Alembic migrations."""

from sqlalchemy import create_engine, inspect, text

from app.db.base import Base
from app.db.init_db import init_db
from app.models.player_answer import PlayerAnswer
from app.models.score import PlayerScore
from app.models.lab_workspace import LabWorkspace


def _engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path / 'schema.db'}")


def _columns(engine, table):
    return {c["name"] for c in inspect(engine).get_columns(table)}


def test_fresh_database_gets_every_model_table(tmp_path):
    engine = _engine(tmp_path)
    init_db(engine)
    assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())


def test_older_database_gains_missing_columns_and_keeps_data(tmp_path):
    engine = _engine(tmp_path)
    init_db(engine)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO scenarios (title, difficulty, status) VALUES ('old', 'beginner', 'draft')"))
        conn.execute(text("ALTER TABLE scenarios DROP COLUMN draft_version"))
        conn.execute(text("ALTER TABLE scenarios DROP COLUMN threat_score"))
    assert "draft_version" not in _columns(engine, "scenarios")

    init_db(engine)

    assert {"draft_version", "threat_score"} <= _columns(engine, "scenarios")
    with engine.connect() as conn:
        row = conn.execute(text("SELECT title, draft_version FROM scenarios")).one()
    assert row.title == "old"
    assert row.draft_version == 1  # server default backfills existing rows


def test_init_db_is_idempotent(tmp_path):
    engine = _engine(tmp_path)
    init_db(engine)
    init_db(engine)


def test_lab_child_tables_cascade_on_delete():
    """Deleting a user or lab must remove their answers, scores and workspace."""
    def ondelete(table, column):
        return {fk.ondelete for fk in table.c[column].foreign_keys}

    assert ondelete(PlayerAnswer.__table__, "player_id") == {"CASCADE"}
    assert ondelete(PlayerAnswer.__table__, "lab_id") == {"CASCADE"}
    assert ondelete(PlayerScore.__table__, "player_id") == {"CASCADE"}
    assert ondelete(PlayerScore.__table__, "lab_id") == {"CASCADE"}
    assert ondelete(LabWorkspace.__table__, "lab_id") == {"CASCADE"}
