"""
Pad repository for database operations related to pads.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete

from ..models import PadModel

class PadRepository:
    """Repository for pad-related database operations"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the repository with a database session"""
        self.session = session
    
    async def create(self, owner_id: UUID, display_name: str, data: Dict[str, Any]) -> PadModel:
        """Create a new pad"""
        pad = PadModel(owner_id=owner_id, display_name=display_name, data=data)
        self.session.add(pad)
        await self.session.commit()
        await self.session.refresh(pad)
        return pad
    
    async def get_by_id(self, pad_id: UUID) -> Optional[PadModel]:
        """Get a pad by ID"""
        stmt = select(PadModel).where(PadModel.id == pad_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_by_owner(self, owner_id: UUID) -> List[PadModel]:
        """Get all pads for a specific owner, sorted by created_at timestamp"""
        stmt = select(PadModel).where(PadModel.owner_id == owner_id).order_by(PadModel.created_at)
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def get_by_name(self, owner_id: UUID, display_name: str) -> Optional[PadModel]:
        """Get a pad by owner and display name"""
        stmt = select(PadModel).where(
            PadModel.owner_id == owner_id,
            PadModel.display_name == display_name
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def update(self, pad_id: UUID, data: Dict[str, Any]) -> Optional[PadModel]:
        """Update a pad"""
        stmt = update(PadModel).where(PadModel.id == pad_id).values(**data).returning(PadModel)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalars().first()
    
    async def update_data(self, pad_id: UUID, pad_data: Dict[str, Any]) -> Optional[PadModel]:
        """Update just the data field of a pad"""
        return await self.update(pad_id, {"data": pad_data})
    
    async def delete(self, pad_id: UUID) -> bool:
        """Delete a pad"""
        stmt = delete(PadModel).where(PadModel.id == pad_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0
