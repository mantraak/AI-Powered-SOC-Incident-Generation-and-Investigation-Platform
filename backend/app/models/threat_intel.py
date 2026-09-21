"""Persistence for the automated 24h Threat-Feed → SOC Lab pipeline.

Two tables are added; nothing existing is modified here:

* ``threat_feed_runs``   – one row per pipeline execution (admin visibility).
* ``threat_candidates``  – one row per *unique* correlated threat. The
  ``fingerprint`` column is globally unique, which is what makes the whole
  pipeline idempotent: re-running the job can never create a second lab for a
  threat that already produced one.
"""

import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin


class ThreatFeedRunStatus(str, enum.Enum):
    running = "running"
    completed = "completed"
    partial = "partial"
    failed = "failed"


class ThreatCandidateStatus(str, enum.Enum):
    identified = "identified"      # correlated + scored, not selected
    selected = "selected"          # in the Top-N for this run
    generating = "generating"      # scenario generation in flight
    lab_created = "lab_created"    # scenario generated, validated and published
    failed = "failed"              # generation/validation failed – retryable
    duplicate = "duplicate"        # already covered by an existing scenario/lab


class ThreatFeedRun(TimestampMixin, Base):
    """One execution of the daily threat-intelligence pipeline."""

    __tablename__ = "threat_feed_runs"

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(ThreatFeedRunStatus), default=ThreatFeedRunStatus.running, server_default="running", nullable=False)
    trigger = Column(String, default="scheduled", server_default="scheduled", nullable=False)  # scheduled | manual | startup
    articles_processed = Column(Integer, default=0, server_default="0", nullable=False)
    unique_threats_identified = Column(Integer, default=0, server_default="0", nullable=False)
    threats_selected = Column(Integer, default=0, server_default="0", nullable=False)
    labs_created = Column(Integer, default=0, server_default="0", nullable=False)
    labs_failed = Column(Integer, default=0, server_default="0", nullable=False)
    errors = Column(JSON, default=list)
    triggered_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    candidates = relationship(
        "ThreatCandidate",
        back_populates="run",
        foreign_keys="ThreatCandidate.run_id",
    )


class ThreatCandidate(TimestampMixin, Base):
    """A unique threat correlated from one or more feed articles."""

    __tablename__ = "threat_candidates"

    # Stable identity across runs – the duplicate-lab guard.
    fingerprint = Column(String(64), nullable=False, unique=True, index=True)

    run_id = Column(Integer, ForeignKey("threat_feed_runs.id"), nullable=True, index=True)
    last_seen_run_id = Column(Integer, ForeignKey("threat_feed_runs.id"), nullable=True)

    title = Column(String, nullable=False)
    summary = Column(Text)
    category = Column(String)
    severity = Column(String)
    active_exploitation = Column(Boolean, default=False, server_default=text("false"), nullable=False)

    threat_score = Column(Float, default=0.0, server_default="0", nullable=False)
    score_breakdown = Column(JSON, default=dict)
    rank = Column(Integer)

    cve_ids = Column(JSON, default=list)
    malware_names = Column(JSON, default=list)
    threat_actors = Column(JSON, default=list)
    affected_products = Column(JSON, default=list)
    iocs = Column(JSON, default=list)
    mitre_techniques = Column(JSON, default=list)

    source_url = Column(String)
    source_title = Column(String)
    sources = Column(JSON, default=list)          # [{title, url, source, published_at}]
    article_ids = Column(JSON, default=list)
    article_count = Column(Integer, default=1, server_default="1", nullable=False)
    article_text = Column(Text)
    published_at = Column(DateTime(timezone=True), nullable=True)

    status = Column(Enum(ThreatCandidateStatus), default=ThreatCandidateStatus.identified, server_default="identified", nullable=False)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True)
    error = Column(Text)
    first_seen_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    run = relationship("ThreatFeedRun", back_populates="candidates", foreign_keys=[run_id])
    scenario = relationship("Scenario", foreign_keys=[scenario_id])
