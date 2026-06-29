from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, HttpUrl

from app.core.security import get_current_admin
from app.integrations.tool_registry import get_tool_statuses
from app.models.user import User

router = APIRouter()


class ToolStatus(BaseModel):
    id: str
    name: str
    description: str
    category: str
    public_url: HttpUrl
    status: Literal["online", "offline"]
    detail: str


@router.get("/", response_model=list[ToolStatus])
async def list_tools(current_user: User = Depends(get_current_admin)):
    return await get_tool_statuses()

