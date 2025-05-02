"""
Template pad repository for database operations related to template pads.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete

from ..models import TemplatePadModel

class TemplatePadRepository:
    """Repository for template pad-related database operations"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the repository with a database session"""
        self.session = session
    
    async def create(self, name: str, display_name: str, data: Dict[str, Any]) -> TemplatePadModel:
        """Create a new template pad"""
        template_pad = TemplatePadModel(name=name, display_name=display_name, data=data)
        self.session.add(template_pad)
        await self.session.commit()
        await self.session.refresh(template_pad)
        return template_pad
    
    async def get_by_id(self, template_id: UUID) -> Optional[TemplatePadModel]:
        """Get a template pad by ID"""
        stmt = select(TemplatePadModel).where(TemplatePadModel.id == template_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_by_name(self, name: str) -> Optional[TemplatePadModel]:
        """Get a template pad by name"""
        stmt = select(TemplatePadModel).where(TemplatePadModel.name == name)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_all(self) -> List[TemplatePadModel]:
        """Get all template pads"""
        stmt = select(TemplatePadModel).order_by(TemplatePadModel.display_name)
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def update(self, template_id: UUID, data: Dict[str, Any]) -> Optional[TemplatePadModel]:
        """Update a template pad"""
        stmt = update(TemplatePadModel).where(TemplatePadModel.id == template_id).values(**data).returning(TemplatePadModel)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalars().first()
    
    async def update_data(self, template_id: UUID, template_data: Dict[str, Any]) -> Optional[TemplatePadModel]:
        """Update just the data field of a template pad"""
        return await self.update(template_id, {"data": template_data})
    
    async def delete(self, template_id: UUID) -> bool:
        """Delete a template pad"""
        stmt = delete(TemplatePadModel).where(TemplatePadModel.id == template_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0
