"""
Collaborative SOC Lab models.

These models layer a "shared room" concept on top of the existing single-analyst
`PlayerLab`. A `LabGroup` wraps one `Scenario` and links together the individual
`PlayerLab` rows (one per member) that already carry personal progress, notes,
answers and scores. Nothing here modifies existing tables - it only adds new
ones and new foreign keys pointing at `users`, `scenarios`, `player_labs` and
the scenario evidence tables (`indicators`, `scenario_events`, `scenario_artifacts`).

Existing single-user labs are completely unaffected: a `PlayerLab` with no
`LabGroupMember` pointing at it behaves exactly as it does today.

Cascade policy (enforced at the DB level via `ondelete=`, not just in the ORM,
so it holds even for raw SQL / admin tooling):
  - Deleting a LabGroup removes every child row below (memberships,
    invitations, tasks, notes + history, chat, activity, presence, personal
    progress, shared evidence) - `ondelete="CASCADE"` on every `group_id` FK.
  - Deleting a User removes rows that only make sense per-user
    (membership, invitation, presence, personal progress, shared evidence
    ownership) via `ondelete="CASCADE"`, and *detaches* (keeps, sets NULL)
    content that belongs to the team rather than the individual - shared
    notes, chat messages, task authorship/assignment, activity log
    attribution - via `ondelete="SET NULL"`. This is what "no orphan
    records, no IntegrityError, no destroyed team history" means in
    practice.
"""
import enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    DateTime,
    Enum,
    JSON,
    UniqueConstraint,
    Float,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base, TimestampMixin


class LabGroupStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class LabGroupRole(str, enum.Enum):
    # "owner" is kept only so pre-existing rows created before the admin-only
    # lockdown still deserialize cleanly. It is no longer assigned to new
    # members and grants no special permissions - see collaboration_service.
    owner = "owner"
    lead_analyst = "lead_analyst"
    analyst = "analyst"
    observer = "observer"


class InvitationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class PresenceStatus(str, enum.Enum):
    online = "online"
    idle = "idle"
    away = "away"
    offline = "offline"


class EvidenceType(str, enum.Enum):
    ioc = "ioc"
    event = "event"
    artifact = "artifact"
    custom = "custom"


class EvidenceVisibility(str, enum.Enum):
    lab = "lab"  # visible to every assigned member of the lab (only mode today)


# --------------------------------------------------------------------------- #
# Core group / membership
# --------------------------------------------------------------------------- #
class LabGroup(TimestampMixin, Base):
    """A collaborative room wrapping a single scenario for multiple analysts.

    Created and administered by Admins only (see collaboration_service /
    lab_groups endpoints) - analysts can only view labs they are assigned to.
    """

    __tablename__ = "lab_groups"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    status = Column(Enum(LabGroupStatus), default=LabGroupStatus.open, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    scenario = relationship("Scenario")
    members = relationship("LabGroupMember", back_populates="group", cascade="all, delete-orphan")
    invitations = relationship("LabInvitation", back_populates="group", cascade="all, delete-orphan")
    tasks = relationship("LabTask", back_populates="group", cascade="all, delete-orphan")
    notes = relationship("SharedNote", back_populates="group", cascade="all, delete-orphan")
    messages = relationship("LabMessage", back_populates="group", cascade="all, delete-orphan")
    activity = relationship("ActivityLogEntry", back_populates="group", cascade="all, delete-orphan")
    presences = relationship("Presence", back_populates="group", cascade="all, delete-orphan")
    personal_progress = relationship("PersonalProgress", back_populates="group", cascade="all, delete-orphan")
    shared_evidence = relationship("SharedEvidence", back_populates="group", cascade="all, delete-orphan")


class LabGroupMember(TimestampMixin, Base):
    __tablename__ = "lab_group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_lab_group_member"),)

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # The member's own PlayerLab for this group's scenario - reused as-is for
    # personal notes / answers / score, so nothing about grading is duplicated.
    player_lab_id = Column(Integer, ForeignKey("player_labs.id", ondelete="SET NULL"), nullable=True)
    role = Column(Enum(LabGroupRole), default=LabGroupRole.analyst, nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    group = relationship("LabGroup", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])
    player_lab = relationship("PlayerLab")


class LabInvitation(TimestampMixin, Base):
    __tablename__ = "lab_invitations"

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    role = Column(Enum(LabGroupRole), default=LabGroupRole.analyst, nullable=False)
    status = Column(Enum(InvitationStatus), default=InvitationStatus.pending, nullable=False)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    group = relationship("LabGroup", back_populates="invitations")
    invited_user = relationship("User", foreign_keys=[invited_user_id])


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
class LabTask(TimestampMixin, Base):
    __tablename__ = "lab_tasks"

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    mitre_id = Column(String, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.pending, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    group = relationship("LabGroup", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to])


# --------------------------------------------------------------------------- #
# Shared notes (with optimistic locking + edit history)
# --------------------------------------------------------------------------- #
class SharedNote(TimestampMixin, Base):
    __tablename__ = "shared_notes"

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String, default="Untitled note", nullable=False)
    content = Column(Text, default="", nullable=False)
    version = Column(Integer, default=1, nullable=False)

    # Optimistic "someone is editing this" lock. Not a hard DB lock - the
    # frontend uses it to show "Currently being edited by X" and the API
    # rejects writes with a stale `version` (see collaboration_service).
    locked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)

    group = relationship("LabGroup", back_populates="notes")
    author = relationship("User", foreign_keys=[author_id])
    history = relationship("SharedNoteHistory", back_populates="note", cascade="all, delete-orphan")


class SharedNoteHistory(TimestampMixin, Base):
    __tablename__ = "shared_note_history"

    note_id = Column(Integer, ForeignKey("shared_notes.id", ondelete="CASCADE"), nullable=False, index=True)
    editor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    version = Column(Integer, nullable=False)

    note = relationship("SharedNote", back_populates="history")
    editor = relationship("User", foreign_keys=[editor_id])


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #
class LabMessage(TimestampMixin, Base):
    __tablename__ = "lab_messages"

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    mentions = Column(JSON, default=list)  # list[int] user ids parsed from @mentions

    group = relationship("LabGroup", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


# --------------------------------------------------------------------------- #
# Activity feed
# --------------------------------------------------------------------------- #
class ActivityLogEntry(TimestampMixin, Base):
    __tablename__ = "lab_activity_log"

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String, nullable=False)  # e.g. member_joined, note_added, task_completed
    description = Column(String, nullable=False)
    meta = Column(JSON, default=dict)

    group = relationship("LabGroup", back_populates="activity")
    user = relationship("User", foreign_keys=[user_id])


# --------------------------------------------------------------------------- #
# Presence
# --------------------------------------------------------------------------- #
class Presence(TimestampMixin, Base):
    __tablename__ = "lab_presence"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_lab_presence"),)

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(Enum(PresenceStatus), default=PresenceStatus.offline, nullable=False)
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    group = relationship("LabGroup", back_populates="presences")
    user = relationship("User", foreign_keys=[user_id])


# --------------------------------------------------------------------------- #
# Personal progress specific to collaborative labs (bookmarks / evidence seen /
# time spent). Answers, notes-per-player and score continue to live on the
# existing PlayerLab / PlayerAnswer / PlayerScore models. Fully private to
# each analyst - never merged with a teammate's progress.
# --------------------------------------------------------------------------- #
class PersonalProgress(TimestampMixin, Base):
    __tablename__ = "lab_personal_progress"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_lab_personal_progress"),)

    group_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    bookmarks = Column(JSON, default=list)          # list of evidence refs, e.g. ["ioc:12", "event:44"]
    evidence_viewed = Column(JSON, default=list)     # list of evidence refs opened at least once
    completed_tasks = Column(Integer, default=0)
    questions_solved = Column(Integer, default=0)
    time_spent_seconds = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)

    group = relationship("LabGroup", back_populates="personal_progress")
    user = relationship("User", foreign_keys=[user_id])


# --------------------------------------------------------------------------- #
# Shared evidence - an analyst explicitly promotes something they found
# (an IOC / event / artifact from the scenario, or a free-form note) into a
# lab-wide "Shared Evidence" section. Nothing is shared automatically.
# --------------------------------------------------------------------------- #
class SharedEvidence(TimestampMixin, Base):
    __tablename__ = "shared_evidence"

    lab_id = Column(Integer, ForeignKey("lab_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    investigation_id = Column(Integer, ForeignKey("player_labs.id", ondelete="SET NULL"), nullable=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    evidence_type = Column(Enum(EvidenceType), nullable=False, default=EvidenceType.custom)
    # Points at indicators.id / scenario_events.id / scenario_artifacts.id depending
    # on evidence_type. Left null for evidence_type == "custom". Intentionally not a
    # DB foreign key since it targets one of three different tables.
    evidence_ref_id = Column(Integer, nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)
    related_ioc = Column(String, nullable=True)
    related_mitre_technique = Column(String, nullable=True)

    visibility = Column(Enum(EvidenceVisibility), default=EvidenceVisibility.lab, nullable=False)
    shared_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("LabGroup", back_populates="shared_evidence")
    owner = relationship("User", foreign_keys=[owner_id])
    investigation = relationship("PlayerLab")
