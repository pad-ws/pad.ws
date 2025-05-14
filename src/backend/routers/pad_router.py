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
        return {
            "pad": pad.to_dict(),
            "is_new": False
        }
    else:
        # Create a new pad for first-time user
        new_pad = await Pad.create(
            session=session,
            owner_id=user.id,
            display_name="My First Pad",
            data={"content": "Welcome to your first pad!"}
        )
        
        return {
            "pad": new_pad.to_dict(),
            "is_new": True
        }



@pad_router.get("/{pad_id}")
async def get_pad(
    pad_id: UUID,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(lambda: AsyncSession())
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
            
        return pad.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get pad: {str(e)}"
        )

