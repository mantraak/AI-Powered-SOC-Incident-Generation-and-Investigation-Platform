from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ThreatLabOut(BaseModel):
    """An automatically generated threat lab as shown to students/admins."""

    scenario_id: int
    title: str
    description: Optional[str] = None
    status: str
    difficulty: str
    threat_score: Optional[float] = None
    threat_rank: Optional[int] = None
    threat_category: Optional[str] = None
    threat_severity: Optional[str] = None
    active_exploitation: bool = False
    mitre_techniques: list[str] = []
    iocs: list[str] = []
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    auto_generated_at: Optional[datetime] = None
    threat_feed_run_id: Optional[int] = None
    # Correlation / scoring provenance (from the threat candidate).
    cve_ids: list[str] = []
    article_count: int = 1
    sources: list[dict] = []
    score_explanation: list[str] = []
    # The caller's own assignment for this lab, when one exists.
    my_lab_id: Optional[int] = None
    my_lab_status: Optional[str] = None


class ThreatLabStart(BaseModel):
    lab_id: int
    scenario_id: int
    status: str
    created: bool


class ThreatCandidateOut(BaseModel):
    id: int
    fingerprint: str
    title: str
    summary: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    active_exploitation: bool = False
    threat_score: float = 0.0
    rank: Optional[int] = None
    status: str
    scenario_id: Optional[int] = None
    error: Optional[str] = None
    cve_ids: list[str] = []
    malware_names: list[str] = []
    threat_actors: list[str] = []
    affected_products: list[str] = []
    mitre_techniques: list[str] = []
    iocs: list[dict] = []
    sources: list[dict] = []
    article_count: int = 1
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    published_at: Optional[datetime] = None
    score_breakdown: dict[str, Any] = {}
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ThreatFeedRunOut(BaseModel):
    id: int
    status: str
    trigger: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    articles_processed: int = 0
    unique_threats_identified: int = 0
    threats_selected: int = 0
    labs_created: int = 0
    labs_failed: int = 0
    errors: list[dict] = []
    triggered_by: Optional[int] = None

    class Config:
        from_attributes = True


class ThreatFeedRunDetail(ThreatFeedRunOut):
    candidates: list[ThreatCandidateOut] = []


class ThreatPipelineStatus(BaseModel):
    enabled: bool
    scheduler_enabled: bool
    scheduler_running: bool
    interval_hours: int
    lookback_hours: int
    generation_limit: int
    min_score: float
    auto_publish: bool
    last_run: Optional[ThreatFeedRunOut] = None
    next_run_at: Optional[datetime] = None
    total_labs_generated: int = 0
    failed_candidates: int = 0
    news_api_key_configured: bool = False
