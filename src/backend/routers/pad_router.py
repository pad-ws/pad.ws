from uuid import UUID
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse

from dependencies import UserSession, require_auth
from database import get_pad_service, get_backup_service, get_template_pad_service
from database.service import PadService, BackupService, TemplatePadService
from config import MAX_BACKUPS_PER_USER, MIN_INTERVAL_MINUTES, DEFAULT_PAD_NAME, DEFAULT_TEMPLATE_NAME
pad_router = APIRouter()

def ensure_pad_metadata(data: Dict[str, Any], pad_id: str, display_name: str) -> Dict[str, Any]:
    """
    Ensure the pad metadata (uniqueId and displayName) is set in the data.
    
    Args:
        data: The pad data to modify
        pad_id: The pad ID to set as uniqueId
        display_name: The display name to set
        
    Returns:
        The modified data
    """
    # Ensure the appState and pad objects exist
    if "appState" not in data:
        data["appState"] = {}
    if "pad" not in data["appState"]:
        data["appState"]["pad"] = {}
        
    # Set the uniqueId to match the database ID
    data["appState"]["pad"]["uniqueId"] = str(pad_id)
    data["appState"]["pad"]["displayName"] = display_name
    
    return data


@pad_router.post("")
async def update_first_pad(
    data: Dict[str, Any],
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    backup_service: BackupService = Depends(get_backup_service),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service),
):
    """
    Update the first pad for the authenticated user.
    
    This is a backward compatibility endpoint that assumes the user is trying to update their first pad.
    It will be deprecated in the future. Please use POST /api/pad/{pad_id} instead.
    """
    try:
        # Get user's pads
        user_pads = await pad_service.get_pads_by_owner(user.id)
        
        # If user has no pads, create a default one
        if not user_pads:
            new_pad = await create_pad_from_template(
                name=DEFAULT_TEMPLATE_NAME, 
                display_name=DEFAULT_PAD_NAME, 
                user=user, 
                pad_service=pad_service, 
                template_pad_service=template_pad_service,
                backup_service=backup_service
            )
            pad_id = new_pad["id"]
        else:
            # Use the first pad
            pad_id = user_pads[0]["id"]
        
        # Get the pad to verify ownership
        pad = await pad_service.get_pad(pad_id)
        
        if not pad:
            raise HTTPException(status_code=404, detail="Pad not found")
            
        # Verify the user owns this pad
        if str(pad["owner_id"]) != str(user.id):
            raise HTTPException(status_code=403, detail="You don't have permission to update this pad")
        
        # Ensure the uniqueId and displayName are set in the data
        data = ensure_pad_metadata(data, str(pad_id), pad["display_name"])
        
        # Update the pad
        await pad_service.update_pad_data(pad_id, data)
        
        # Create a backup if needed
        await backup_service.create_backup_if_needed(
            source_id=pad_id, 
            data=data,
            min_interval_minutes=MIN_INTERVAL_MINUTES,
            max_backups=MAX_BACKUPS_PER_USER
        )
        
        # Return success with deprecation notice
        return JSONResponse(
            content={"status": "success", "message": "This endpoint is deprecated. Please use POST /api/pad/{pad_id} instead."},
            headers={"Deprecation": "true", "Sunset": "Mon, 10 May 2025 00:00:00 GMT"}
        )
    except Exception as e:
        print(f"Error updating pad: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update pad: {str(e)}")


@pad_router.post("/{pad_id}")
async def update_specific_pad(
    pad_id: UUID,
    data: Dict[str, Any], 
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    backup_service: BackupService = Depends(get_backup_service),
):
    """Update a specific pad's data for the authenticated user"""
    try:
        # Get the pad to verify ownership
        pad = await pad_service.get_pad(pad_id)
        
        if not pad:
            raise HTTPException(status_code=404, detail="Pad not found")
            
        # Verify the user owns this pad
        if str(pad["owner_id"]) != str(user.id):
            raise HTTPException(status_code=403, detail="You don't have permission to update this pad")
        
        # Ensure the uniqueId and displayName are set in the data
        data = ensure_pad_metadata(data, str(pad_id), pad["display_name"])
        
        # Update the pad
        await pad_service.update_pad_data(pad_id, data)
        
        # Create a backup if needed
        await backup_service.create_backup_if_needed(
            source_id=pad_id, 
            data=data,
            min_interval_minutes=MIN_INTERVAL_MINUTES,
            max_backups=MAX_BACKUPS_PER_USER
        )
        
        return {"status": "success"}
    except Exception as e:
        print(f"Error updating pad: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update pad: {str(e)}")


@pad_router.patch("/{pad_id}")
async def rename_pad(
    pad_id: UUID,
    data: Dict[str, str],
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
):
    """Rename a pad for the authenticated user"""
    try:
        # Get the pad to verify ownership
        pad = await pad_service.get_pad(pad_id)
        
        if not pad:
            raise HTTPException(status_code=404, detail="Pad not found")
            
        # Verify the user owns this pad
        if str(pad["owner_id"]) != str(user.id):
            raise HTTPException(status_code=403, detail="You don't have permission to rename this pad")
        
        # Check if display_name is provided
        if "display_name" not in data:
            raise HTTPException(status_code=400, detail="display_name is required")
        
        # Update the pad's display name
        update_data = {"display_name": data["display_name"]}
        updated_pad = await pad_service.update_pad(pad_id, update_data)
        
        return {"status": "success", "pad": updated_pad}
    except ValueError as e:
        print(f"Error renaming pad: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error renaming pad: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to rename pad: {str(e)}")


@pad_router.delete("/{pad_id}")
async def delete_pad(
    pad_id: UUID,
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
):
    """Delete a pad for the authenticated user"""
    try:
        # Get the pad to verify ownership
        pad = await pad_service.get_pad(pad_id)
        
        if not pad:
            raise HTTPException(status_code=404, detail="Pad not found")
            
        # Verify the user owns this pad
        if str(pad["owner_id"]) != str(user.id):
            raise HTTPException(status_code=403, detail="You don't have permission to delete this pad")
        
        # Delete the pad
        success = await pad_service.delete_pad(pad_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete pad")
        
        return {"status": "success"}
    except ValueError as e:
        print(f"Error deleting pad: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error deleting pad: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete pad: {str(e)}")


@pad_router.get("")
async def get_all_pads(
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service),
    backup_service: BackupService = Depends(get_backup_service)
):
    """Get all pads for the authenticated user"""
    try:
        # Get user's pads
        user_pads = await pad_service.get_pads_by_owner(user.id)
        
        if not user_pads:
            # Create a default pad if user doesn't have any
            new_pad = await create_pad_from_template(
                name=DEFAULT_TEMPLATE_NAME, 
                display_name=DEFAULT_PAD_NAME, 
                user=user, 
                pad_service=pad_service, 
                template_pad_service=template_pad_service,
                backup_service=backup_service
            )
            
            # Return the new pad in a list
            return [new_pad]
        
        # Ensure each pad's data has the uniqueId and displayName set
        for pad in user_pads:
            pad_data = pad["data"]
            
            # Ensure the uniqueId and displayName are set in the data
            pad_data = ensure_pad_metadata(pad_data, str(pad["id"]), pad["display_name"])
        
        # Return all pads
        return user_pads
    except Exception as e:
        print(f"Error getting pad data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pad data: {str(e)}")


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
        
        # Get the template data
        template_data = template["data"]
        
        # Before creating, ensure the pad object exists in the data
        template_data = ensure_pad_metadata(template_data, "", "")
        
        # Create a new pad using the template data
        pad = await pad_service.create_pad(
            owner_id=user.id,
            display_name=display_name,
            data=template_data,
            user_session=user
        )
        
        # Set the uniqueId and displayName to match the database ID and display name
        template_data = ensure_pad_metadata(template_data, str(pad["id"]), display_name)
        
        # Update the pad with the modified data
        await pad_service.update_pad_data(pad["id"], template_data)
        
        # Create an initial backup for the new pad
        await backup_service.create_backup_if_needed(
            source_id=pad["id"],
            data=template_data,
            min_interval_minutes=0,  # Always create initial backup
            max_backups=MAX_BACKUPS_PER_USER
        )
        
        return pad
    except ValueError as e:
        print(f"Error creating pad from template: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error creating pad from template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create pad from template: {str(e)}")


@pad_router.get("/{pad_id}/backups")
async def get_pad_backups(
    pad_id: UUID,
    limit: int = MAX_BACKUPS_PER_USER, 
    user: UserSession = Depends(require_auth),
    pad_service: PadService = Depends(get_pad_service),
    backup_service: BackupService = Depends(get_backup_service)
):
    """Get backups for a specific pad"""
    # Limit the number of backups to the maximum configured value
    if limit > MAX_BACKUPS_PER_USER:
        limit = MAX_BACKUPS_PER_USER
    
    try:
        # Get the pad to verify ownership
        pad = await pad_service.get_pad(pad_id)
        
        if not pad:
            raise HTTPException(status_code=404, detail="Pad not found")
            
        # Verify the user owns this pad
        if str(pad["owner_id"]) != str(user.id):
            raise HTTPException(status_code=403, detail="You don't have permission to access this pad's backups")
        
        # Get backups for this specific pad
        backups_data = await backup_service.get_backups_by_source(pad_id)
        
        # Limit the number of backups if needed
        if len(backups_data) > limit:
            backups_data = backups_data[:limit]
        
        # Format backups to match the expected response format
        backups = []
        for backup in backups_data:
            backups.append({
                "id": backup["id"],
                "timestamp": backup["created_at"],
                "data": backup["data"]
            })
        
        return {"backups": backups, "pad_name": pad["display_name"]}
    except Exception as e:
        print(f"Error getting pad backups: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pad backups: {str(e)}")


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
        print(f"Error getting canvas backups: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get canvas backups: {str(e)}")
