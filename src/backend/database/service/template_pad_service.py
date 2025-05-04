"""
Template pad service for business logic related to template pads.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..repository import TemplatePadRepository

class TemplatePadService:
    """Service for template pad-related business logic"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the service with a database session"""
        self.session = session
        self.repository = TemplatePadRepository(session)
    
    async def create_template(self, name: str, display_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new template pad"""
        # Validate input
        if not name:
            raise ValueError("Name is required")
        
        if not display_name:
            raise ValueError("Display name is required")
        
        if not data:
            raise ValueError("Template data is required")
        
        # Check if template with same name already exists
        existing_template = await self.repository.get_by_name(name)
        if existing_template:
            raise ValueError(f"Template with name '{name}' already exists")
        
        # Create template pad
        template_pad = await self.repository.create(name, display_name, data)
        return template_pad.to_dict()
    
    async def get_template(self, template_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a template pad by ID"""
        template_pad = await self.repository.get_by_id(template_id)
        return template_pad.to_dict() if template_pad else None
    
    async def get_template_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get a template pad by name"""
        template_pad = await self.repository.get_by_name(name)
        return template_pad.to_dict() if template_pad else None
    
    async def get_all_templates(self) -> List[Dict[str, Any]]:
        """Get all template pads"""
        template_pads = await self.repository.get_all()
        return [template_pad.to_dict() for template_pad in template_pads]
    
    async def update_template(self, name: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a template pad"""
        # Get the template pad to check if it exists
        template_pad = await self.repository.get_by_name(name)
        if not template_pad:
            raise ValueError(f"Template pad with name '{name}' does not exist")
        
        # Validate name and display_name if they're being updated
        if 'name' in data and not data['name']:
            raise ValueError("Name cannot be empty")
        
        if 'display_name' in data and not data['display_name']:
            raise ValueError("Display name cannot be empty")
        
        # Check if new name already exists (if being updated)
        if 'name' in data and data['name'] != template_pad.name:
            existing_template = await self.repository.get_by_name(data['name'])
            if existing_template:
                raise ValueError(f"Template with name '{data['name']}' already exists")
        
        # Update template pad
        updated_template = await self.repository.update(name, data)
        return updated_template.to_dict() if updated_template else None
    
    async def update_template_data(self, name: str, template_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update just the data field of a template pad"""
        # Get the template pad to check if it exists
        template_pad = await self.repository.get_by_name(name)
        if not template_pad:
            raise ValueError(f"Template pad with name '{name}' does not exist")
        
        # Update template pad data
        updated_template = await self.repository.update_data(name, template_data)
        return updated_template.to_dict() if updated_template else None
    
    async def delete_template(self, name: str) -> bool:
        """Delete a template pad"""
        # Get the template pad to check if it exists
        template_pad = await self.repository.get_by_name(name)
        if not template_pad:
            raise ValueError(f"Template pad with name '{name}' does not exist")
        
        return await self.repository.delete(name)
