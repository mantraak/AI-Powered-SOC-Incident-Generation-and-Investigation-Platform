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
from app.schemas.lab import LabOut, LabAssign, AnswerSubmit, AnswerOut, ContainmentSubmit, ScoreOut
from app.evaluators.answer_evaluator import evaluate_answer
from app.services.workspace_service import deprovision_lab_workspace, provision_lab_workspace, workspace_payload

router = APIRouter()


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
