from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import jwt
import os

from dependencies import SessionData, require_auth
from coder import CoderAPI

workspace_router = APIRouter()
coder_api = CoderAPI()

class WorkspaceState(BaseModel):
    state: str
    workspace_id: str
    username: str
    base_url: str
    agent: str

@workspace_router.get("/state", response_model=WorkspaceState)
async def get_workspace_state(auth: SessionData = Depends(require_auth)):
    """
    Get the current state of the user's workspace
    """
    # Get user info from token
    access_token = auth.token_data.get("access_token")
    decoded = jwt.decode(access_token, options={"verify_signature": False})
    username = decoded.get("preferred_username")
    email = decoded.get("email")    
    
    # Get user's workspaces
    user = coder_api.get_user_by_email(email)
    username = user.get('username', None)
    if not username:
        raise HTTPException(status_code=404, detail="User not found")
    
    workspace = coder_api.get_workspace_status_for_user(username)

    if not workspace:
        raise HTTPException(status_code=404, detail="No workspace found for user")
    
    #states can be:
    #starting
    #running
    #stopping
    #stopped
    #error
    
    return WorkspaceState(
        state=workspace.get('latest_build', {}).get('status', 'error'),
        workspace_id=workspace.get('latest_build', {}).get('workspace_name', ''),
        username=username,
        base_url=os.getenv("CODER_URL", ""),
        agent="main"
    )

@workspace_router.post("/start")
async def start_workspace(auth: SessionData = Depends(require_auth)):
    """
    Start a workspace for the authenticated user
    """
    # Get user info from token
    access_token = auth.token_data.get("access_token")
    decoded = jwt.decode(access_token, options={"verify_signature": False})
    email = decoded.get("email")

    user = coder_api.get_user_by_email(email)
    username = user.get('username', None)
    if not username:
        raise HTTPException(status_code=404, detail="User not found")
    # Get user's workspace
    workspace = coder_api.get_workspace_status_for_user(username)
    if not workspace:
        raise HTTPException(status_code=404, detail="No workspace found for user")
        
    # Start the workspace
    try:
        response = coder_api.start_workspace(workspace["id"])
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@workspace_router.post("/stop")
async def stop_workspace(auth: SessionData = Depends(require_auth)):
    """
    Stop a workspace for the authenticated user
    """
    # Get user info from token
    access_token = auth.token_data.get("access_token")
    decoded = jwt.decode(access_token, options={"verify_signature": False})
    email = decoded.get("email")

    user = coder_api.get_user_by_email(email)
    username = user.get('username', None)
    if not username:
        raise HTTPException(status_code=404, detail="User not found")
    # Get user's workspace
    workspace = coder_api.get_workspace_status_for_user(username)
    if not workspace:
        raise HTTPException(status_code=404, detail="No workspace found for user")
    
    # Stop the workspace
    try:
        response = coder_api.stop_workspace(workspace["id"])
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

