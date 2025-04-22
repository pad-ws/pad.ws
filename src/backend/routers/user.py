import jwt
from fastapi import APIRouter, Depends, Request
import posthog

from dependencies import SessionData, require_auth

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

    # Identify user in PostHog (mirrors frontend identify)
    posthog.identify(
        distinct_id=decoded["sub"],
        properties={
            "email": decoded.get("email", ""),
            "username": decoded.get("preferred_username", ""),
            "name": decoded.get("name", ""),
            "given_name": decoded.get("given_name", ""),
            "family_name": decoded.get("family_name", ""),
            "email_verified": decoded.get("email_verified", False),
            "$current_url": full_url
        }
    )
    
    return {
        "id": decoded["sub"],  # Unique user ID
        "email": decoded.get("email", ""),
        "username": decoded.get("preferred_username", ""),
        "name": decoded.get("name", ""),
        "given_name": decoded.get("given_name", ""),
        "family_name": decoded.get("family_name", ""),
        "email_verified": decoded.get("email_verified", False)
    }
