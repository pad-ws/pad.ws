import os
import json
from uuid import UUID

import posthog
import jwt
from fastapi import APIRouter, Depends, HTTPException

from config import get_redis_client, get_jwks_client, OIDC_CLIENT_ID, FRONTEND_URL
from database import get_user_service
from database.service import UserService
from dependencies import UserSession, require_admin, require_auth

user_router = APIRouter()


@user_router.post("")
async def create_user(
    user_id: UUID,
    username: str, 
    email: str,
    email_verified: bool = False,
    name: str = None,
    given_name: str = None,
    family_name: str = None,
    roles: list = None,
    _: bool = Depends(require_admin),
    user_service: UserService = Depends(get_user_service)
):
    """Create a new user (admin only)"""
    try:
        user = await user_service.create_user(
            user_id=user_id,
            username=username, 
            email=email,
            email_verified=email_verified,
            name=name,
            given_name=given_name,
            family_name=family_name,
            roles=roles
        )
        return user
    except ValueError as e:
        print(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@user_router.get("")
async def get_all_users(
    _: bool = Depends(require_admin),
    user_service: UserService = Depends(get_user_service)
):
    """Get all users (admin only)"""
    users = await user_service.get_all_users()
    return users


@user_router.get("/me")
async def get_user_info(
    user: UserSession = Depends(require_auth),
    user_service: UserService = Depends(get_user_service),
):
    """Get the current user's information and sync with token data"""
    
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
    
    try:
        # Sync user with token data
        user_data = await user_service.sync_user_with_token_data(user.id, token_data)
    except Exception as e:
        print(f"Error syncing user data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error syncing user data: {e}"
        )
    
    if os.getenv("VITE_PUBLIC_POSTHOG_KEY"):
        telemetry = user_data.copy()
        telemetry["$current_url"] = FRONTEND_URL
        posthog.identify(distinct_id=user_data["id"], properties=telemetry)
    
    return user_data


@user_router.get("/count")
async def get_user_count(
    _: bool = Depends(require_admin),
):
    """Get the number of active sessions (admin only)"""
    client = get_redis_client()
    session_count = len(client.keys("session:*"))
    return {"active_sessions": session_count }


@user_router.get("/online")
async def get_online_users(
    _: bool = Depends(require_admin),
    user_service: UserService = Depends(get_user_service)
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
                    user_data = await user_service.get_user(user_id)
                    if user_data:
                        online_users.append(user_data)
            except Exception as e:
                print(f"Error processing session {key}: {str(e)}")
                continue
    
    return {"online_users": online_users, "count": len(online_users)}

@user_router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    _: bool = Depends(require_admin),
    user_service: UserService = Depends(get_user_service)
):
    """Get a user by ID (admin only)"""
    user = await user_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user
