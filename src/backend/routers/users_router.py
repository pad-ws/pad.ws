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
    try:
        client = await get_redis_client()
        
        # Get all session keys
        session_keys = await client.keys("session:*")
        
        # Extract user IDs from sessions and fetch user data
        online_users = []
        jwks_client = get_jwks_client()

        for key in session_keys:
            try:
                # Get session data
                session_data_raw = await client.get(key)
                if not session_data_raw:
                    continue
                    
                # Parse session data
                session_json = json.loads(session_data_raw)
                
                # Extract user ID from token
                token_data = session_json.get('access_token')
                if not token_data:
                    continue
                    
                # Decode JWT token to get user ID
                signing_key = jwks_client.get_signing_key_from_jwt(token_data)
                decoded = jwt.decode(
                    token_data,
                    signing_key.key,
                    algorithms=["RS256"],
                    audience=OIDC_CLIENT_ID,
                )
                
                # Get user ID from token
                user_id = UUID(decoded.get('sub'))
                
                # This endpoint is partially implemented - would need to fetch user data
                raise NotImplementedError("/online Not implemented")
                
            except json.JSONDecodeError as e:
                print(f"Error parsing session data: {str(e)}")
                continue
            except jwt.PyJWTError as e:
                print(f"Error decoding JWT: {str(e)}")
                continue
            except Exception as e:
                print(f"Error processing session {key}: {str(e)}")
                continue
        
        return {"online_users": online_users, "count": len(online_users)}
        
    except Exception as e:
        print(f"Error getting online users: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve online users")
