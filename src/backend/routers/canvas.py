import json
import jwt
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse

from dependencies import SessionData, require_auth
from db import store_canvas_data, get_canvas_data

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

@canvas_router.post("")
async def save_canvas(data: Dict[str, Any], auth: SessionData = Depends(require_auth)):
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
