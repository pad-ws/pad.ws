import os
from uuid import UUID

import posthog
from fastapi import APIRouter, Depends, HTTPException

from config import redis_client, OIDC_CONFIG
from database import get_user_service
from database.service import UserService
from dependencies import get_current_user, require_admin

user_router = APIRouter()

@user_router.post("/")
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
        raise HTTPException(status_code=400, detail=str(e))


@user_router.get("/")
async def get_all_users(
    _: bool = Depends(require_admin),
    user_service: UserService = Depends(get_user_service)
):
    """Get all users (admin only)"""
    users = await user_service.get_all_users()
    return users


@user_router.get("/me")
async def get_user_info(
    user: dict = Depends(get_current_user),
):
    """Get the current user's information"""
    if os.getenv("VITE_PUBLIC_POSTHOG_KEY"):
        telemetry = user.copy()
        telemetry["$current_url"] = OIDC_CONFIG["frontend_url"]
        posthog.identify(distinct_id=user["id"], properties=telemetry)
        
    return user


@user_router.get("/count")
async def get_user_count(
    _: bool = Depends(require_admin),
):
    """Get the number of active sessions (admin only)"""
    session_count = len(redis_client.keys("session:*"))
    return {"active_sessions": session_count }


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