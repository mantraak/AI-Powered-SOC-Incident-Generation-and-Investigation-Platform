from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.security import get_current_user
from app.models.user import User
from app.services.mitre_service import MitreDataUnavailable, mitre_catalog

router = APIRouter()


class TacticOut(BaseModel):
    id: str | None = None
    name: str
    shortname: str


class TechniqueOut(BaseModel):
    id: str
    stix_id: str | None = None
    name: str
    description: str
    tactics: list[str]
    platforms: list[str]
    data_sources: list[str]
    is_subtechnique: bool
    url: str | None = None


def _unavailable(exc: MitreDataUnavailable) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


@router.get("/metadata")
def metadata(current_user: User = Depends(get_current_user)):
    try:
        return mitre_catalog.metadata()
    except MitreDataUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/tactics", response_model=list[TacticOut])
def list_tactics(current_user: User = Depends(get_current_user)):
    try:
        return mitre_catalog.tactics()
    except MitreDataUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/techniques", response_model=list[TechniqueOut])
def list_techniques(
    q: str = "",
    tactic: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    try:
        return mitre_catalog.search(query=q, tactic=tactic, limit=limit)
    except MitreDataUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/techniques/{technique_id}", response_model=TechniqueOut)
def get_technique(technique_id: str, current_user: User = Depends(get_current_user)):
    try:
        technique = mitre_catalog.get(technique_id)
    except MitreDataUnavailable as exc:
        raise _unavailable(exc) from exc
    if not technique:
        raise HTTPException(status_code=404, detail="MITRE ATT&CK technique not found")
    return technique

