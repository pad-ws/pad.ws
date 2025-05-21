from typing import Dict, Any, Optional, List, TYPE_CHECKING
from uuid import UUID
from datetime import datetime

from sqlalchemy import Column, String, ForeignKey, Index, UUID as SQLUUID, select, update, delete, ARRAY
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
    sharing_policy = Column(String(20), nullable=False, default="private")
    whitelist = Column(ARRAY(SQLUUID(as_uuid=True)), nullable=True, default=[])
    
    # Relationships
    owner: Mapped["UserStore"] = relationship("UserStore", back_populates="pads")

    def __repr__(self) -> str:
        return f"<PadStore(id='{self.id}', display_name='{self.display_name}', sharing_policy='{self.sharing_policy}')>"

    @classmethod
    async def create_pad(
        cls,
        session: AsyncSession,
        owner_id: UUID,
        display_name: str,
        data: Dict[str, Any],
        sharing_policy: str = "private",
        whitelist: List[UUID] = []
    ) -> 'PadStore':
        """Create a new pad"""
        pad = cls(
            owner_id=owner_id,
            display_name=display_name,
            data=data,
            sharing_policy=sharing_policy,
            whitelist=whitelist
        )
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

    async def save(self, session: AsyncSession) -> 'PadStore':
        """Update the pad in the database"""
        self.updated_at = datetime.now()
        try:
            # Just execute the update statement without adding to session
            stmt = update(self.__class__).where(self.__class__.id == self.id).values(
                owner_id=self.owner_id,
                display_name=self.display_name,
                data=self.data,
                sharing_policy=self.sharing_policy,
                whitelist=self.whitelist,
                updated_at=self.updated_at
            )
            await session.execute(stmt)
            await session.commit()
            
            # After update, get the fresh object from the database
            refreshed = await self.get_by_id(session, self.id)
            if refreshed:
                # Update this object's attributes from the database
                self.owner_id = refreshed.owner_id
                self.display_name = refreshed.display_name
                self.data = refreshed.data
                self.sharing_policy = refreshed.sharing_policy
                self.whitelist = refreshed.whitelist
                self.created_at = refreshed.created_at
                self.updated_at = refreshed.updated_at
                
            return self
        except Exception as e:
            print(f"Error saving pad {self.id}: {str(e)}", flush=True)
            raise e

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
            "sharing_policy": self.sharing_policy,
            "whitelist": [str(uid) for uid in self.whitelist] if self.whitelist else [],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
