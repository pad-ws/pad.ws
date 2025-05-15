import os
import json
from uuid import UUID

import posthog
import jwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_redis_client, get_jwks_client, OIDC_CLIENT_ID, FRONTEND_URL
from dependencies import UserSession, require_admin, require_auth
from database.database import get_session
from domain.user import User

users_router = APIRouter()


@users_router.get("/me")
async def get_user_info(
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    """Get the current user's information and their pads"""
    
    # Create token data dictionary from UserSession properties
    token_data = {
        "username": user.username,
        "email": user.email,
        "email_verified": user.email_verified,
        "name": user.name,
        "given_name": user.given_name,
        "family_name": user.family_name,
        "roles": user.roles
    }
    
    # Get user's pad metadata
    pads = await User.get_open_pads(session, user.id)
    
    user_data = {
        **token_data,
        "pads": pads
    }
    
    if os.getenv("VITE_PUBLIC_POSTHOG_KEY"):
        telemetry = user_data.copy()
        telemetry["$current_url"] = FRONTEND_URL
        posthog.identify(distinct_id=user.id, properties=telemetry)
    
    return user_data


@users_router.get("/online")
async def get_online_users(
    _: bool = Depends(require_admin),
):
    """Get all online users with their information (admin only)"""
    client = get_redis_client()
    
    # Get all session keys
    session_keys = client.keys("session:*")
    
    # Extract user IDs from sessions and fetch user data
    online_users = []
    for key in session_keys:
        session_data = client.get(key)
        if session_data:
            try:
                # Parse session data
                session_json = json.loads(session_data)
                
                # Extract user ID from token
                token_data = session_json.get('access_token')
                if token_data:
                    # Decode JWT token to get user ID
                    jwks_client = get_jwks_client()
                    signing_key = jwks_client.get_signing_key_from_jwt(token_data)
                    decoded = jwt.decode(
                        token_data,
                        signing_key.key,
                        algorithms=["RS256"],
                        audience=OIDC_CLIENT_ID,
                    )
                    
                    # Get user ID from token
                    user_id = UUID(decoded.get('sub'))
                    
                    # Fetch user data from database
                    raise NotImplementedError("/online Not implemented")
                    user_data = await user_service.get_user(user_id)
                    if user_data:
                        online_users.append(user_data)
            except Exception as e:
                print(f"Error processing session {key}: {str(e)}")
                continue
    
    return {"online_users": online_users, "count": len(online_users)}
