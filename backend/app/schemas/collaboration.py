from datetime import datetime
from typing import Optional, List, Any, Dict

from pydantic import BaseModel


# --------------------------------------------------------------------------- #
# Groups & members
# --------------------------------------------------------------------------- #
class LabGroupCreate(BaseModel):
    scenario_id: int
    name: str


class LabGroupUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None  # "open" | "closed"


class LabGroupOut(BaseModel):
    id: int
    scenario_id: int
    name: str
    status: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class MemberOut(BaseModel):
    id: int
    group_id: int
    user_id: int
    user_full_name: Optional[str] = None
    user_email: Optional[str] = None
    player_lab_id: Optional[int] = None
    role: str
    joined_at: datetime
    invited_by: Optional[int] = None

    class Config:
        from_attributes = True


class MemberRoleUpdate(BaseModel):
    role: str


# --------------------------------------------------------------------------- #
# Invitations
# --------------------------------------------------------------------------- #
class InviteCreate(BaseModel):
    user_id: int
    role: str = "analyst"


class AssignMemberCreate(BaseModel):
    """Direct add - no accept/decline round trip. Admin-only."""
    user_id: int
    role: str = "analyst"


class InvitationOut(BaseModel):
    id: int
    group_id: int
    invited_user_id: int
    invited_by: int
    role: str
    status: str
    created_at: datetime
    responded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InvitationRespond(BaseModel):
    accept: bool


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    mitre_id: Optional[str] = None
    assigned_to: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    status: Optional[str] = None


class TaskOut(BaseModel):
    id: int
    group_id: int
    title: str
    description: Optional[str]
    mitre_id: Optional[str]
    assigned_to: Optional[int]
    created_by: int
    status: str
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Shared notes
# --------------------------------------------------------------------------- #
class NoteCreate(BaseModel):
    title: str = "Untitled note"
    content: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: str
    expected_version: int  # optimistic locking - must match current version


class NoteLockAction(BaseModel):
    action: str  # "lock" | "unlock"


class NoteHistoryOut(BaseModel):
    id: int
    editor_id: int
    content: str
    version: int
    created_at: datetime

    class Config:
        from_attributes = True


class NoteOut(BaseModel):
    id: int
    group_id: int
    author_id: int
    title: str
    content: str
    version: int
    locked_by: Optional[int]
    locked_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #
class MessageCreate(BaseModel):
    content: str


class MessageOut(BaseModel):
    id: int
    group_id: int
    sender_id: int
    content: str
    mentions: List[int] = []
    created_at: datetime

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Activity
# --------------------------------------------------------------------------- #
class ActivityOut(BaseModel):
    id: int
    group_id: int
    user_id: Optional[int]
    action_type: str
    description: str
    meta: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Presence
# --------------------------------------------------------------------------- #
class PresenceOut(BaseModel):
    user_id: int
    status: str
    last_seen: datetime

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Personal progress & scoreboard
# --------------------------------------------------------------------------- #
class PersonalProgressOut(BaseModel):
    user_id: int
    bookmarks: List[str] = []
    evidence_viewed: List[str] = []
    completed_tasks: int = 0
    questions_solved: int = 0
    time_spent_seconds: int = 0
    accuracy: float = 0.0

    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    add_bookmark: Optional[str] = None
    remove_bookmark: Optional[str] = None
    mark_evidence_viewed: Optional[str] = None
    add_time_spent_seconds: Optional[int] = None


class ScoreboardRow(BaseModel):
    user_id: int
    full_name: str
    role: str
    tasks_completed: int
    evidence_viewed: int
    questions_solved: int
    accuracy: float
    time_spent_seconds: int
    total_score: float


class GroupDashboardOut(BaseModel):
    group: LabGroupOut
    members: List[MemberOut]
    open_tasks: int
    completed_tasks: int
    progress_pct: float
    latest_notes: List[NoteOut]
    latest_activity: List[ActivityOut]


# --------------------------------------------------------------------------- #
# Shared evidence
# --------------------------------------------------------------------------- #
class SharedEvidenceCreate(BaseModel):
    evidence_type: str = "custom"          # ioc | event | artifact | custom
    evidence_ref_id: Optional[int] = None  # id in indicators/scenario_events/scenario_artifacts
    title: str
    description: Optional[str] = None
    source: Optional[str] = None
    related_ioc: Optional[str] = None
    related_mitre_technique: Optional[str] = None
    investigation_id: Optional[int] = None  # defaults to the sharer's own PlayerLab if omitted


class SharedEvidenceOut(BaseModel):
    id: int
    lab_id: int
    investigation_id: Optional[int]
    owner_id: int
    owner_name: Optional[str] = None
    evidence_type: str
    evidence_ref_id: Optional[int]
    title: str
    description: Optional[str]
    source: Optional[str]
    related_ioc: Optional[str]
    related_mitre_technique: Optional[str]
    visibility: str
    shared_at: datetime

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Admin panel - Collaborative Labs listing
# --------------------------------------------------------------------------- #
class AdminLabGroupRow(BaseModel):
    id: int
    name: str
    scenario_title: Optional[str] = None
    scenario_id: int
    owner_name: Optional[str] = None
    created_at: datetime
    status: str
    member_count: int


class AdminLabGroupList(BaseModel):
    items: List[AdminLabGroupRow]
    total: int
    page: int
    page_size: int
