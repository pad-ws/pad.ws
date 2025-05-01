import os
import jwt

import posthog
from fastapi import APIRouter, Depends, Request
from dotenv import load_dotenv

from dependencies import SessionData, require_auth
from config import redis_client

load_dotenv()

user_router = APIRouter()

@user_router.get("/me")
async def get_user_info(auth: SessionData = Depends(require_auth), request: Request = None):
    token_data = auth.token_data
    access_token = token_data.get("access_token")
    
    decoded = jwt.decode(access_token, options={"verify_signature": False})

    # Build full URL (mirroring canvas.py logic)
    full_url = None
    if request:
        full_url = str(request.base_url).rstrip("/") + str(request.url.path)
        full_url = full_url.replace("http://", "https://")

    user_data: dict = {
        "id": decoded["sub"],  # Unique user ID
        "email": decoded.get("email", ""),
        "username": decoded.get("preferred_username", ""),
        "name": decoded.get("name", ""),
        "given_name": decoded.get("given_name", ""),
        "family_name": decoded.get("family_name", ""),
        "email_verified": decoded.get("email_verified", False)
    }

    if os.getenv("VITE_PUBLIC_POSTHOG_KEY"):
        telemetry = user_data | {"$current_url": full_url}
        posthog.identify(distinct_id=decoded["sub"], properties=telemetry)
    
    return user_data

@user_router.get("/count")
async def get_user_count(auth: SessionData = Depends(require_auth)):
    """
    Get the count of active sessions in Redis
    
    Returns:
        dict: A dictionary containing the count of active sessions
    """
    # Count keys that match the session pattern
    session_count = len(redis_client.keys("session:*"))
    
    return {
        "active_sessions": session_count,
        "message": f"There are currently {session_count} active sessions in Redis"
    }