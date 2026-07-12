from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, users, scenarios, labs, investigation, tools, mitre, moderator, ai_settings, lab_groups,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(labs.router, prefix="/labs", tags=["labs"])
api_router.include_router(investigation.router, prefix="/investigation", tags=["investigation"])
api_router.include_router(tools.router, prefix="/tools", tags=["tools"])
api_router.include_router(mitre.router, prefix="/mitre", tags=["mitre"])
api_router.include_router(moderator.router, prefix="/moderator", tags=["moderator"])
api_router.include_router(ai_settings.router, prefix="/ai-settings", tags=["ai-settings"])
# Collaborative multi-analyst labs (additive - does not touch /labs above).
api_router.include_router(lab_groups.router, prefix="/lab-groups", tags=["lab-groups"])
