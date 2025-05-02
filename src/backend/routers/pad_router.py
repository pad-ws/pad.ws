from uuid import UUID
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Request

from dependencies import UserSession, require_auth
from database import get_pad_service, get_backup_service, get_template_pad_service
from database.service import PadService, BackupService, TemplatePadService

# Default template name to use when a user doesn't have a pad
DEFAULT_TEMPLATE_NAME = "default"

pad_router = APIRouter()

# Constants
MAX_BACKUPS_PER_USER = 10  # Maximum number of backups to keep per user
DEFAULT_PAD_NAME = "Untitled"  # Default name for new pads

@pad_router.post("")
async def save_canvas(
    data: Dict[str, Any], 
    auth: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    backup_service: BackupService = Depends(get_backup_service),
    request: Request = None
):
    """Save canvas data for the authenticated user"""
    # Get user ID from session
    user_id = auth.user_id
    
    try:
        # Check if user already has a pad
        user_pads = await pad_service.get_pads_by_owner(user_id)
        
        if not user_pads:
            # Create a new pad if user doesn't have one
            pad = await pad_service.create_pad(
                owner_id=user_id,
                display_name=DEFAULT_PAD_NAME,
                data=data
            )
            pad_id = UUID(pad["id"])
        else:
            # Update existing pad
            pad = user_pads[0]  # Use the first pad (assuming one pad per user for now)
            pad_id = UUID(pad["id"])
            await pad_service.update_pad_data(pad_id, data)
            
        # Create a backup
        await backup_service.create_backup(pad_id, data)
        
        # Manage backups (keep only the most recent ones)
        await backup_service.manage_backups(pad_id, MAX_BACKUPS_PER_USER)
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save canvas data: {str(e)}")

async def get_default_canvas_data(template_pad_service: TemplatePadService) -> Dict[str, Any]:
    """Get default canvas data from the template pad with name 'default'"""
    try:
        # Get the default template pad
        default_template = await template_pad_service.get_template_by_name(DEFAULT_TEMPLATE_NAME)
        if not default_template:
            # Return empty data if default template doesn't exist
            return {}
        
        # Return the template data
        return default_template["data"]
    except Exception as e:
        # Log the error but return empty data to avoid breaking the application
        print(f"Error getting default canvas data: {str(e)}")
        return {}

@pad_router.get("")
async def get_canvas(
    auth: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Get canvas data for the authenticated user"""
    # Get user ID from session
    user_id = auth.user_id
    
    try:
        # Get user's pads
        user_pads = await pad_service.get_pads_by_owner(user_id)
        
        if not user_pads:
            # Return default canvas if user doesn't have a pad
            return await get_default_canvas_data(template_pad_service)
        
        # Return the first pad's data (assuming one pad per user for now)
        return user_pads[0]["data"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get canvas data: {str(e)}")

@pad_router.post("/from-template/{template_id}")
async def create_pad_from_template(
    template_id: UUID,
    display_name: str = DEFAULT_PAD_NAME,
    auth: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Create a new pad from a template"""
    # Get user ID from session
    user_id = auth.user_id
    
    try:
        # Get the template
        template = await template_pad_service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Create a new pad using the template data
        pad = await pad_service.create_pad(
            owner_id=user_id,
            display_name=display_name,
            data=template["data"]
        )
        
        return pad
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create pad from template: {str(e)}")

@pad_router.get("/recent")
async def get_recent_canvas_backups(
    limit: int = MAX_BACKUPS_PER_USER, 
    auth: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    backup_service: BackupService = Depends(get_backup_service)
):
    """Get the most recent canvas backups for the authenticated user"""
    # Get user ID from session
    user_id = auth.user_id
    
    # Limit the number of backups to the maximum configured value
    if limit > MAX_BACKUPS_PER_USER:
        limit = MAX_BACKUPS_PER_USER
    
    try:
        # Get user's pads
        user_pads = await pad_service.get_pads_by_owner(user_id)
        
        if not user_pads:
            # Return empty list if user doesn't have a pad
            return {"backups": []}
        
        # Get the first pad's ID (assuming one pad per user for now)
        pad_id = UUID(user_pads[0]["id"])
        
        # Get backups for the pad
        backups_data = await backup_service.get_backups_by_source(pad_id)
        
        # Format backups to match the expected response format
        backups = []
        for backup in backups_data[:limit]:
            backups.append({
                "id": backup["id"],
                "timestamp": backup["created_at"],
                "data": backup["data"]
            })
        
        return {"backups": backups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get canvas backups: {str(e)}")
