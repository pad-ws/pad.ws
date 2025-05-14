from typing import Dict, Any, Optional, List, TYPE_CHECKING
from uuid import UUID
from datetime import datetime

from sqlalchemy import Column, String, ForeignKey, Index, UUID as SQLUUID, select, update, delete
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped
from sqlalchemy.ext.asyncio import AsyncSession

from .base_model import Base, BaseModel, SCHEMA_NAME

if TYPE_CHECKING:
    from .user_model import UserStore

class PadStore(Base, BaseModel):
    """Combined model and repository for pad storage"""
    __tablename__ = "pads"
    __table_args__ = (
        Index("ix_pads_owner_id", "owner_id"),
        Index("ix_pads_display_name", "display_name"),
        {"schema": SCHEMA_NAME}
    )

    # Pad-specific fields
    owner_id = Column(
        SQLUUID(as_uuid=True), 
        ForeignKey(f"{SCHEMA_NAME}.users.id", ondelete="CASCADE"), 
        nullable=False
    )
    display_name = Column(String(100), nullable=False)
    data = Column(JSONB, nullable=False)
    
    # Relationships
    owner: Mapped["UserStore"] = relationship("UserStore", back_populates="pads")

    def __repr__(self) -> str:
        return f"<PadStore(id='{self.id}', display_name='{self.display_name}')>"

    @classmethod
    async def create_pad(
        cls,
        session: AsyncSession,
        owner_id: UUID,
        display_name: str,
        data: Dict[str, Any]
    ) -> 'PadStore':
        """Create a new pad"""
        pad = cls(owner_id=owner_id, display_name=display_name, data=data)
        session.add(pad)
        await session.commit()
        await session.refresh(pad)
        return pad

    @classmethod
    async def get_by_id(cls, session: AsyncSession, pad_id: UUID) -> Optional['PadStore']:
        """Get a pad by ID"""
        stmt = select(cls).where(cls.id == pad_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @classmethod
    async def get_by_owner(cls, session: AsyncSession, owner_id: UUID) -> List['PadStore']:
        """Get all pads for a specific owner"""
        stmt = select(cls).where(cls.owner_id == owner_id).order_by(cls.created_at)
        result = await session.execute(stmt)
        return result.scalars().all()

    async def save(self, session: AsyncSession) -> 'PadStore':
        """Save the current pad state"""
        if self.id is None:
            session.add(self)
        await session.commit()
        await session.refresh(self)
        return self

    async def update_data(self, session: AsyncSession, data: Dict[str, Any]) -> 'PadStore':
        """Update the pad's data"""
        self.data = data
        self.updated_at = datetime.now()
        return await self.save(session)

    async def delete(self, session: AsyncSession) -> bool:
        """Delete the pad"""
        stmt = delete(self.__class__).where(self.__class__.id == self.id)
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            "id": str(self.id),
            "owner_id": str(self.owner_id),
            "display_name": self.display_name,
            "data": self.data,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
