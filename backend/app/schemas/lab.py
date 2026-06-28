from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class LabOut(BaseModel):
    id: int
    player_id: int
    scenario_id: int
    status: str
    started_at: Optional[datetime]
    submitted_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class LabAssign(BaseModel):
    player_id: int
    scenario_id: int


class AnswerSubmit(BaseModel):
    question_id: int
    lab_id: int
    answer_text: str
    attached_evidence: Optional[str] = None


class AnswerOut(BaseModel):
    id: int
    question_id: int
    lab_id: int
    answer_text: str
    is_correct: Optional[bool]
    points_awarded: float
    feedback: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ContainmentSubmit(BaseModel):
    lab_id: int
    action_type: str
    target: str


class ScoreOut(BaseModel):
    id: int
    player_id: int
    lab_id: int
    scenario_id: int
    question_score: float
    containment_score: float
    total_score: float
    max_possible: float
    grade: Optional[str]
    feedback: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
