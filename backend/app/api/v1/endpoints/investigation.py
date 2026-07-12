from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.core.security import get_current_user
from app.models.scenario import Scenario
from app.models.event import ScenarioEvent
from app.models.artifact import ScenarioArtifact
from app.models.alert import Alert
from app.models.indicator import Indicator
from app.models.question import Question
from app.models.containment import ContainmentAction
from app.models.user import User
from app.models.traffic import ScenarioTraffic
from app.models.trace import ScenarioTrace
from app.models.lab import PlayerLab

router = APIRouter()


def _check_scenario_access(scenario_id: int, db: Session, current_user: User):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if current_user.role != "admin":
        assignment = db.query(PlayerLab).filter(
            PlayerLab.scenario_id == scenario_id,
            PlayerLab.player_id == current_user.id,
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="Scenario is not assigned to this player")
        if scenario.status != "published":
            raise HTTPException(status_code=403, detail="Scenario not published")
    return scenario


@router.get("/scenarios/{scenario_id}/events")
def get_events(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    events = db.query(ScenarioEvent).filter(ScenarioEvent.scenario_id == scenario_id).all()
    result = []
    for e in events:
        result.append({
            "id": e.id,
            "event_type": e.event_type,
            "source": e.source,
            "host": e.host,
            "user": e.user,
            "message": e.message,
            "mitre_id": e.mitre_id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "event_data": e.event_data,
        })
    return result


@router.get("/scenarios/{scenario_id}/traffic")
def get_traffic(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    flows = db.query(ScenarioTraffic).filter(
        ScenarioTraffic.scenario_id == scenario_id
    ).order_by(ScenarioTraffic.timestamp).all()
    return [{
        "id": flow.id,
        "src_ip": flow.src_ip,
        "dst_ip": flow.dst_ip,
        "src_port": flow.src_port,
        "dst_port": flow.dst_port,
        "protocol": flow.protocol,
        "packets": flow.packets,
        "bytes": flow.bytes,
        "direction": flow.direction,
        "summary": flow.summary,
        "mitre_id": flow.mitre_id,
        "is_malicious": flow.is_malicious,
        "timestamp": flow.timestamp.isoformat() if flow.timestamp else None,
        "flow_data": flow.flow_data,
    } for flow in flows]


@router.get("/scenarios/{scenario_id}/traces")
def get_traces(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    traces = db.query(ScenarioTrace).filter(
        ScenarioTrace.scenario_id == scenario_id
    ).order_by(ScenarioTrace.timestamp).all()
    return [{
        "id": trace.id,
        "trace_type": trace.trace_type,
        "host": trace.host,
        "process_name": trace.process_name,
        "parent_process": trace.parent_process,
        "command_line": trace.command_line,
        "network_target": trace.network_target,
        "summary": trace.summary,
        "mitre_id": trace.mitre_id,
        "is_malicious": trace.is_malicious,
        "timestamp": trace.timestamp.isoformat() if trace.timestamp else None,
        "trace_data": trace.trace_data,
    } for trace in traces]


@router.get("/scenarios/{scenario_id}/artifacts")
def get_artifacts(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    artifacts = db.query(ScenarioArtifact).filter(ScenarioArtifact.scenario_id == scenario_id).all()
    return [{
        "id": a.id,
        "name": a.name,
        "artifact_type": a.artifact_type,
        "host": a.host,
        "content": a.content,
        "related_event_ids": a.related_event_ids,
    } for a in artifacts]


@router.get("/scenarios/{scenario_id}/alerts")
def get_alerts(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    alerts = db.query(Alert).filter(Alert.scenario_id == scenario_id).all()
    return [{
        "id": a.id,
        "title": a.title,
        "severity": a.severity,
        "description": a.description,
        "mitre_id": a.mitre_id,
        "rule_name": a.rule_name,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in alerts]


@router.get("/scenarios/{scenario_id}/indicators")
def get_indicators(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    indicators = db.query(Indicator).filter(Indicator.scenario_id == scenario_id).all()
    return [{
        "id": i.id,
        "ioc_type": i.ioc_type,
        "value": i.value,
        "description": i.description,
        "mitre_id": i.mitre_id,
    } for i in indicators]


@router.get("/scenarios/{scenario_id}/questions")
def get_questions(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    questions = db.query(Question).filter(
        Question.scenario_id == scenario_id
    ).order_by(Question.order).all()
    return [{
        "id": q.id,
        "order": q.order,
        "question_text": q.question_text,
        "question_type": q.question_type,
        "choices": q.choices,
        "points": q.points,
        "hint": q.hint,
    } for q in questions]


@router.get("/scenarios/{scenario_id}/containment-actions")
def get_containment_actions(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_scenario_access(scenario_id, db, current_user)
    actions = db.query(ContainmentAction).filter(
        ContainmentAction.scenario_id == scenario_id
    ).all()
    # Only reveal action type and description to players, not scoring metadata
    return [{
        "id": a.id,
        "action_type": a.action_type,
        "target": a.target,
        "description": a.description,
    } for a in actions]
