"""
User repository for database operations related to users.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete

from ..models import UserModel

class UserRepository:
    """Repository for user-related database operations"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the repository with a database session"""
        self.session = session
    
    async def create(self, user_id: UUID, username: str, email: str, email_verified: bool = False, 
                    name: str = None, given_name: str = None, family_name: str = None, 
                    roles: list = None) -> UserModel:
        """Create a new user with specified ID and optional fields"""
        user = UserModel(
            id=user_id, 
            username=username, 
            email=email,
            email_verified=email_verified,
            name=name,
            given_name=given_name,
            family_name=family_name,
            roles=roles or []
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user
    
    async def get_by_id(self, user_id: UUID) -> Optional[UserModel]:
        """Get a user by ID"""
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_by_username(self, username: str) -> Optional[UserModel]:
        """Get a user by username"""
        stmt = select(UserModel).where(UserModel.username == username)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_by_email(self, email: str) -> Optional[UserModel]:
        """Get a user by email"""
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_all(self) -> List[UserModel]:
        """Get all users"""
        stmt = select(UserModel)
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def update(self, user_id: UUID, data: Dict[str, Any]) -> Optional[UserModel]:
        """Update a user"""
        stmt = update(UserModel).where(UserModel.id == user_id).values(**data).returning(UserModel)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalars().first()
    
    async def delete(self, user_id: UUID) -> bool:
        """Delete a user"""
        stmt = delete(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0
