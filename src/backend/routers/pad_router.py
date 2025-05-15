from uuid import UUID
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import UserSession, require_auth
from database.models import PadStore
from database.database import get_session
from domain.pad import Pad

pad_router = APIRouter()

@pad_router.get("/")
async def initialize_pad(
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    # First try to get any existing pads for the user
    existing_pads = await PadStore.get_by_owner(session, user.id)
    
    if existing_pads:
        # User already has pads, load the first one
        pad = await Pad.get_by_id(session, existing_pads[0].id)
       
    else:
        # Create a new pad for first-time user
        pad = await Pad.create(
            session=session,
            owner_id=user.id,
            display_name="My First Pad"
        )

    pad_dict = pad.to_dict()
    user_app_state = pad_dict["data"]["appState"].get(str(user.id), {})
    pad_dict["data"]["appState"] = user_app_state
    return pad_dict["data"]

@pad_router.post("/new")
async def create_new_pad(
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Create a new pad for the authenticated user"""
    try:
        pad = await Pad.create(
            session=session,
            owner_id=user.id,
            display_name="New Pad"
        )
        return pad.to_dict()["data"]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create new pad: {str(e)}"
        )

@pad_router.get("/{pad_id}")
async def get_pad(
    pad_id: UUID,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Get a specific pad for the authenticated user"""
    try:
        # Get the pad using the domain class
        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            raise HTTPException(
                status_code=404,
                detail="Pad not found"
            )
            
        # Check if the user owns the pad
        if pad.owner_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this pad"
            )
            
        pad_dict = pad.to_dict()
        # Get only this user's appState
        user_app_state = pad_dict["data"]["appState"].get(str(user.id), {})
        pad_dict["data"]["appState"] = user_app_state
        return pad_dict["data"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get pad: {str(e)}"
        )

