from uuid import UUID
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Request

from dependencies import UserSession, require_auth
from database import get_pad_service, get_backup_service, get_template_pad_service
from database.service import PadService, BackupService, TemplatePadService
from config import MAX_BACKUPS_PER_USER, MIN_INTERVAL_MINUTES, DEFAULT_PAD_NAME, DEFAULT_TEMPLATE_NAME
pad_router = APIRouter()


@pad_router.post("")
async def save_canvas(
    data: Dict[str, Any], 
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    backup_service: BackupService = Depends(get_backup_service),
):
    """Save canvas data for the authenticated user"""
    try:
        # Check if user already has a pad
        user_pads = await pad_service.get_pads_by_owner(user.id)
        
        if not user_pads:
            # Create a new pad if user doesn't have one
            pad = await pad_service.create_pad(
                owner_id=user.id,
                display_name=DEFAULT_PAD_NAME,
                data=data
            )
        else:
            # Update existing pad
            pad = user_pads[0]  # Use the first pad (assuming one pad per user for now)
            await pad_service.update_pad_data(pad["id"], data)
            
        # Create a backup only if needed (if none exist or latest is > 5 min old)
        await backup_service.create_backup_if_needed(
            source_id=pad["id"], 
            data=data,
            min_interval_minutes=MIN_INTERVAL_MINUTES,
            max_backups=MAX_BACKUPS_PER_USER
        )
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save canvas data: {str(e)}")


@pad_router.get("")
async def get_canvas(
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service),
    backup_service: BackupService = Depends(get_backup_service)
):
    """Get canvas data for the authenticated user"""
    try:
        # Get user's pads
        user_pads = await pad_service.get_pads_by_owner(user.id)
        
        if not user_pads:
            # Return default canvas if user doesn't have a pad
            return await create_pad_from_template(
                name=DEFAULT_TEMPLATE_NAME, 
                display_name=DEFAULT_PAD_NAME, 
                user=user, 
                pad_service=pad_service, 
                template_pad_service=template_pad_service,
                backup_service=backup_service
            )
        
        # Return the first pad's data (assuming one pad per user for now)
        return user_pads[0]["data"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get canvas data: {str(e)}")


@pad_router.post("/from-template/{name}")
async def create_pad_from_template(
    name: str,
    display_name: str = DEFAULT_PAD_NAME,
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service),
    backup_service: BackupService = Depends(get_backup_service)
):
    """Create a new pad from a template"""

    try:
        # Get the template
        template = await template_pad_service.get_template_by_name(name)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Create a new pad using the template data
        pad = await pad_service.create_pad(
            owner_id=user.id,
            display_name=display_name,
            data=template["data"]
        )
        
        # Create an initial backup for the new pad
        await backup_service.create_backup_if_needed(
            source_id=pad["id"],
            data=template["data"],
            min_interval_minutes=0,  # Always create initial backup
            max_backups=MAX_BACKUPS_PER_USER
        )
        
        return pad
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create pad from template: {str(e)}")


@pad_router.get("/recent")
async def get_recent_canvas_backups(
    limit: int = MAX_BACKUPS_PER_USER, 
    user: UserSession = Depends(require_auth),
    backup_service: BackupService = Depends(get_backup_service)
):
    """Get the most recent canvas backups for the authenticated user"""
    # Limit the number of backups to the maximum configured value
    if limit > MAX_BACKUPS_PER_USER:
        limit = MAX_BACKUPS_PER_USER
    
    try:
        # Get backups directly with a single query
        backups_data = await backup_service.get_backups_by_user(user.id, limit)
        
        # Format backups to match the expected response format
        backups = []
        for backup in backups_data:
            backups.append({
                "id": backup["id"],
                "timestamp": backup["created_at"],
                "data": backup["data"]
            })
        
        return {"backups": backups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get canvas backups: {str(e)}")
