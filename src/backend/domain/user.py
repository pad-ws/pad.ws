from uuid import UUID
from typing import Dict, Any, Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.user_model import UserStore


class User:
    """
    Domain entity representing a user.
    
    This class contains the core business logic for user management
    and provides methods for database persistence.
    """
    
    def __init__(
        self,
        id: UUID,
        username: str,
        email: str,
        email_verified: bool = False,
        name: Optional[str] = None,
        given_name: Optional[str] = None,
        family_name: Optional[str] = None,
        roles: List[str] = None,
        last_selected_pad: Optional[UUID] = None,
        created_at: datetime = None,
        updated_at: datetime = None,
        store: UserStore = None
    ):
        self.id = id
        self.username = username
        self.email = email
        self.email_verified = email_verified
        self.name = name
        self.given_name = given_name
        self.family_name = family_name
        self.roles = roles or []
        self.last_selected_pad = last_selected_pad
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
        self._store = store

    @classmethod
    async def create(
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
        last_selected_pad: Optional[UUID] = None
    ) -> 'User':
        """Create a new user"""
        store = await UserStore.create_user(
            session=session,
            id=id,
            username=username,
            email=email,
            email_verified=email_verified,
            name=name,
            given_name=given_name,
            family_name=family_name,
            roles=roles,
            last_selected_pad=last_selected_pad
        )
        return cls.from_store(store)

    @classmethod
    async def get_by_id(cls, session: AsyncSession, user_id: UUID) -> Optional['User']:
        """Get a user by ID"""
        store = await UserStore.get_by_id(session, user_id)
        return cls.from_store(store) if store else None

    @classmethod
    def from_store(cls, store: UserStore) -> 'User':
        """Create a User instance from a store"""
        return cls(
            id=store.id,
            username=store.username,
            email=store.email,
            email_verified=store.email_verified,
            name=store.name,
            given_name=store.given_name,
            family_name=store.family_name,
            roles=store.roles,
            last_selected_pad=store.last_selected_pad,
            created_at=store.created_at,
            updated_at=store.updated_at,
            store=store
        )

    async def save(self, session: AsyncSession) -> 'User':
        """Save the user to the database"""
        if not self._store:
            self._store = UserStore(
                id=self.id,
                username=self.username,
                email=self.email,
                email_verified=self.email_verified,
                name=self.name,
                given_name=self.given_name,
                family_name=self.family_name,
                roles=self.roles,
                last_selected_pad=self.last_selected_pad,
                created_at=self.created_at,
                updated_at=self.updated_at
            )
        else:
            self._store.username = self.username
            self._store.email = self.email
            self._store.email_verified = self.email_verified
            self._store.name = self.name
            self._store.given_name = self.given_name
            self._store.family_name = self.family_name
            self._store.roles = self.roles
            self._store.last_selected_pad = self.last_selected_pad
            self._store.updated_at = datetime.now()

        self._store = await self._store.save(session)
        self.id = self._store.id
        self.created_at = self._store.created_at
        self.updated_at = self._store.updated_at
        return self

    async def update(self, session: AsyncSession, data: Dict[str, Any]) -> 'User':
        """Update user data"""
        for key, value in data.items():
            setattr(self, key, value)
        self.updated_at = datetime.now()
        if self._store:
            self._store = await self._store.update(session, data)
        return self

    async def delete(self, session: AsyncSession) -> bool:
        """Delete the user"""
        if self._store:
            return await self._store.delete(session)
        return False

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
            "last_selected_pad": str(self.last_selected_pad) if self.last_selected_pad else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

    @classmethod
    async def get_open_pads(cls, session: AsyncSession, user_id: UUID) -> List[Dict[str, Any]]:
        """Get just the metadata of pads owned by the user without loading full pad data"""
        return await UserStore.get_open_pads(session, user_id)

    @classmethod
    async def ensure_exists(cls, session: AsyncSession, user_info: dict) -> 'User':
        """Ensure a user exists in the database, creating them if they don't"""
        # TODO Certain OIDC don't provide 'sub' in user_info as UUID, handle that case 
        user_id = UUID(user_info['sub'])
        user = await cls.get_by_id(session, user_id)
        
        if not user:
            print(f"Creating user {user_id}, {user_info.get('preferred_username', '')}")
            user = await cls.create(
                session=session,
                id=user_id,
                username=user_info.get('preferred_username', ''),
                email=user_info.get('email', ''),
                email_verified=user_info.get('email_verified', False),
                name=user_info.get('name'),
                given_name=user_info.get('given_name'),
                family_name=user_info.get('family_name'),
                roles=user_info.get('realm_access', {}).get('roles', []),
                last_selected_pad=None
            )
        
        return user

    async def remove_open_pad(self, session: AsyncSession, pad_id: UUID) -> 'User':
        """Remove a pad from the user's open_pads list"""
        if self._store and pad_id in self._store.open_pads:
            self._store = await self._store.remove_open_pad(session, pad_id)
        return self

    async def set_last_selected_pad(self, session: AsyncSession, pad_id: UUID) -> 'User':
        """Set the last selected pad for the user"""
        self.last_selected_pad = pad_id
        if self._store:
            self._store = await self._store.set_last_selected_pad(session, pad_id)
        return self