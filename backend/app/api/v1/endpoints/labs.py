from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List
from datetime import datetime
from app.db.session import get_db
from app.core.security import get_current_admin, get_current_user, get_current_player
from app.models.lab import PlayerLab
from app.models.scenario import Scenario
from app.models.user import User
from app.models.question import Question
from app.models.player_answer import PlayerAnswer
from app.models.containment import ContainmentAction
from app.models.score import PlayerScore
from app.models.event import ScenarioEvent
from app.models.traffic import ScenarioTraffic
from app.models.trace import ScenarioTrace
from app.models.artifact import ScenarioArtifact
from app.models.alert import Alert
from app.models.indicator import Indicator
from app.schemas.lab import LabOut, LabAssign, AnswerSubmit, AnswerOut, ContainmentSubmit, ScoreOut
from app.evaluators.answer_evaluator import evaluate_answer
from app.services.workspace_service import deprovision_lab_workspace, provision_lab_workspace, workspace_payload

router = APIRouter()


def _enum_value(value):
    return getattr(value, "value", value)


def _iso(value):
    return value.isoformat() if value else None


def _score_payload(score: PlayerScore | None) -> dict | None:
    if not score:
        return None
    return {
        "id": score.id,
        "question_score": score.question_score or 0,
        "containment_score": score.containment_score or 0,
        "total_score": score.total_score or 0,
        "max_possible": score.max_possible or 0,
        "grade": score.grade,
        "feedback": score.feedback,
        "created_at": _iso(score.created_at),
    }


def _lab_archive_summary(db: Session, lab: PlayerLab) -> dict:
    scenario = lab.scenario
    answers = db.query(PlayerAnswer).filter(PlayerAnswer.lab_id == lab.id).all()
    score = db.query(PlayerScore).filter(PlayerScore.lab_id == lab.id).first()
    total_questions = db.query(Question).filter(Question.scenario_id == lab.scenario_id).count()
    correct_answers = len([a for a in answers if a.is_correct])
    max_possible = (score.max_possible or 0) if score else 0
    total_score = (score.total_score or 0) if score else 0
    pct = (total_score / max_possible * 100) if max_possible else 0
    return {
        "lab_id": lab.id,
        "scenario_id": lab.scenario_id,
        "title": scenario.title if scenario else f"Scenario #{lab.scenario_id}",
        "difficulty": _enum_value(scenario.difficulty) if scenario else "intermediate",
        "status": lab.status,
        "started_at": _iso(lab.started_at),
        "submitted_at": _iso(lab.submitted_at),
        "created_at": _iso(lab.created_at),
        "score": _score_payload(score),
        "percent": round(pct, 1),
        "answered_questions": len(answers),
        "correct_answers": correct_answers,
        "total_questions": total_questions,
        "mitre_techniques": (scenario.mitre_techniques or []) if scenario else [],
        "summary": scenario.summary if scenario else None,
    }


def _archive_detail_payload(db: Session, lab: PlayerLab) -> dict:
    scenario = lab.scenario
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    questions = db.query(Question).filter(Question.scenario_id == lab.scenario_id).order_by(Question.order).all()
    answers = db.query(PlayerAnswer).filter(PlayerAnswer.lab_id == lab.id).all()
    answer_map = {a.question_id: a for a in answers}
    score = db.query(PlayerScore).filter(PlayerScore.lab_id == lab.id).first()

    question_review = []
    for q in questions:
        answer = answer_map.get(q.id)
        question_review.append({
            "question_id": q.id,
            "order": q.order,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "points": q.points,
            "hint": q.hint,
            "player_answer": answer.answer_text if answer else None,
            "is_correct": answer.is_correct if answer else None,
            "points_awarded": answer.points_awarded if answer else 0,
            "feedback": answer.feedback if answer else "No answer submitted.",
            "attached_evidence": answer.attached_evidence if answer else None,
            "answered_at": _iso(answer.updated_at or answer.created_at) if answer else None,
        })

    events = db.query(ScenarioEvent).filter(ScenarioEvent.scenario_id == lab.scenario_id).order_by(ScenarioEvent.timestamp).all()
    traffic = db.query(ScenarioTraffic).filter(ScenarioTraffic.scenario_id == lab.scenario_id).order_by(ScenarioTraffic.timestamp).all()
    traces = db.query(ScenarioTrace).filter(ScenarioTrace.scenario_id == lab.scenario_id).order_by(ScenarioTrace.timestamp).all()
    artifacts = db.query(ScenarioArtifact).filter(ScenarioArtifact.scenario_id == lab.scenario_id).all()
    alerts = db.query(Alert).filter(Alert.scenario_id == lab.scenario_id).all()
    indicators = db.query(Indicator).filter(Indicator.scenario_id == lab.scenario_id).all()
    containment = db.query(ContainmentAction).filter(ContainmentAction.scenario_id == lab.scenario_id).all()

    investigation_path = []
    for idx, answer in enumerate(sorted(answers, key=lambda a: a.created_at or datetime.utcnow()), start=1):
        q = answer.question
        investigation_path.append({
            "step": idx,
            "title": f"Answered Q{q.order if q else idx}",
            "description": q.question_text if q else "Investigation answer",
            "player_action": answer.answer_text,
            "outcome": "correct" if answer.is_correct else "needs_review",
            "feedback": answer.feedback,
            "evidence": answer.attached_evidence,
            "points_awarded": answer.points_awarded or 0,
            "time": _iso(answer.created_at),
        })

    key_findings = [
        {
            "type": "alert",
            "title": alert.title,
            "detail": alert.description,
            "mitre_id": alert.mitre_id,
            "severity": alert.severity,
        }
        for alert in alerts[:6]
    ] + [
        {
            "type": "indicator",
            "title": indicator.value,
            "detail": indicator.description,
            "mitre_id": indicator.mitre_id,
            "severity": indicator.ioc_type,
        }
        for indicator in indicators[:6]
    ]

    return {
        "summary": _lab_archive_summary(db, lab),
        "scenario": {
            "id": scenario.id,
            "title": scenario.title,
            "description": scenario.description,
            "summary": scenario.summary,
            "difficulty": _enum_value(scenario.difficulty),
            "mitre_techniques": scenario.mitre_techniques or [],
            "iocs": scenario.iocs or [],
            "attack_steps": scenario.attack_steps or [],
            "timeline": scenario.timeline or [],
            "assets": scenario.assets or [],
        },
        "score": _score_payload(score),
        "investigation_path": investigation_path,
        "question_review": question_review,
        "key_findings": key_findings,
        "evidence": {
            "events": [{
                "id": e.id,
                "timestamp": _iso(e.timestamp),
                "event_type": e.event_type,
                "source": e.source,
                "host": e.host,
                "user": e.user,
                "message": e.message,
                "mitre_id": e.mitre_id,
                "is_malicious": e.is_malicious,
            } for e in events],
            "traffic": [{
                "id": f.id,
                "timestamp": _iso(f.timestamp),
                "src_ip": f.src_ip,
                "dst_ip": f.dst_ip,
                "dst_port": f.dst_port,
                "protocol": f.protocol,
                "direction": f.direction,
                "summary": f.summary,
                "mitre_id": f.mitre_id,
                "is_malicious": f.is_malicious,
            } for f in traffic],
            "traces": [{
                "id": t.id,
                "timestamp": _iso(t.timestamp),
                "trace_type": t.trace_type,
                "host": t.host,
                "process_name": t.process_name,
                "parent_process": t.parent_process,
                "command_line": t.command_line,
                "network_target": t.network_target,
                "summary": t.summary,
                "mitre_id": t.mitre_id,
                "is_malicious": t.is_malicious,
            } for t in traces],
            "artifacts": [{
                "id": a.id,
                "name": a.name,
                "artifact_type": a.artifact_type,
                "host": a.host,
                "content": a.content,
                "related_event_ids": a.related_event_ids,
            } for a in artifacts],
            "alerts": [{
                "id": a.id,
                "title": a.title,
                "severity": a.severity,
                "description": a.description,
                "mitre_id": a.mitre_id,
                "rule_name": a.rule_name,
            } for a in alerts],
            "indicators": [{
                "id": i.id,
                "ioc_type": i.ioc_type,
                "value": i.value,
                "description": i.description,
                "mitre_id": i.mitre_id,
            } for i in indicators],
            "containment_actions": [{
                "id": c.id,
                "action_type": c.action_type,
                "target": c.target,
                "description": c.description,
            } for c in containment],
        },
        "diary": {
            "opening": f"You investigated {scenario.title} as Lab #{lab.id}.",
            "method": "This archive reconstructs your workflow from submitted answers, attached evidence, scenario telemetry and scoring feedback.",
            "review_tip": "Re-read the missed or low-score answers first, then compare them with the alerts, indicators and timeline below.",
        },
    }


@router.post("/assign", response_model=LabOut, status_code=201)
def assign_lab(
    assign: LabAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == assign.scenario_id, Scenario.status == "published").first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Published scenario not found")
    existing = db.query(PlayerLab).filter(
        PlayerLab.player_id == assign.player_id,
        PlayerLab.scenario_id == assign.scenario_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Lab already assigned")
    lab = PlayerLab(player_id=assign.player_id, scenario_id=assign.scenario_id)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    provision_lab_workspace(db, lab)
    return lab


@router.get("/my", response_model=List[LabOut])
def my_labs(db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    return db.query(PlayerLab).filter(PlayerLab.player_id == current_user.id).all()


@router.get("/all", response_model=List[LabOut])
def all_labs(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return db.query(PlayerLab).order_by(PlayerLab.created_at.desc()).all()


@router.get("/archive")
def archived_labs(db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    """Read-only refresher diary of the player's finished labs."""
    labs = db.query(PlayerLab).filter(
        PlayerLab.player_id == current_user.id,
        PlayerLab.status.in_(["submitted", "evaluated"]),
    ).order_by(PlayerLab.submitted_at.desc().nullslast(), PlayerLab.created_at.desc()).all()
    return [_lab_archive_summary(db, lab) for lab in labs]


@router.get("/archive/{lab_id}")
def archived_lab_detail(
    lab_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    lab = db.query(PlayerLab).filter(
        PlayerLab.id == lab_id,
        PlayerLab.player_id == current_user.id,
        PlayerLab.status.in_(["submitted", "evaluated"]),
    ).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Archived lab not found")
    return _archive_detail_payload(db, lab)


@router.get("/{lab_id}", response_model=LabOut)
def get_lab(lab_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    if current_user.role != "admin" and lab.player_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return lab


@router.get("/{lab_id}/workspace")
def get_lab_workspace(
    lab_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    if current_user.role != "admin" and lab.player_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    workspace = provision_lab_workspace(db, lab)
    return workspace_payload(workspace, reveal_credentials=True)


@router.post("/{lab_id}/start")
def start_lab(lab_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id, PlayerLab.player_id == current_user.id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    if lab.status == "assigned":
        lab.status = "in_progress"
        lab.started_at = datetime.utcnow()
        db.commit()
    return {"message": "Lab started", "status": lab.status}


@router.post("/{lab_id}/answer", response_model=AnswerOut)
def submit_answer(
    lab_id: int,
    answer: AnswerSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_player),
):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id, PlayerLab.player_id == current_user.id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    if lab.status not in ("in_progress", "submitted"):
        raise HTTPException(status_code=400, detail="Lab not active")

    question = db.query(Question).filter(Question.id == answer.question_id).first()
    if not question or question.scenario_id != lab.scenario_id:
        raise HTTPException(status_code=404, detail="Question not found")

    # Evaluate answer
    is_correct, points, feedback = evaluate_answer(question, answer.answer_text)

    # Upsert answer
    existing = db.query(PlayerAnswer).filter(
        PlayerAnswer.player_id == current_user.id,
        PlayerAnswer.question_id == answer.question_id,
        PlayerAnswer.lab_id == lab_id,
    ).first()

    if existing:
        existing.answer_text = answer.answer_text
        existing.is_correct = is_correct
        existing.points_awarded = points
        existing.feedback = feedback
        existing.attached_evidence = answer.attached_evidence
        db.commit()
        db.refresh(existing)
        return existing
    else:
        player_answer = PlayerAnswer(
            player_id=current_user.id,
            question_id=answer.question_id,
            lab_id=lab_id,
            answer_text=answer.answer_text,
            is_correct=is_correct,
            points_awarded=points,
            feedback=feedback,
            attached_evidence=answer.attached_evidence,
        )
        db.add(player_answer)
        db.commit()
        db.refresh(player_answer)
        return player_answer


@router.get("/{lab_id}/answers", response_model=List[AnswerOut])
def get_answers(lab_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    if current_user.role != "admin" and lab.player_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return db.query(PlayerAnswer).filter(PlayerAnswer.lab_id == lab_id).all()


@router.post("/{lab_id}/submit")
def submit_lab(lab_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id, PlayerLab.player_id == current_user.id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    lab.status = "submitted"
    lab.submitted_at = datetime.utcnow()
    db.commit()

    # Calculate score
    questions = db.query(Question).filter(Question.scenario_id == lab.scenario_id).all()
    answers = db.query(PlayerAnswer).filter(PlayerAnswer.lab_id == lab_id).all()
    answer_map = {a.question_id: a for a in answers}

    total_points = sum(q.points for q in questions)
    earned = sum(a.points_awarded for a in answers if a.points_awarded)

    grade = "F"
    pct = (earned / total_points * 100) if total_points > 0 else 0
    if pct >= 90:
        grade = "A"
    elif pct >= 75:
        grade = "B"
    elif pct >= 60:
        grade = "C"
    elif pct >= 45:
        grade = "D"

    existing_score = db.query(PlayerScore).filter(PlayerScore.lab_id == lab_id).first()
    if not existing_score:
        score = PlayerScore(
            player_id=current_user.id,
            lab_id=lab_id,
            scenario_id=lab.scenario_id,
            question_score=earned,
            containment_score=0,
            total_score=earned,
            max_possible=total_points,
            grade=grade,
            feedback=f"You scored {pct:.1f}% ({earned:.0f}/{total_points:.0f} points).",
        )
        db.add(score)
        db.commit()

    lab.status = "evaluated"
    db.commit()
    return {"message": "Lab submitted and evaluated", "grade": grade, "score": earned, "max": total_points}


@router.get("/{lab_id}/score", response_model=ScoreOut)
def get_score(lab_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_player)):
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    if current_user.role != "admin" and lab.player_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    score = db.query(PlayerScore).filter(PlayerScore.lab_id == lab_id).first()
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    return score


@router.post("/{lab_id}/reset")
def reset_lab(
    lab_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Reset one player's scenario attempt without altering generated evidence."""
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    answers_deleted = db.query(PlayerAnswer).filter(
        PlayerAnswer.lab_id == lab_id
    ).delete(synchronize_session=False)
    scores_deleted = db.query(PlayerScore).filter(
        PlayerScore.lab_id == lab_id
    ).delete(synchronize_session=False)
    lab.status = "assigned"
    lab.started_at = None
    lab.submitted_at = None
    db.commit()
    return {
        "message": "Player scenario progress reset",
        "lab_id": lab_id,
        "status": lab.status,
        "answers_deleted": answers_deleted,
        "scores_deleted": scores_deleted,
    }


@router.delete("/{lab_id}")
def unassign_lab(
    lab_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Remove an assignment, its player progress and its isolated SIEM resources."""
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    cleanup_warning = None
    try:
        deprovision_lab_workspace(db, lab)
    except Exception as exc:
        cleanup_warning = f"External SIEM cleanup failed: {exc.__class__.__name__}"

    db.query(PlayerAnswer).filter(PlayerAnswer.lab_id == lab_id).delete(synchronize_session=False)
    db.query(PlayerScore).filter(PlayerScore.lab_id == lab_id).delete(synchronize_session=False)
    db.delete(lab)
    db.commit()
    return {"message": "Lab unassigned", "lab_id": lab_id, "warning": cleanup_warning}
