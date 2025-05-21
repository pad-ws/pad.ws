from uuid import UUID
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from dependencies import UserSession, require_auth
from database.models import PadStore
from database.database import get_session
from domain.pad import Pad

pad_router = APIRouter()

# Request models
class RenameRequest(BaseModel):
    display_name: str

class SharingPolicyUpdate(BaseModel):
    policy: str  # "private", "whitelist", or "public"

class WhitelistUpdate(BaseModel):
    user_id: UUID

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
            display_name="New pad"
        )
        return pad.to_dict()
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
        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            raise HTTPException(
                status_code=404,
                detail="Pad not found"
            )
            
        # Check access permissions
        if not pad.can_access(user.id):
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

@pad_router.put("/{pad_id}/rename")
async def rename_pad(
    pad_id: UUID,
    rename_data: RenameRequest,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Rename a pad for the authenticated user"""
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
                detail="Not authorized to rename this pad"
            )
        
        # Rename the pad    
        await pad.rename(session, rename_data.display_name)
        return pad.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to rename pad: {str(e)}"
        )

@pad_router.delete("/{pad_id}")
async def delete_pad(
    pad_id: UUID,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Delete a pad for the authenticated user"""
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
                detail="Not authorized to delete this pad"
            )
        
        # Delete the pad    
        success = await pad.delete(session)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete pad"
            )
        
        return {"success": True, "message": "Pad deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete pad: {str(e)}"
        )

@pad_router.put("/{pad_id}/sharing")
async def update_sharing_policy(
    pad_id: UUID,
    policy_update: SharingPolicyUpdate,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Update the sharing policy of a pad"""
    try:
        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            raise HTTPException(
                status_code=404,
                detail="Pad not found"
            )
            
        if pad.owner_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify sharing settings"
            )
            
        await pad.set_sharing_policy(session, policy_update.policy)
        return pad.to_dict()
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update sharing policy: {str(e)}"
        )

@pad_router.post("/{pad_id}/whitelist")
async def add_to_whitelist(
    pad_id: UUID,
    whitelist_update: WhitelistUpdate,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Add a user to the pad's whitelist"""
    try:
        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            raise HTTPException(
                status_code=404,
                detail="Pad not found"
            )
            
        if pad.owner_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify whitelist"
            )
            
        await pad.add_to_whitelist(session, whitelist_update.user_id)
        return pad.to_dict()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add user to whitelist: {str(e)}"
        )

@pad_router.delete("/{pad_id}/whitelist/{user_id}")
async def remove_from_whitelist(
    pad_id: UUID,
    user_id: UUID,
    user: UserSession = Depends(require_auth),
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """Remove a user from the pad's whitelist"""
    try:
        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            raise HTTPException(
                status_code=404,
                detail="Pad not found"
            )
            
        if pad.owner_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify whitelist"
            )
            
        await pad.remove_from_whitelist(session, user_id)
        return pad.to_dict()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove user from whitelist: {str(e)}"
        )
