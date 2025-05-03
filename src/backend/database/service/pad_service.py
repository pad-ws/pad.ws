"""
Pad service for business logic related to pads.
"""

from typing import List, Optional, Dict, Any, TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..repository import PadRepository, UserRepository
from .user_service import UserService

# Use TYPE_CHECKING to avoid circular imports
if TYPE_CHECKING:
    from dependencies import UserSession

class PadService:
    """Service for pad-related business logic"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the service with a database session"""
        self.session = session
        self.repository = PadRepository(session)
        self.user_repository = UserRepository(session)
    
    async def create_pad(self, owner_id: UUID, display_name: str, data: Dict[str, Any], user_session: "UserSession" = None) -> Dict[str, Any]:
        """Create a new pad"""
        # Validate input
        if not display_name:
            raise ValueError("Display name is required")
        
        if not data:
            raise ValueError("Pad data is required")
        
        # Check if owner exists
        owner = await self.user_repository.get_by_id(owner_id)
        if not owner and user_session:
            # User doesn't exist, create a user record from user session
            print(f"ANOMALY DETECTED: User with ID '{owner_id}' does not exist but has valid authentication. Creating user as failsafe.")
            
            # Create a UserService instance
            user_service = UserService(self.session)
            
            # Create user with data from UserSession
            try:
                await user_service.create_user(
                    user_id=user_session.id,
                    username=user_session.username,
                    email=user_session.email,
                    email_verified=user_session.email_verified,
                    name=user_session.name,
                    given_name=user_session.given_name,
                    family_name=user_session.family_name,
                    roles=user_session.roles
                )
                print(f"Successfully created user with ID '{owner_id}' as failsafe.")
            except ValueError as e:
                print(f"Error creating user as failsafe: {str(e)}")
                # If user creation fails due to race condition, try to get the user again
                if "already exists" in str(e):
                    owner = await self.user_repository.get_by_id(owner_id)
                    if not owner:
                        raise ValueError(f"Failed to create user with ID '{owner_id}'")
                else:
                    raise
        
        # Check if pad with same name already exists for this owner
        existing_pad = await self.repository.get_by_name(owner_id, display_name)
        if existing_pad:
            raise ValueError(f"Pad with name '{display_name}' already exists for this user")
        
        # Create pad
        pad = await self.repository.create(owner_id, display_name, data)
        return pad.to_dict()
    
    async def get_pad(self, pad_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a pad by ID"""
        pad = await self.repository.get_by_id(pad_id)
        return pad.to_dict() if pad else None
    
    async def get_pads_by_owner(self, owner_id: UUID) -> List[Dict[str, Any]]:
        """Get all pads for a specific owner"""
        # Check if owner exists
        owner = await self.user_repository.get_by_id(owner_id)
        if not owner:
            # Return empty list instead of raising an error
            # This allows the pad_router to handle the case where a user doesn't exist
            return []
        
        pads = await self.repository.get_by_owner(owner_id)
        return [pad.to_dict() for pad in pads]
    
    async def get_pad_by_name(self, owner_id: UUID, display_name: str) -> Optional[Dict[str, Any]]:
        """Get a pad by owner and display name"""
        pad = await self.repository.get_by_name(owner_id, display_name)
        return pad.to_dict() if pad else None
    
    async def update_pad(self, pad_id: UUID, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a pad"""
        # Get the pad to check if it exists
        pad = await self.repository.get_by_id(pad_id)
        if not pad:
            raise ValueError(f"Pad with ID '{pad_id}' does not exist")
        
        # Validate display_name if it's being updated
        if 'display_name' in data and not data['display_name']:
            raise ValueError("Display name cannot be empty")
        
        # Check if new display_name already exists for this owner (if being updated)
        if 'display_name' in data and data['display_name'] != pad.display_name:
            existing_pad = await self.repository.get_by_name(pad.owner_id, data['display_name'])
            if existing_pad:
                raise ValueError(f"Pad with name '{data['display_name']}' already exists for this user")
        
        # Update pad
        updated_pad = await self.repository.update(pad_id, data)
        return updated_pad.to_dict() if updated_pad else None
    
    async def update_pad_data(self, pad_id: UUID, pad_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update just the data field of a pad"""
        # Get the pad to check if it exists
        pad = await self.repository.get_by_id(pad_id)
        if not pad:
            raise ValueError(f"Pad with ID '{pad_id}' does not exist")
        
        # Update pad data
        updated_pad = await self.repository.update_data(pad_id, pad_data)
        return updated_pad.to_dict() if updated_pad else None
    
    async def delete_pad(self, pad_id: UUID) -> bool:
        """Delete a pad"""
        # Get the pad to check if it exists
        pad = await self.repository.get_by_id(pad_id)
        if not pad:
            raise ValueError(f"Pad with ID '{pad_id}' does not exist")
        
        return await self.repository.delete(pad_id)
