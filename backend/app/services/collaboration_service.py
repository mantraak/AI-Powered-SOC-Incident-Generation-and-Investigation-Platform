"""
Business logic + RBAC for collaborative SOC labs.

Kept separate from the FastAPI routers (app/api/v1/endpoints/lab_groups.py) so
the same rules apply whether a mutation comes in over REST or is triggered
from the websocket endpoint.

PERMISSION MODEL (admin-only lab administration):
  - Lab lifecycle (create / delete / rename / close / reopen) and membership
    management (invite, assign, remove, change role) are Admin-only. This is
    enforced here AND in the endpoint layer's dependency (get_current_admin)
    so there is no path that only checks on the frontend.
  - Task creation/editing stays with the "Lead Analyst" investigatory role
    (or Admin) - that's an investigation-workflow permission, not lab
    administration, and was explicitly preserved from the original spec.
  - Any assigned member (any role) can complete their own/assigned tasks,
    write shared notes, chat, and share their own evidence.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.lab import PlayerLab
from app.models.player_answer import PlayerAnswer
from app.models.collaboration import (
    LabGroup,
    LabGroupMember,
    LabGroupRole,
    ActivityLogEntry,
    PersonalProgress,
)

# Roles that may create/edit investigation tasks (in addition to Admins).
# NOT lab-administration - see module docstring.
TASK_LEAD_ROLES = (LabGroupRole.lead_analyst,)


# --------------------------------------------------------------------------- #
# Membership / permission helpers
# --------------------------------------------------------------------------- #
def get_group_or_404(db: Session, group_id: int) -> LabGroup:
    group = db.query(LabGroup).filter(LabGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Lab group not found")
    return group


def get_membership(db: Session, group_id: int, user_id: int) -> Optional[LabGroupMember]:
    return db.query(LabGroupMember).filter(
        LabGroupMember.group_id == group_id,
        LabGroupMember.user_id == user_id,
    ).first()


def require_member(db: Session, group_id: int, user: User) -> Optional[LabGroupMember]:
    """Admins may observe any lab; everyone else must be an assigned member."""
    membership = get_membership(db, group_id, user.id)
    if membership:
        return membership
    if user.role == "admin":
        return None  # admin oversight access, not a real membership row
    raise HTTPException(status_code=403, detail="You are not assigned to this lab")


def require_admin(user: User) -> None:
    """Lab administration (create/delete/rename/close/reopen, invite/assign/
    remove/re-role members) is Admin-only, full stop. Analysts never pass."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only an Admin can manage collaborative labs")


def require_task_lead_or_admin(db: Session, group_id: int, user: User) -> Optional[LabGroupMember]:
    """Task creation/editing: Admin or a member with the Lead Analyst role."""
    if user.role == "admin":
        return get_membership(db, group_id, user.id)
    membership = get_membership(db, group_id, user.id)
    if not membership or membership.role not in TASK_LEAD_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin or Lead Analyst can manage tasks")
    return membership


def ensure_personal_lab(db: Session, group: LabGroup, user_id: int) -> PlayerLab:
    """Give the member their own PlayerLab against the group's scenario so all
    existing personal-progress machinery (notes/answers/score/workspace) works
    unmodified for collaborative labs too. Never shared/merged across members."""
    lab = db.query(PlayerLab).filter(
        PlayerLab.player_id == user_id,
        PlayerLab.scenario_id == group.scenario_id,
    ).first()
    if not lab:
        lab = PlayerLab(player_id=user_id, scenario_id=group.scenario_id, status="assigned")
        db.add(lab)
        db.commit()
        db.refresh(lab)
    return lab


def ensure_progress_row(db: Session, group_id: int, user_id: int) -> PersonalProgress:
    row = db.query(PersonalProgress).filter(
        PersonalProgress.group_id == group_id,
        PersonalProgress.user_id == user_id,
    ).first()
    if not row:
        row = PersonalProgress(group_id=group_id, user_id=user_id, bookmarks=[], evidence_viewed=[])
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# --------------------------------------------------------------------------- #
# Activity logging
# --------------------------------------------------------------------------- #
def log_activity(db: Session, group_id: int, user_id: Optional[int], action_type: str,
                  description: str, meta: Optional[dict] = None) -> ActivityLogEntry:
    entry = ActivityLogEntry(
        group_id=group_id,
        user_id=user_id,
        action_type=action_type,
        description=description,
        meta=meta or {},
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# --------------------------------------------------------------------------- #
# Scoreboard
# --------------------------------------------------------------------------- #
def build_scoreboard(db: Session, group: LabGroup):
    rows = []
    members = db.query(LabGroupMember).filter(LabGroupMember.group_id == group.id).all()
    for m in members:
        progress = db.query(PersonalProgress).filter(
            PersonalProgress.group_id == group.id,
            PersonalProgress.user_id == m.user_id,
        ).first()
        answers = []
        total_score = 0.0
        if m.player_lab_id:
            answers = db.query(PlayerAnswer).filter(PlayerAnswer.lab_id == m.player_lab_id).all()
            total_score = sum(a.points_awarded or 0 for a in answers)
        answered = len(answers)
        correct = len([a for a in answers if a.is_correct])
        accuracy = (correct / answered * 100) if answered else 0.0
        rows.append({
            "user_id": m.user_id,
            "full_name": m.user.full_name if m.user else f"User {m.user_id}",
            "role": m.role.value if hasattr(m.role, "value") else m.role,
            "tasks_completed": progress.completed_tasks if progress else 0,
            "evidence_viewed": len(progress.evidence_viewed) if progress else 0,
            "questions_solved": answered,
            "accuracy": round(accuracy, 1),
            "time_spent_seconds": progress.time_spent_seconds if progress else 0,
            "total_score": total_score,
        })
    return rows
