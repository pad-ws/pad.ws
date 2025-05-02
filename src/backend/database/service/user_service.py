"""
User service for business logic related to users.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..repository import UserRepository

class UserService:
    """Service for user-related business logic"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the service with a database session"""
        self.session = session
        self.repository = UserRepository(session)
    
    async def create_user(self, username: str, email: str) -> Dict[str, Any]:
        """Create a new user"""
        # Validate input
        if not username or not email:
            raise ValueError("Username and email are required")
        
        # Check if username already exists
        existing_user = await self.repository.get_by_username(username)
        if existing_user:
            raise ValueError(f"Username '{username}' is already taken")
        
        # Check if email already exists
        existing_email = await self.repository.get_by_email(email)
        if existing_email:
            raise ValueError(f"Email '{email}' is already registered")
        
        # Create user
        user = await self.repository.create(username, email)
        return user.to_dict()
    
    async def get_user(self, user_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a user by ID"""
        user = await self.repository.get_by_id(user_id)
        return user.to_dict() if user else None
    
    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get a user by username"""
        user = await self.repository.get_by_username(username)
        return user.to_dict() if user else None
    
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get a user by email"""
        user = await self.repository.get_by_email(email)
        return user.to_dict() if user else None
    
    async def get_all_users(self) -> List[Dict[str, Any]]:
        """Get all users"""
        users = await self.repository.get_all()
        return [user.to_dict() for user in users]
    
    async def update_user(self, user_id: UUID, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a user"""
        # Validate input
        if 'username' in data and not data['username']:
            raise ValueError("Username cannot be empty")
        
        if 'email' in data and not data['email']:
            raise ValueError("Email cannot be empty")
        
        # Check if username already exists (if being updated)
        if 'username' in data:
            existing_user = await self.repository.get_by_username(data['username'])
            if existing_user and existing_user.id != user_id:
                raise ValueError(f"Username '{data['username']}' is already taken")
        
        # Check if email already exists (if being updated)
        if 'email' in data:
            existing_email = await self.repository.get_by_email(data['email'])
            if existing_email and existing_email.id != user_id:
                raise ValueError(f"Email '{data['email']}' is already registered")
        
        # Update user
        user = await self.repository.update(user_id, data)
        return user.to_dict() if user else None
    
    async def delete_user(self, user_id: UUID) -> bool:
        """Delete a user"""
        return await self.repository.delete(user_id)
