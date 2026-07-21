from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class ScenarioCreate(BaseModel):
    title: str
    description: Optional[str] = None
    article_text: Optional[str] = None
    mitre_techniques: Optional[List[str]] = []
    iocs: Optional[List[str]] = []
    difficulty: Optional[str] = "intermediate"
    num_questions: Optional[int] = 10


class ScenarioUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    article_text: Optional[str] = None
    mitre_techniques: Optional[List[str]] = None
    iocs: Optional[List[str]] = None
    difficulty: Optional[str] = None
    num_questions: Optional[int] = None
    attack_steps: Optional[List[Any]] = None
    timeline: Optional[List[Any]] = None
    assets: Optional[List[Any]] = None
    summary: Optional[str] = None


class ScenarioOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    article_text: Optional[str]
    mitre_techniques: List[str]
    iocs: List[str]
    difficulty: str
    num_questions: int
    status: str
    created_by: Optional[int]
    attack_steps: Optional[List[Any]]
    timeline: Optional[List[Any]]
    assets: Optional[List[Any]]
    summary: Optional[str]
    created_at: datetime
    created_from_ai: bool = False
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_article: Optional[str] = None
    ai_prompt: Optional[str] = None
    draft_version: int = 1
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    scenario_id: int


class ScenarioFromSource(BaseModel):
    """AI Generator / Threat Feed -> Draft Lab creation payload."""

    title: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_article: Optional[str] = None
    ai_prompt: Optional[str] = None
    mitre_techniques: Optional[List[str]] = []
    iocs: Optional[List[str]] = []
    difficulty: Optional[str] = "intermediate"
    num_questions: Optional[int] = 10
    force_new_version: Optional[bool] = False


class DraftConflict(BaseModel):
    existing_scenario_id: int
    existing_title: str
    existing_status: str
    message: str = "A Draft Lab already exists for this source."
