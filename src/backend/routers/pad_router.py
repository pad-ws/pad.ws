from uuid import UUID
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import UserSession, require_auth
from database.models import PadStore
from database.database import get_session
from domain.pad import Pad

pad_router = APIRouter()

@pad_router.get("/test")
async def test(
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    # Create a test pad
    test_pad = await PadStore.create_pad(
        session=session,
        owner_id=user.id,
        display_name="Test Pad",
        data={"content": "This is a test pad"}
    )
    
    # Load the pad from database using its ID
    loaded_pad = await PadStore.get_by_id(session, test_pad.id)
    
    if not loaded_pad:
        raise HTTPException(
            status_code=500,
            detail="Failed to load created pad"
        )
    
    return {
        "created_pad": test_pad.to_dict(),
        "loaded_pad": loaded_pad.to_dict()
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

