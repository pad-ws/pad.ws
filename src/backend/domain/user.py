from uuid import UUID
from typing import Dict, Any, Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.models.user_model import UserStore


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
        roles: List[str] = None
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
            roles=roles
        )
        return cls.from_store(store)

    @classmethod
    async def get_by_id(cls, session: AsyncSession, user_id: UUID) -> Optional['User']:
        """Get a user by ID"""
        store = await UserStore.get_by_id(session, user_id)
        return cls.from_store(store) if store else None

    @classmethod
    async def get_by_username(cls, session: AsyncSession, username: str) -> Optional['User']:
        """Get a user by username"""
        store = await UserStore.get_by_username(session, username)
        return cls.from_store(store) if store else None

    @classmethod
    async def get_by_email(cls, session: AsyncSession, email: str) -> Optional['User']:
        """Get a user by email"""
        store = await UserStore.get_by_email(session, email)
        return cls.from_store(store) if store else None

    @classmethod
    async def get_all(cls, session: AsyncSession) -> List['User']:
        """Get all users"""
        stores = await UserStore.get_all(session)
        return [cls.from_store(store) for store in stores]

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
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
