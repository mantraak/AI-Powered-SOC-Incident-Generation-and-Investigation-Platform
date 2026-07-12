from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.core.security import get_current_admin, get_current_user
from app.models.scenario import Scenario
from app.models.user import User
from app.schemas.scenario import ScenarioCreate, ScenarioUpdate, ScenarioOut
from app.services.generator_service import run_ai_generation
from app.services.mitre_service import MitreDataUnavailable, mitre_catalog
from app.models.lab import PlayerLab

router = APIRouter()


def validate_mitre_ids(technique_ids: List[str]):
    try:
        invalid = mitre_catalog.invalid_ids(technique_ids)
    except MitreDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid MITRE ATT&CK technique IDs: {', '.join(invalid)}",
        )


@router.get("/", response_model=List[ScenarioOut])
def list_scenarios(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return db.query(Scenario).order_by(Scenario.created_at.desc()).all()


@router.get("/published", response_model=List[ScenarioOut])
def list_published_scenarios(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Player-accessible list of published scenarios - used e.g. when starting
    a new collaborative lab group, without exposing the full admin catalogue."""
    return db.query(Scenario).filter(Scenario.status == "published").order_by(Scenario.created_at.desc()).all()


@router.post("/", response_model=ScenarioOut, status_code=201)
def create_scenario(
    scenario_in: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    validate_mitre_ids(scenario_in.mitre_techniques or [])
    scenario = Scenario(**scenario_in.model_dump(), created_by=current_user.id)
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    return scenario


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    update: ScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if update.mitre_techniques is not None:
        validate_mitre_ids(update.mitre_techniques)
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    db.delete(scenario)
    db.commit()


@router.post("/{scenario_id}/generate")
def generate_scenario(
    scenario_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    scenario.status = "generating"
    db.commit()
    background_tasks.add_task(run_ai_generation, scenario_id)
    return {"message": "Generation started", "scenario_id": scenario_id, "status": "generating"}


@router.post("/{scenario_id}/publish")
def publish_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if scenario.status not in ("ready", "generated"):
        raise HTTPException(status_code=400, detail="Scenario is not ready to publish")
    scenario.status = "published"
    db.commit()
    return {"message": "Scenario published"}
