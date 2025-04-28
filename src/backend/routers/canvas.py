import json
import jwt
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse

from dependencies import SessionData, require_auth
from db import store_canvas_data, get_canvas_data, get_recent_canvases, MAX_BACKUPS_PER_USER
import posthog

canvas_router = APIRouter()

def get_default_canvas_data():
    try:
        with open("default_canvas.json", "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load default canvas: {str(e)}"
        )

@canvas_router.get("/default")
async def get_default_canvas(auth: SessionData = Depends(require_auth)):
    try:
        with open("default_canvas.json", "r") as f:
            canvas_data = json.load(f)
        return canvas_data
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to load default canvas: {str(e)}"}
        )

@canvas_router.post("")
async def save_canvas(data: Dict[str, Any], auth: SessionData = Depends(require_auth), request: Request = None):
    access_token = auth.token_data.get("access_token")
    decoded = jwt.decode(access_token, options={"verify_signature": False})
    user_id = decoded["sub"]
    success = await store_canvas_data(user_id, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save canvas data")
    return {"status": "success"}

@canvas_router.get("")
async def get_canvas(auth: SessionData = Depends(require_auth)):
    access_token = auth.token_data.get("access_token")
    decoded = jwt.decode(access_token, options={"verify_signature": False})
    user_id = decoded["sub"]
    data = await get_canvas_data(user_id)
    if data is None:
        return get_default_canvas_data()
    return data

@canvas_router.get("/recent")
async def get_recent_canvas_backups(limit: int = MAX_BACKUPS_PER_USER, auth: SessionData = Depends(require_auth)):
    """Get the most recent canvas backups for the authenticated user"""
    access_token = auth.token_data.get("access_token")
    decoded = jwt.decode(access_token, options={"verify_signature": False})
    user_id = decoded["sub"]
    
    # Limit the number of backups to the maximum configured value
    if limit > MAX_BACKUPS_PER_USER:
        limit = MAX_BACKUPS_PER_USER
    
    backups = await get_recent_canvases(user_id, limit)
    return {"backups": backups}
