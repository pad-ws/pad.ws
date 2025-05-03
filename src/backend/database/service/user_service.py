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
    
    async def create_user(self, user_id: UUID, username: str, email: str, 
                         email_verified: bool = False, name: str = None, 
                         given_name: str = None, family_name: str = None, 
                         roles: list = None) -> Dict[str, Any]:
        """Create a new user with specified ID and optional fields"""
        # Validate input
        if not user_id or not username or not email:
            raise ValueError("User ID, username, and email are required")
        
        # Check if user_id already exists
        existing_id = await self.repository.get_by_id(user_id)
        if existing_id:
            raise ValueError(f"User with ID '{user_id}' already exists")
        
        # Check if username already exists
        existing_user = await self.repository.get_by_username(username)
        if existing_user:
            raise ValueError(f"Username '{username}' is already taken")
        
        # Create user
        user = await self.repository.create(
            user_id=user_id,
            username=username,
            email=email,
            email_verified=email_verified,
            name=name,
            given_name=given_name,
            family_name=family_name,
            roles=roles
        )
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
    
    async def sync_user_with_token_data(self, user_id: UUID, token_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Synchronize user data in the database with data from the authentication token.
        If the user doesn't exist, it will be created. If it exists but has different data,
        it will be updated to match the token data.
        
        Args:
            user_id: The user's UUID
            token_data: Dictionary containing user data from the authentication token
            
        Returns:
            The user data dictionary or None if operation failed
        """
        # Check if user exists
        user_data = await self.get_user(user_id)
        
        # If user doesn't exist, create a new one
        if not user_data:
            try:
                return await self.create_user(
                    user_id=user_id,
                    username=token_data.get("username", ""),
                    email=token_data.get("email", ""),
                    email_verified=token_data.get("email_verified", False),
                    name=token_data.get("name"),
                    given_name=token_data.get("given_name"),
                    family_name=token_data.get("family_name"),
                    roles=token_data.get("roles", [])
                )
            except ValueError as e:
                print(f"Error creating user: {e}")
                # Handle case where user might have been created in a race condition
                if "already exists" in str(e):
                    user_data = await self.get_user(user_id)
                else:
                    raise e
        
        # Check if user data needs to be updated
        update_data = {}
        fields_to_check = [
            "username", "email", "email_verified", 
            "name", "given_name", "family_name"
        ]
        
        for field in fields_to_check:
            token_value = token_data.get(field)
            if token_value is not None and user_data.get(field) != token_value:
                update_data[field] = token_value
        
        # Handle roles separately as they might have a different structure
        if "roles" in token_data and user_data.get("roles") != token_data["roles"]:
            update_data["roles"] = token_data["roles"]
        
        # Update user if any field has changed
        if update_data:
            return await self.update_user(user_id, update_data)
        
        return user_data
