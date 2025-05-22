from typing import List, Optional, Dict, Any, TYPE_CHECKING
from uuid import UUID
from datetime import datetime

from sqlalchemy import Column, Index, String, UUID as SQLUUID, Boolean, select, update, delete, func, ARRAY, and_, or_, text
from sqlalchemy.dialects.postgresql import JSONB, array
from sqlalchemy.orm import relationship, Mapped
from sqlalchemy.ext.asyncio import AsyncSession

from .base_model import Base, BaseModel, SCHEMA_NAME

if TYPE_CHECKING:
    from .pad_model import PadStore

class UserStore(Base, BaseModel):
    """Combined model and repository for user storage"""
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_username", "username"),
        Index("ix_users_email", "email"),
        {"schema": SCHEMA_NAME}
    )

    # Override the default id column to use Keycloak's UUID
    id = Column(SQLUUID(as_uuid=True), primary_key=True)

    # User-specific fields
    username = Column(String(254), nullable=False, unique=True)
    email = Column(String(254), nullable=False, unique=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    name = Column(String(254), nullable=True)
    given_name = Column(String(254), nullable=True)
    family_name = Column(String(254), nullable=True)
    roles = Column(JSONB, nullable=False, default=[])
    open_pads = Column(ARRAY(SQLUUID(as_uuid=True)), nullable=False, default=[])
    
    # Relationships
    pads: Mapped[List["PadStore"]] = relationship(
        "PadStore", 
        back_populates="owner", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<UserStore(id='{self.id}', username='{self.username}', email='{self.email}')>"

    @classmethod
    async def create_user(
        cls,
        session: AsyncSession,
        id: UUID,
        username: str,
        email: str,
        email_verified: bool = False,
        name: Optional[str] = None,
        given_name: Optional[str] = None,
        family_name: Optional[str] = None,
        roles: List[str] = None,
        open_pads: List[UUID] = None
    ) -> 'UserStore':
        """Create a new user"""
        user = cls(
            id=id,
            username=username,
            email=email,
            email_verified=email_verified,
            name=name,
            given_name=given_name,
            family_name=family_name,
            roles=roles or [],
            open_pads=open_pads or []
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    @classmethod
    async def get_by_id(cls, session: AsyncSession, user_id: UUID) -> Optional['UserStore']:
        """Get a user by ID"""
        stmt = select(cls).where(cls.id == user_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @classmethod
    async def get_by_username(cls, session: AsyncSession, username: str) -> Optional['UserStore']:
        """Get a user by username"""
        stmt = select(cls).where(cls.username == username)
        result = await session.execute(stmt)
        return result.scalars().first()

    @classmethod
    async def get_by_email(cls, session: AsyncSession, email: str) -> Optional['UserStore']:
        """Get a user by email"""
        stmt = select(cls).where(cls.email == email)
        result = await session.execute(stmt)
        return result.scalars().first()

    @classmethod
    async def get_all(cls, session: AsyncSession) -> List['UserStore']:
        """Get all users"""
        stmt = select(cls)
        result = await session.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def get_open_pads(cls, session: AsyncSession, user_id: UUID) -> List[Dict[str, Any]]:
        """Get all pad IDs that the user has access to (both open pads and owned pads)"""
        from .pad_model import PadStore  # Import here to avoid circular imports
        
        # Get the user to access their open_pads
        user = await cls.get_by_id(session, user_id)
        if not user:
            return []
            
        # Get both open_pads and owned pad IDs
        open_pad_ids = user.open_pads or []
        owned_pad_ids = [pad.id for pad in user.pads]
        
        # Combine and deduplicate pad IDs
        all_pad_ids = list(set(open_pad_ids + owned_pad_ids))
        
        stmt = select(
            PadStore.id,
            PadStore.owner_id,
            PadStore.display_name,
            PadStore.created_at,
            PadStore.updated_at,
            PadStore.sharing_policy
        ).where(
            PadStore.id.in_(all_pad_ids)
        ).order_by(PadStore.created_at)
        
        result = await session.execute(stmt)
        pads = result.all()
        
        return [{
            "id": str(pad.id),
            "owner_id": str(pad.owner_id),
            "display_name": pad.display_name,
            "created_at": pad.created_at.isoformat(),
            "updated_at": pad.updated_at.isoformat(),
            "sharing_policy": pad.sharing_policy
        } for pad in pads]

    async def save(self, session: AsyncSession) -> 'UserStore':
        """Save the current user state"""
        if self.id is None:
            session.add(self)
        await session.commit()
        await session.refresh(self)
        return self

    async def update(self, session: AsyncSession, data: Dict[str, Any]) -> 'UserStore':
        """Update user data"""
        for key, value in data.items():
            setattr(self, key, value)
        self.updated_at = datetime.now()
        return await self.save(session)

    async def delete(self, session: AsyncSession) -> bool:
        """Delete the user"""
        stmt = delete(self.__class__).where(self.__class__.id == self.id)
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            "id": str(self.id),
            "username": self.username,
            "email": self.email,
            "email_verified": self.email_verified,
            "name": self.name,
            "given_name": self.given_name,
            "family_name": self.family_name,
            "roles": self.roles,
            "open_pads": [str(pid) for pid in self.open_pads] if self.open_pads else [],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

    async def remove_open_pad(self, session: AsyncSession, pad_id: UUID) -> 'UserStore':
        """Remove a pad from the user's open_pads list"""
        if pad_id in self.open_pads:
            self.open_pads.remove(pad_id)
            await self.save(session)
        return self
