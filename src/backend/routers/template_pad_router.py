from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends

from dependencies import UserSession, require_auth, require_admin
from database import get_template_pad_service
from database.service import TemplatePadService

template_pad_router = APIRouter()


@template_pad_router.post("")
async def create_template_pad(
    data: Dict[str, Any],
    name: str,
    display_name: str,
    _: bool = Depends(require_admin),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Create a new template pad (admin only)"""
    try:
        template_pad = await template_pad_service.create_template(
            name=name,
            display_name=display_name,
            data=data
        )
        return template_pad
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@template_pad_router.get("")
async def get_all_template_pads(
    _: bool = Depends(require_admin),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Get all template pads"""
    try:
        template_pads = await template_pad_service.get_all_templates()
        return template_pads
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get template pads: {str(e)}")


@template_pad_router.get("/{name}")
async def get_template_pad(
    name: str,
    _: UserSession = Depends(require_auth),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Get a specific template pad by name"""
    template_pad = await template_pad_service.get_template_by_name(name)
    if not template_pad:
        raise HTTPException(status_code=404, detail="Template pad not found")
    
    return template_pad


@template_pad_router.put("/{name}")
async def update_template_pad(
    name: str,
    data: Dict[str, Any],
    _: bool = Depends(require_admin),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Update a template pad (admin only)"""
    try:
        updated_template = await template_pad_service.update_template(name, data)
        if not updated_template:
            raise HTTPException(status_code=404, detail="Template pad not found")
        
        return updated_template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@template_pad_router.put("/{name}/data")
async def update_template_pad_data(
    name: str,
    data: Dict[str, Any],
    _: bool = Depends(require_admin),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Update just the data field of a template pad (admin only)"""
    try:
        updated_template = await template_pad_service.update_template_data(name, data)
        if not updated_template:
            raise HTTPException(status_code=404, detail="Template pad not found")
        
        return updated_template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@template_pad_router.delete("/{name}")
async def delete_template_pad(
    name: str,
    _: bool = Depends(require_admin),
    template_pad_service: TemplatePadService = Depends(get_template_pad_service)
):
    """Delete a template pad (admin only)"""
    try:
        success = await template_pad_service.delete_template(name)
        if not success:
            raise HTTPException(status_code=404, detail="Template pad not found")
        
        return {"status": "success", "message": "Template pad deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
