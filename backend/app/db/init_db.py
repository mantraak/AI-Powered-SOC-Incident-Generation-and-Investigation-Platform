from app.db.base import Base
from app.models.user import User
from app.models.scenario import Scenario
from app.models.event import ScenarioEvent
from app.models.artifact import ScenarioArtifact
from app.models.indicator import Indicator
from app.models.alert import Alert
from app.models.question import Question
from app.models.player_answer import PlayerAnswer
from app.models.containment import ContainmentAction
from app.models.score import PlayerScore
from app.models.lab import PlayerLab
from app.models.ai_setting import AISetting
from app.models.traffic import ScenarioTraffic
from app.models.trace import ScenarioTrace
from app.models.lab_workspace import LabWorkspace
from app.models.news_setting import NewsSetting
from app.models.threat_intel import ThreatCandidate, ThreatFeedRun
from app.models.collaboration import (
    LabGroup,
    LabGroupMember,
    LabInvitation,
    LabTask,
    SharedNote,
    SharedNoteHistory,
    LabMessage,
    ActivityLogEntry,
    Presence,
    PersonalProgress,
    SharedEvidence,
)


# ---------------------------------------------------------------------------
# Schema management
#
# The SQLAlchemy models above are the single source of truth for the schema.
# This replaces the former Alembic migration chain (baseline, news settings,
# AI draft source, threat-intel pipeline): a fresh database is built from the
# models, and an older database is brought up to date by adding whatever tables,
# columns, indexes and foreign keys it is missing. Changes are strictly
# additive - nothing is altered or dropped, so existing data is never touched.
# The original migration files remain in git history (commit 36a01ec).
# ---------------------------------------------------------------------------
import logging

from sqlalchemy import Enum, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn

logger = logging.getLogger(__name__)


def _add_missing_columns(engine: Engine) -> None:
    """Add columns/indexes/foreign keys that the models define but the DB lacks."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    preparer = engine.dialect.identifier_preparer

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # brand-new table: create_all() already built it in full
            present = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                if isinstance(column.type, Enum):
                    column.type.create(conn, checkfirst=True)
                ddl = str(CreateColumn(column).compile(dialect=engine.dialect))
                if not column.nullable and column.server_default is None:
                    # Existing rows cannot satisfy NOT NULL without a default.
                    ddl = ddl.replace(" NOT NULL", "")
                conn.exec_driver_sql(f"ALTER TABLE {preparer.format_table(table)} ADD COLUMN {ddl}")
                logger.info("Added missing column %s.%s", table.name, column.name)
                if engine.dialect.name == "postgresql":
                    for fk in list(column.foreign_keys):
                        target = fk.column
                        on_delete = f" ON DELETE {fk.ondelete}" if fk.ondelete else ""
                        conn.exec_driver_sql(
                            f"ALTER TABLE {preparer.format_table(table)} "
                            f"ADD CONSTRAINT {preparer.quote(f'fk_{table.name}_{column.name}')} "
                            f"FOREIGN KEY ({preparer.quote(column.name)}) "
                            f"REFERENCES {preparer.format_table(target.table)} ({preparer.quote(target.name)})"
                            f"{on_delete}"
                        )
            for index in table.indexes:
                index.create(conn, checkfirst=True)


def init_db(engine: Engine) -> None:
    """Create any missing tables and bring older databases up to the current schema."""
    Base.metadata.create_all(bind=engine)
    _add_missing_columns(engine)
