import os

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from dependencies import UserSession, require_auth, get_coder_api
from coder import CoderAPI

workspace_router = APIRouter()

class WorkspaceState(BaseModel):
    id: str
    state: str
    name: str
    username: str
    base_url: str
    agent: str

@workspace_router.get("/state", response_model=WorkspaceState)
async def get_workspace_state(
    user: UserSession = Depends(require_auth),
    coder_api: CoderAPI = Depends(get_coder_api)
):
    """
    Get the current state of the user's workspace
    """

    coder_user: dict = coder_api.get_user_by_email(user.email)
    if not coder_user:
        print(f"Coder user not found for user {user.email} ({user.id})")
        raise HTTPException(status_code=404, detail=f"Coder user not found for user {user.email} ({user.id})")
    
    coder_username: str = coder_user.get('username', None)
    if not coder_username:
        print(f"Coder username not found for user {user.email} ({user.id})")
        raise HTTPException(status_code=404, detail=f"Coder username not found for user {user.email} ({user.id})")
    
    workspace: dict = coder_api.get_workspace_status_for_user(coder_username)
    if not workspace:
        print(f"Coder workspace not found for user {user.email} ({user.id})")
        raise HTTPException(status_code=404, detail=f"Coder Workspace not found for user {user.email} ({user.id})")
    
    latest_build: dict = workspace.get('latest_build', {})
    latest_build_status: str = latest_build.get('status', 'error')
    workspace_name: str = latest_build.get('workspace_name', None)
    workspace_id: str = workspace.get('id', {})
    
    return WorkspaceState(
        state=latest_build_status,
        id=workspace_id,
        name=workspace_name,
        username=coder_username,
        base_url=os.getenv("CODER_URL", ""),
        agent="main"
    )


@workspace_router.post("/start")
async def start_workspace(
    user: UserSession = Depends(require_auth),
    coder_api: CoderAPI = Depends(get_coder_api)
):
    """
    Start a workspace for the authenticated user
    """
    
    workspace: WorkspaceState = await get_workspace_state(user, coder_api)

    try:
        response = coder_api.start_workspace(workspace.id)
        return JSONResponse(content=response)
    except Exception as e:
        print(f"Error starting workspace: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@workspace_router.post("/stop")
async def stop_workspace(
    user: UserSession = Depends(require_auth),
    coder_api: CoderAPI = Depends(get_coder_api)
):
    """
    Stop a workspace for the authenticated user
    """
    
    workspace: WorkspaceState = await get_workspace_state(user, coder_api)

    try:
        response = coder_api.stop_workspace(workspace.id)
        return JSONResponse(content=response)
    except Exception as e:
        print(f"Error stopping workspace: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
