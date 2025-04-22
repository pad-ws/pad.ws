import jwt
from fastapi import APIRouter, Depends
import posthog

from dependencies import SessionData, require_auth

user_router = APIRouter()

@user_router.get("/me")
async def get_user_info(auth: SessionData = Depends(require_auth)):
    token_data = auth.token_data
    access_token = token_data.get("access_token")
    
    decoded = jwt.decode(access_token, options={"verify_signature": False})

    # Identify user in PostHog (mirrors frontend identify)
    posthog.identify(
        distinct_id=decoded["sub"],
        properties={
            "email": decoded.get("email", ""),
            "username": decoded.get("preferred_username", ""),
            "name": decoded.get("name", ""),
            "given_name": decoded.get("given_name", ""),
            "family_name": decoded.get("family_name", ""),
            "email_verified": decoded.get("email_verified", False)
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