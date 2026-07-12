"""
Collaborative Lab Groups API.

Mounted at /api/v1/lab-groups (see app/api/v1/api.py). Kept as a distinct
resource from the existing /labs/{lab_id} (single-analyst PlayerLab) routes so
nothing about the existing single-user flow changes - a LabGroup simply wraps
one Scenario and a set of members, each of whom gets (and keeps using) their
own PlayerLab under the hood.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import or_, func as sa_func
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.core.security import get_current_user, get_current_admin
from app.core.config import settings
from app.models.user import User
from app.models.scenario import Scenario
from app.models.lab import PlayerLab
from app.models.collaboration import (
    LabGroup,
    LabGroupMember,
    LabGroupRole,
    LabInvitation,
    InvitationStatus,
    LabTask,
    TaskStatus,
    SharedNote,
    SharedNoteHistory,
    LabMessage,
    ActivityLogEntry,
    Presence,
    PresenceStatus,
    PersonalProgress,
    SharedEvidence,
    EvidenceType,
)
from app.schemas.collaboration import (
    LabGroupCreate, LabGroupUpdate, LabGroupOut, MemberOut, MemberRoleUpdate,
    InviteCreate, AssignMemberCreate, InvitationOut, InvitationRespond,
    TaskCreate, TaskUpdate, TaskOut,
    NoteCreate, NoteUpdate, NoteOut, NoteLockAction, NoteHistoryOut,
    MessageCreate, MessageOut,
    ActivityOut, PresenceOut,
    PersonalProgressOut, ProgressUpdate, ScoreboardRow, GroupDashboardOut,
    SharedEvidenceCreate, SharedEvidenceOut, AdminLabGroupRow, AdminLabGroupList,
)
from app.services import collaboration_service as svc
from app.services.ws_manager import manager
from jose import jwt, JWTError

router = APIRouter()


def _member_out(m: LabGroupMember) -> dict:
    return {
        "id": m.id,
        "group_id": m.group_id,
        "user_id": m.user_id,
        "user_full_name": m.user.full_name if m.user else None,
        "user_email": m.user.email if m.user else None,
        "player_lab_id": m.player_lab_id,
        "role": m.role.value if hasattr(m.role, "value") else m.role,
        "joined_at": m.joined_at,
        "invited_by": m.invited_by,
    }


# --------------------------------------------------------------------------- #
# Groups
# --------------------------------------------------------------------------- #
# --------------------------------------------------------------------------- #
# Groups (Admin-only lifecycle)
# --------------------------------------------------------------------------- #
@router.post("", response_model=LabGroupOut, status_code=201)
def create_group(
    payload: LabGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Admin-only. Analysts can never create a lab (enforced via
    get_current_admin, not just hidden in the UI)."""
    scenario = db.query(Scenario).filter(
        Scenario.id == payload.scenario_id, Scenario.status == "published"
    ).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Published scenario not found")

    group = LabGroup(scenario_id=payload.scenario_id, name=payload.name, created_by=current_user.id)
    db.add(group)
    db.commit()
    db.refresh(group)

    svc.log_activity(db, group.id, current_user.id, "group_created",
                      f"{current_user.full_name} created the lab group")
    db.commit()
    return group


@router.get("/admin/list", response_model=AdminLabGroupList)
def admin_list_groups(
    search: str = "",
    status_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Admin Dashboard -> Collaborative Labs list: search, filter, pagination."""
    query = db.query(LabGroup)
    if search:
        like = f"%{search}%"
        query = query.join(Scenario, Scenario.id == LabGroup.scenario_id, isouter=True).filter(
            or_(LabGroup.name.ilike(like), Scenario.title.ilike(like))
        )
    if status_filter:
        query = query.filter(LabGroup.status == status_filter)

    total = query.count()
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    groups = query.order_by(LabGroup.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    rows = []
    for g in groups:
        owner = db.query(User).filter(User.id == g.created_by).first() if g.created_by else None
        member_count = db.query(LabGroupMember).filter(LabGroupMember.group_id == g.id).count()
        rows.append({
            "id": g.id,
            "name": g.name,
            "scenario_title": g.scenario.title if g.scenario else None,
            "scenario_id": g.scenario_id,
            "owner_name": owner.full_name if owner else None,
            "created_at": g.created_at,
            "status": g.status.value if hasattr(g.status, "value") else g.status,
            "member_count": member_count,
        })
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/my", response_model=List[LabGroupOut])
def my_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Labs the current analyst is assigned to. Admins manage labs from the
    Admin Dashboard (/lab-groups/admin/list) rather than a personal list."""
    memberships = db.query(LabGroupMember).filter(LabGroupMember.user_id == current_user.id).all()
    group_ids = [m.group_id for m in memberships]
    if not group_ids:
        return []
    return db.query(LabGroup).filter(LabGroup.id.in_(group_ids)).order_by(LabGroup.created_at.desc()).all()


@router.get("/{group_id}", response_model=LabGroupOut)
def get_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    return group


@router.get("/{group_id}/dashboard", response_model=GroupDashboardOut)
def get_dashboard(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)

    members = db.query(LabGroupMember).filter(LabGroupMember.group_id == group_id).all()
    tasks = db.query(LabTask).filter(LabTask.group_id == group_id).all()
    open_tasks = len([t for t in tasks if t.status != TaskStatus.completed])
    completed_tasks = len([t for t in tasks if t.status == TaskStatus.completed])
    progress_pct = (completed_tasks / len(tasks) * 100) if tasks else 0.0
    latest_notes = db.query(SharedNote).filter(SharedNote.group_id == group_id).order_by(
        SharedNote.updated_at.desc().nullslast()).limit(5).all()
    latest_activity = db.query(ActivityLogEntry).filter(ActivityLogEntry.group_id == group_id).order_by(
        ActivityLogEntry.created_at.desc()).limit(20).all()

    return {
        "group": group,
        "members": [_member_out(m) for m in members],
        "open_tasks": open_tasks,
        "completed_tasks": completed_tasks,
        "progress_pct": round(progress_pct, 1),
        "latest_notes": latest_notes,
        "latest_activity": latest_activity,
    }


@router.patch("/{group_id}", response_model=LabGroupOut)
def update_group(
    group_id: int, payload: LabGroupUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin),
):
    """Update lab details (name / status). Admin-only."""
    group = svc.get_group_or_404(db, group_id)
    if payload.name is not None:
        group.name = payload.name
    if payload.status is not None:
        if payload.status not in ("open", "closed"):
            raise HTTPException(status_code=400, detail="status must be 'open' or 'closed'")
        group.status = payload.status
    db.commit()
    db.refresh(group)
    svc.log_activity(db, group_id, current_user.id, "group_updated", f"{current_user.full_name} updated lab details")
    return group


@router.post("/{group_id}/close")
def close_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    group = svc.get_group_or_404(db, group_id)
    group.status = "closed"
    db.commit()
    svc.log_activity(db, group_id, current_user.id, "group_closed", f"{current_user.full_name} closed the lab")
    return {"message": "Lab group closed"}


@router.post("/{group_id}/reopen")
def reopen_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    group = svc.get_group_or_404(db, group_id)
    group.status = "open"
    db.commit()
    svc.log_activity(db, group_id, current_user.id, "group_reopened", f"{current_user.full_name} reopened the lab")
    return {"message": "Lab group reopened"}


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    """Deletes the lab and, via DB-level ON DELETE CASCADE, every member,
    invitation, task, note (+history), chat message, activity entry,
    presence row, personal-progress row and shared-evidence row under it.
    Each member's personal PlayerLab (their own investigation) is untouched -
    it simply stops being linked to a group."""
    group = svc.get_group_or_404(db, group_id)
    db.delete(group)
    db.commit()


# --------------------------------------------------------------------------- #
# Membership & invitations
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/search-users")
def search_users(
    group_id: int, q: str = "",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin),
):
    """User lookup for the Admin's invite/assign modal."""
    svc.get_group_or_404(db, group_id)

    existing_member_ids = {m.user_id for m in db.query(LabGroupMember).filter(LabGroupMember.group_id == group_id).all()}
    query = db.query(User).filter(User.is_active == True)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter((User.full_name.ilike(like)) | (User.email.ilike(like)))
    users = query.order_by(User.full_name).limit(20).all()
    return [
        {"id": u.id, "full_name": u.full_name, "email": u.email}
        for u in users if u.id not in existing_member_ids
    ]


@router.post("/{group_id}/invite", response_model=InvitationOut, status_code=201)
def invite_user(
    group_id: int, payload: InviteCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin),
):
    """Admin-only. Sends a pending invitation the user must accept/decline
    (see /invitations/{id}/respond). For an immediate, no-round-trip add use
    POST /{group_id}/members instead."""
    group = svc.get_group_or_404(db, group_id)

    invited_user = db.query(User).filter(User.id == payload.user_id).first()
    if not invited_user:
        raise HTTPException(status_code=404, detail="User not found")
    if svc.get_membership(db, group_id, payload.user_id):
        raise HTTPException(status_code=400, detail="User is already a member")
    try:
        role = LabGroupRole(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = db.query(LabInvitation).filter(
        LabInvitation.group_id == group_id,
        LabInvitation.invited_user_id == payload.user_id,
        LabInvitation.status == InvitationStatus.pending,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Invitation already pending")

    invitation = LabInvitation(
        group_id=group_id, invited_user_id=payload.user_id,
        invited_by=current_user.id, role=role,
    )
    db.add(invitation)
    svc.log_activity(db, group_id, current_user.id, "member_invited",
                      f"{current_user.full_name} invited {invited_user.full_name}")
    db.commit()
    db.refresh(invitation)
    return invitation


@router.post("/{group_id}/members", response_model=MemberOut, status_code=201)
async def assign_member(
    group_id: int, payload: AssignMemberCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin),
):
    """Admin-only direct assignment - adds the user immediately, no
    accept/decline round trip. This is what the Admin Dashboard's
    'Assign Members' action uses."""
    group = svc.get_group_or_404(db, group_id)

    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if svc.get_membership(db, group_id, payload.user_id):
        raise HTTPException(status_code=400, detail="User is already assigned to this lab")
    try:
        role = LabGroupRole(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role")

    lab = svc.ensure_personal_lab(db, group, payload.user_id)
    member = LabGroupMember(
        group_id=group_id, user_id=payload.user_id, role=role,
        player_lab_id=lab.id, invited_by=current_user.id,
    )
    db.add(member)
    svc.ensure_progress_row(db, group_id, payload.user_id)
    svc.log_activity(db, group_id, current_user.id, "member_joined",
                      f"{current_user.full_name} assigned {target.full_name} to the lab")
    db.commit()
    db.refresh(member)
    await manager.broadcast(group_id, "MemberJoined", _member_out(member))
    return _member_out(member)


@router.get("/{group_id}/invitations", response_model=List[InvitationOut])
def list_invitations(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    svc.get_group_or_404(db, group_id)
    return db.query(LabInvitation).filter(LabInvitation.group_id == group_id).order_by(
        LabInvitation.created_at.desc()).all()


@router.post("/invitations/{invitation_id}/respond", response_model=Optional[MemberOut])
async def respond_invitation(
    invitation_id: int, payload: InvitationRespond,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    invitation = db.query(LabInvitation).filter(LabInvitation.id == invitation_id).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.invited_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="This invitation is not addressed to you")
    if invitation.status != InvitationStatus.pending:
        raise HTTPException(status_code=400, detail="Invitation already resolved")

    invitation.responded_at = datetime.now(timezone.utc)
    if not payload.accept:
        invitation.status = InvitationStatus.declined
        db.commit()
        return None

    invitation.status = InvitationStatus.accepted
    group = svc.get_group_or_404(db, invitation.group_id)
    lab = svc.ensure_personal_lab(db, group, current_user.id)
    member = LabGroupMember(
        group_id=group.id, user_id=current_user.id, role=invitation.role,
        player_lab_id=lab.id, invited_by=invitation.invited_by,
    )
    db.add(member)
    svc.ensure_progress_row(db, group.id, current_user.id)
    db.commit()
    db.refresh(member)

    svc.log_activity(db, group.id, current_user.id, "member_joined", f"{current_user.full_name} joined the lab")
    await manager.broadcast(group.id, "MemberJoined", _member_out(member))
    return _member_out(member)


@router.get("/{group_id}/members", response_model=List[MemberOut])
def list_members(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    members = db.query(LabGroupMember).filter(LabGroupMember.group_id == group_id).all()
    return [_member_out(m) for m in members]


@router.patch("/{group_id}/members/{user_id}", response_model=MemberOut)
async def update_member_role(
    group_id: int, user_id: int, payload: MemberRoleUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin),
):
    svc.get_group_or_404(db, group_id)
    member = svc.get_membership(db, group_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    try:
        member.role = LabGroupRole(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role")
    db.commit()
    db.refresh(member)
    svc.log_activity(db, group_id, current_user.id, "member_role_changed",
                      f"{current_user.full_name} set {member.user.full_name}'s role to {payload.role}")
    await manager.broadcast(group_id, "MemberRoleChanged", _member_out(member))
    return _member_out(member)


@router.delete("/{group_id}/members/{user_id}")
async def remove_member(
    group_id: int, user_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin),
):
    svc.get_group_or_404(db, group_id)
    member = svc.get_membership(db, group_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    removed_name = member.user.full_name if member.user else f"User {user_id}"
    db.delete(member)
    svc.log_activity(db, group_id, current_user.id, "member_removed",
                      f"{current_user.full_name} removed {removed_name}")
    db.commit()
    await manager.broadcast(group_id, "MemberLeft", {"user_id": user_id})
    return {"message": "Member removed"}


# --------------------------------------------------------------------------- #
# Activity feed
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/activity", response_model=List[ActivityOut])
def get_activity(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    return db.query(ActivityLogEntry).filter(ActivityLogEntry.group_id == group_id).order_by(
        ActivityLogEntry.created_at.desc()).limit(200).all()


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/tasks", response_model=List[TaskOut])
def list_tasks(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    return db.query(LabTask).filter(LabTask.group_id == group_id).order_by(LabTask.created_at.desc()).all()


@router.post("/{group_id}/tasks", response_model=TaskOut, status_code=201)
async def create_task(
    group_id: int, payload: TaskCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    svc.get_group_or_404(db, group_id)
    svc.require_task_lead_or_admin(db, group_id, current_user)
    if payload.assigned_to and not svc.get_membership(db, group_id, payload.assigned_to):
        raise HTTPException(status_code=400, detail="Assignee must be a member of this lab group")

    task = LabTask(
        group_id=group_id, title=payload.title, description=payload.description,
        mitre_id=payload.mitre_id, assigned_to=payload.assigned_to, created_by=current_user.id,
    )
    db.add(task)
    svc.log_activity(db, group_id, current_user.id, "task_created", f"{current_user.full_name} created task '{payload.title}'")
    db.commit()
    db.refresh(task)
    await manager.broadcast(group_id, "TaskCreated", TaskOut.model_validate(task).model_dump(mode="json"))
    return task


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int, payload: TaskUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    task = db.query(LabTask).filter(LabTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    membership = svc.require_member(db, task.group_id, current_user)

    is_lead = current_user.role == "admin" or (membership and membership.role in svc.TASK_LEAD_ROLES)
    is_assignee = membership and membership.user_id == task.assigned_to

    if payload.title is not None or payload.description is not None or payload.assigned_to is not None:
        if not is_lead:
            raise HTTPException(status_code=403, detail="Only Owner/Lead Analyst can edit task details")
        if payload.title is not None:
            task.title = payload.title
        if payload.description is not None:
            task.description = payload.description
        if payload.assigned_to is not None:
            if not svc.get_membership(db, task.group_id, payload.assigned_to):
                raise HTTPException(status_code=400, detail="Assignee must be a member of this lab group")
            task.assigned_to = payload.assigned_to

    if payload.status is not None:
        if not (is_lead or is_assignee):
            raise HTTPException(status_code=403, detail="Only the assignee or a lead can update task status")
        try:
            task.status = TaskStatus(payload.status)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")
        if task.status == TaskStatus.completed:
            task.completed_at = datetime.now(timezone.utc)
            progress = svc.ensure_progress_row(db, task.group_id, current_user.id)
            progress.completed_tasks = (progress.completed_tasks or 0) + 1
            svc.log_activity(db, task.group_id, current_user.id, "task_completed",
                              f"{current_user.full_name} completed task '{task.title}'")

    db.commit()
    db.refresh(task)
    await manager.broadcast(task.group_id, "TaskUpdated", TaskOut.model_validate(task).model_dump(mode="json"))
    if payload.status == "completed":
        await manager.broadcast(task.group_id, "TaskCompleted", TaskOut.model_validate(task).model_dump(mode="json"))
    return task


# --------------------------------------------------------------------------- #
# Shared notes
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/notes", response_model=List[NoteOut])
def list_notes(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    return db.query(SharedNote).filter(SharedNote.group_id == group_id).order_by(
        SharedNote.updated_at.desc().nullslast()).all()


@router.post("/{group_id}/notes", response_model=NoteOut, status_code=201)
async def create_note(
    group_id: int, payload: NoteCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    note = SharedNote(group_id=group_id, author_id=current_user.id, title=payload.title, content=payload.content)
    db.add(note)
    svc.log_activity(db, group_id, current_user.id, "note_added", f"{current_user.full_name} added a shared note")
    db.commit()
    db.refresh(note)
    await manager.broadcast(group_id, "NoteUpdated", NoteOut.model_validate(note).model_dump(mode="json"))
    return note


@router.get("/notes/{note_id}/history", response_model=List[NoteHistoryOut])
def note_history(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = db.query(SharedNote).filter(SharedNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    svc.require_member(db, note.group_id, current_user)
    return db.query(SharedNoteHistory).filter(SharedNoteHistory.note_id == note_id).order_by(
        SharedNoteHistory.version.desc()).all()


@router.post("/notes/{note_id}/lock", response_model=NoteOut)
async def lock_note(
    note_id: int, payload: NoteLockAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    note = db.query(SharedNote).filter(SharedNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    svc.require_member(db, note.group_id, current_user)

    if payload.action == "lock":
        if note.locked_by and note.locked_by != current_user.id:
            raise HTTPException(status_code=409, detail="Note is currently being edited by another analyst")
        note.locked_by = current_user.id
        note.locked_at = datetime.now(timezone.utc)
    elif payload.action == "unlock":
        if note.locked_by == current_user.id or current_user.role == "admin":
            note.locked_by = None
            note.locked_at = None
    else:
        raise HTTPException(status_code=400, detail="action must be 'lock' or 'unlock'")

    db.commit()
    db.refresh(note)
    await manager.broadcast(note.group_id, "NoteLockChanged", NoteOut.model_validate(note).model_dump(mode="json"))
    return note


@router.patch("/notes/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: int, payload: NoteUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    note = db.query(SharedNote).filter(SharedNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    svc.require_member(db, note.group_id, current_user)

    if note.locked_by and note.locked_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=409, detail="Currently being edited by another analyst")
    if payload.expected_version != note.version:
        raise HTTPException(status_code=409, detail="Note was updated by someone else - reload before saving")

    history = SharedNoteHistory(note_id=note.id, editor_id=current_user.id, content=note.content, version=note.version)
    db.add(history)

    note.content = payload.content
    if payload.title is not None:
        note.title = payload.title
    note.version += 1
    note.locked_by = None
    note.locked_at = None

    svc.log_activity(db, note.group_id, current_user.id, "note_edited", f"{current_user.full_name} edited a shared note")
    db.commit()
    db.refresh(note)
    await manager.broadcast(note.group_id, "NoteUpdated", NoteOut.model_validate(note).model_dump(mode="json"))
    return note


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/chat", response_model=List[MessageOut])
def list_messages(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    return db.query(LabMessage).filter(LabMessage.group_id == group_id).order_by(
        LabMessage.created_at.asc()).limit(500).all()


@router.post("/{group_id}/chat", response_model=MessageOut, status_code=201)
async def post_message(
    group_id: int, payload: MessageCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)

    members = db.query(LabGroupMember).filter(LabGroupMember.group_id == group_id).all()
    name_to_id = {m.user.full_name: m.user_id for m in members if m.user}
    mentions = [uid for name, uid in name_to_id.items() if f"@{name}" in payload.content]

    message = LabMessage(group_id=group_id, sender_id=current_user.id, content=payload.content, mentions=mentions)
    db.add(message)
    db.commit()
    db.refresh(message)
    await manager.broadcast(group_id, "ChatMessage", MessageOut.model_validate(message).model_dump(mode="json"))
    return message


# --------------------------------------------------------------------------- #
# Presence
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/presence", response_model=List[PresenceOut])
def get_presence(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    online_ids = manager.online_user_ids(group_id)
    rows = db.query(Presence).filter(Presence.group_id == group_id).all()
    result = []
    seen = set()
    for r in rows:
        status = "online" if r.user_id in online_ids else r.status.value if hasattr(r.status, "value") else r.status
        result.append({"user_id": r.user_id, "status": status, "last_seen": r.last_seen})
        seen.add(r.user_id)
    for uid in online_ids - seen:
        result.append({"user_id": uid, "status": "online", "last_seen": datetime.now(timezone.utc)})
    return result


# --------------------------------------------------------------------------- #
# Personal progress & scoreboard
# --------------------------------------------------------------------------- #
@router.get("/{group_id}/progress/me", response_model=PersonalProgressOut)
def get_my_progress(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    row = svc.ensure_progress_row(db, group_id, current_user.id)
    return row


@router.patch("/{group_id}/progress/me", response_model=PersonalProgressOut)
async def update_my_progress(
    group_id: int, payload: ProgressUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    row = svc.ensure_progress_row(db, group_id, current_user.id)

    bookmarks = list(row.bookmarks or [])
    evidence_viewed = list(row.evidence_viewed or [])

    if payload.add_bookmark and payload.add_bookmark not in bookmarks:
        bookmarks.append(payload.add_bookmark)
    if payload.remove_bookmark and payload.remove_bookmark in bookmarks:
        bookmarks.remove(payload.remove_bookmark)
    if payload.mark_evidence_viewed and payload.mark_evidence_viewed not in evidence_viewed:
        evidence_viewed.append(payload.mark_evidence_viewed)
        await manager.broadcast(group_id, "ActivityCreated", {
            "user_id": current_user.id,
            "description": f"{current_user.full_name} opened {payload.mark_evidence_viewed}",
        })
    if payload.add_time_spent_seconds:
        row.time_spent_seconds = (row.time_spent_seconds or 0) + payload.add_time_spent_seconds

    row.bookmarks = bookmarks
    row.evidence_viewed = evidence_viewed
    db.commit()
    db.refresh(row)
    return row


@router.get("/{group_id}/scoreboard", response_model=List[ScoreboardRow])
def get_scoreboard(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)
    return svc.build_scoreboard(db, group)


# --------------------------------------------------------------------------- #
# Shared evidence
#
# Nothing is shared automatically - an analyst explicitly promotes something
# they found (or a free-form note) into the lab-wide Shared Evidence section.
# It stays attributed to them and read-only for everyone else; only the
# owner or an Admin can unshare it. Investigations themselves are never
# merged - this only ever adds a read-only pointer + description.
# --------------------------------------------------------------------------- #
def _evidence_out(e: SharedEvidence) -> dict:
    return {
        "id": e.id,
        "lab_id": e.lab_id,
        "investigation_id": e.investigation_id,
        "owner_id": e.owner_id,
        "owner_name": e.owner.full_name if e.owner else None,
        "evidence_type": e.evidence_type.value if hasattr(e.evidence_type, "value") else e.evidence_type,
        "evidence_ref_id": e.evidence_ref_id,
        "title": e.title,
        "description": e.description,
        "source": e.source,
        "related_ioc": e.related_ioc,
        "related_mitre_technique": e.related_mitre_technique,
        "visibility": e.visibility.value if hasattr(e.visibility, "value") else e.visibility,
        "shared_at": e.shared_at,
    }


@router.get("/{group_id}/shared-evidence", response_model=List[SharedEvidenceOut])
def list_shared_evidence(
    group_id: int, q: str = "", evidence_type: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Any assigned member (or Admin) of THIS lab can view - never evidence
    from another lab."""
    svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)

    query = db.query(SharedEvidence).filter(SharedEvidence.lab_id == group_id)
    if evidence_type:
        query = query.filter(SharedEvidence.evidence_type == evidence_type)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            SharedEvidence.title.ilike(like),
            SharedEvidence.description.ilike(like),
            SharedEvidence.related_ioc.ilike(like),
            SharedEvidence.related_mitre_technique.ilike(like),
        ))
    rows = query.order_by(SharedEvidence.shared_at.desc()).all()
    return [_evidence_out(e) for e in rows]


@router.post("/{group_id}/shared-evidence", response_model=SharedEvidenceOut, status_code=201)
async def share_evidence(
    group_id: int, payload: SharedEvidenceCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """An analyst shares something from THEIR OWN investigation with the
    rest of the assigned team. The evidence isn't duplicated or merged -
    this only records who found it and a pointer + description."""
    group = svc.get_group_or_404(db, group_id)
    svc.require_member(db, group_id, current_user)

    try:
        evidence_type = EvidenceType(payload.evidence_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid evidence_type")

    investigation_id = payload.investigation_id
    if investigation_id is None:
        my_lab = svc.ensure_personal_lab(db, group, current_user.id)
        investigation_id = my_lab.id
    else:
        owned = db.query(PlayerLab).filter(
            PlayerLab.id == investigation_id, PlayerLab.player_id == current_user.id,
        ).first()
        if not owned:
            raise HTTPException(status_code=403, detail="You can only share evidence from your own investigation")

    evidence = SharedEvidence(
        lab_id=group_id,
        investigation_id=investigation_id,
        owner_id=current_user.id,
        evidence_type=evidence_type,
        evidence_ref_id=payload.evidence_ref_id,
        title=payload.title,
        description=payload.description,
        source=payload.source,
        related_ioc=payload.related_ioc,
        related_mitre_technique=payload.related_mitre_technique,
    )
    db.add(evidence)
    svc.log_activity(db, group_id, current_user.id, "evidence_shared",
                      f"{current_user.full_name} shared evidence: {payload.title}")
    db.commit()
    db.refresh(evidence)
    await manager.broadcast(group_id, "ActivityCreated", {
        "user_id": current_user.id, "description": f"{current_user.full_name} shared evidence: {payload.title}",
    })
    return _evidence_out(evidence)


@router.delete("/shared-evidence/{evidence_id}", status_code=204)
async def unshare_evidence(
    evidence_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Only the original owner or an Admin may unshare/remove. Other members
    of the lab can view but never edit or delete someone else's evidence."""
    evidence = db.query(SharedEvidence).filter(SharedEvidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Shared evidence not found")
    if current_user.role != "admin" and evidence.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner or an Admin can remove this shared evidence")
    lab_id = evidence.lab_id
    db.delete(evidence)
    svc.log_activity(db, lab_id, current_user.id, "evidence_unshared",
                      f"{current_user.full_name} removed shared evidence: {evidence.title}")
    db.commit()


# --------------------------------------------------------------------------- #
# WebSocket
# --------------------------------------------------------------------------- #
def _user_from_token(db: Session, token: str) -> Optional[User]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return db.query(User).filter(User.id == int(user_id)).first()
    except JWTError:
        return None


@router.websocket("/ws/{group_id}")
async def lab_group_ws(websocket: WebSocket, group_id: int, token: str = ""):
    """Realtime channel for a lab group. Connect with:
    ws(s)://<host>/api/v1/lab-groups/ws/{group_id}?token=<jwt access token>
    """
    db = SessionLocal()
    try:
        user = _user_from_token(db, token)
        if not user:
            await websocket.close(code=4401)
            return
        group = db.query(LabGroup).filter(LabGroup.id == group_id).first()
        if not group:
            await websocket.close(code=4404)
            return
        membership = svc.get_membership(db, group_id, user.id)
        if not membership and user.role != "admin":
            await websocket.close(code=4403)
            return

        await manager.connect(group_id, user.id, websocket)

        presence = db.query(Presence).filter(Presence.group_id == group_id, Presence.user_id == user.id).first()
        if not presence:
            presence = Presence(group_id=group_id, user_id=user.id, status=PresenceStatus.online)
            db.add(presence)
        else:
            presence.status = PresenceStatus.online
            presence.last_seen = datetime.now(timezone.utc)
        db.commit()

        await manager.broadcast(group_id, "PresenceChanged", {"user_id": user.id, "status": "online"})
        if membership:
            svc.log_activity(db, group_id, user.id, "member_joined", f"{user.full_name} came online")

        try:
            while True:
                data = await websocket.receive_json()
                event = data.get("type")
                # Lightweight client -> server signals; heavier mutations go
                # through the REST endpoints above (which already broadcast).
                if event == "presence":
                    new_status = data.get("status", "online")
                    if new_status in ("online", "idle", "away"):
                        presence.status = PresenceStatus(new_status)
                        presence.last_seen = datetime.now(timezone.utc)
                        db.commit()
                        await manager.broadcast(group_id, "PresenceChanged", {"user_id": user.id, "status": new_status})
                elif event == "typing":
                    await manager.broadcast(group_id, "Typing", {"user_id": user.id})
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(group_id, user.id, websocket)
            still_online = user.id in manager.online_user_ids(group_id)
            if not still_online:
                presence.status = PresenceStatus.offline
                presence.last_seen = datetime.now(timezone.utc)
                db.commit()
                await manager.broadcast(group_id, "PresenceChanged", {"user_id": user.id, "status": "offline"})
                await manager.broadcast(group_id, "MemberLeft", {"user_id": user.id})
    finally:
        db.close()
