from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, scenarios, labs, investigation, tools

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(labs.router, prefix="/labs", tags=["labs"])
api_router.include_router(investigation.router, prefix="/investigation", tags=["investigation"])
api_router.include_router(tools.router, prefix="/tools", tags=["tools"])
