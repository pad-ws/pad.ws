from uuid import UUID
from typing import Dict, Any, Set, List, Optional, Callable, Union
import json
import copy
import asyncio
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.pad_model import PadStore


class Pad:
    """
    Domain entity representing a collaborative pad.
    
    This class contains the core business logic for pad manipulation,
    manages the collaboration state, and provides methods for Redis
    synchronization and database persistence.
    """
    
    def __init__(
        self, 
        id: UUID, 
        owner_id: UUID, 
        display_name: str, 
        data: Dict[str, Any] = None, 
        created_at: datetime = None,
        updated_at: datetime = None,
        store: PadStore = None
    ):
        self.id = id
        self.owner_id = owner_id
        self.display_name = display_name
        self.data = data or {}
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
        self._store = store

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        owner_id: UUID,
        display_name: str,
        data: Dict[str, Any] = None
    ) -> 'Pad':
        """Create a new pad"""
        store = await PadStore.create_pad(
            session=session,
            owner_id=owner_id,
            display_name=display_name,
            data=data or {}
        )
        return cls.from_store(store)

    @classmethod
    async def get_by_id(cls, session: AsyncSession, pad_id: UUID) -> Optional['Pad']:
        """Get a pad by ID"""
        store = await PadStore.get_by_id(session, pad_id)
        return cls.from_store(store) if store else None

    @classmethod
    async def get_by_owner(cls, session: AsyncSession, owner_id: UUID) -> list['Pad']:
        """Get all pads for a specific owner"""
        stores = await PadStore.get_by_owner(session, owner_id)
        return [cls.from_store(store) for store in stores]

    @classmethod
    def from_store(cls, store: PadStore) -> 'Pad':
        """Create a Pad instance from a store"""
        return cls(
            id=store.id,
            owner_id=store.owner_id,
            display_name=store.display_name,
            data=store.data,
            created_at=store.created_at,
            updated_at=store.updated_at,
            store=store
        )

    async def save(self, session: AsyncSession) -> 'Pad':
        """Save the pad to the database"""
        if not self._store:
            self._store = PadStore(
                id=self.id,
                owner_id=self.owner_id,
                display_name=self.display_name,
                data=self.data,
                created_at=self.created_at,
                updated_at=self.updated_at
            )
        else:
            self._store.display_name = self.display_name
            self._store.data = self.data
            self._store.updated_at = datetime.now()

        self._store = await self._store.save(session)
        self.id = self._store.id
        self.created_at = self._store.created_at
        self.updated_at = self._store.updated_at
        return self

    async def update_data(self, session: AsyncSession, data: Dict[str, Any]) -> 'Pad':
        """Update the pad's data"""
        self.data = data
        self.updated_at = datetime.now()
        if self._store:
            self._store = await self._store.update_data(session, data)
        return self

    async def delete(self, session: AsyncSession) -> bool:
        """Delete the pad"""
        if self._store:
            return await self._store.delete(session)
        return False

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


    