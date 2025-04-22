import json
import jwt
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse

from dependencies import SessionData, require_auth
from db import store_canvas_data, get_canvas_data
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
    # PostHog analytics: capture canvas_saved event
    try:
        app_state = data.get("appState", {})
        width = app_state.get("width")
        height = app_state.get("height")
        zoom = app_state.get("zoom", {}).get("value")
        full_url = None
        if request:
            full_url = str(request.base_url).rstrip("/") + str(request.url.path)
            full_url = full_url.replace("http://", "https://")
        posthog.capture(
            distinct_id=user_id,
            event="canvas_saved",
            properties={
                "pad_width": width,
                "pad_height": height,
                "pad_zoom": zoom,
                "$current_url": full_url,
            }
        )
    except Exception as e:
        print(f"Error capturing canvas_saved event: {str(e)}")
        pass
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
