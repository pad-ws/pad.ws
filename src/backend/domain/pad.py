from uuid import UUID
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from config import default_pad, get_redis_client
import json

from database.models.pad_model import PadStore


class Pad:
    """
    Domain entity representing a collaborative pad.
    
    This class contains the core business logic for pad manipulation,
    manages the collaboration state, and provides methods for Redis
    synchronization and database persistence.
    """
    
    # Cache expiration time in seconds (1 hour)
    CACHE_EXPIRY = 3600
    
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
        self._redis = get_redis_client()

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        owner_id: UUID,
        display_name: str,
        data: Dict[str, Any] = default_pad
    ) -> 'Pad':
        """Create a new pad with multi-user app state support"""
        # Create a deep copy of the default template
        pad_data = {
            "files": data.get("files", {}),
            "elements": data.get("elements", []),
            "appState": {
                str(owner_id): data.get("appState", {})
            }
        }
            
        store = await PadStore.create_pad(
            session=session,
            owner_id=owner_id,
            display_name=display_name,
            data=pad_data
        )
        pad = cls.from_store(store)
        await pad.cache()
        return pad

    @classmethod
    async def get_by_id(cls, session: AsyncSession, pad_id: UUID) -> Optional['Pad']:
        """Get a pad by ID, first trying Redis cache then falling back to database"""
        # Try to get from Redis cache first
        redis_client = get_redis_client()
        cache_key = f"pad:{pad_id}"
        
        # Check if the hash exists
        if redis_client.exists(cache_key):
            try:
                # Get all fields from the hash
                data = redis_client.hgetall(cache_key)
                if data:
                    return cls(
                        id=UUID(data['id']),
                        owner_id=UUID(data['owner_id']),
                        display_name=data['display_name'],
                        data=json.loads(data['data']),
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at'])
                    )
            except (json.JSONDecodeError, KeyError, ValueError):
                print(f"Error parsing cached pad data, id: {cache_key}")
        
        # Fall back to database
        store = await PadStore.get_by_id(session, pad_id)
        if store:
            pad = cls.from_store(store)
            await pad.cache()  # Cache for future use
            return pad
        return None

    @classmethod
    async def get_by_owner(cls, session: AsyncSession, owner_id: UUID) -> list['Pad']:
        """Get all pads for a specific owner"""
        stores = await PadStore.get_by_owner(session, owner_id)
        pads = [cls.from_store(store) for store in stores]
        # Cache all pads
        for pad in pads:
            await pad.cache()
        return pads

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
        """Save the pad to the database and update cache"""
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
        
        # Update cache
        await self.cache()
        return self

    async def update_data(self, session: AsyncSession, data: Dict[str, Any]) -> 'Pad':
        """Update the pad's data and refresh cache"""
        self.data = data
        self.updated_at = datetime.now()
        if self._store:
            self._store = await self._store.update_data(session, data)
        await self.cache()
        return self

    async def delete(self, session: AsyncSession) -> bool:
        """Delete the pad from both database and cache"""
        if self._store:
            success = await self._store.delete(session)
            if success:
                await self.invalidate_cache()
            return success
        return False

    async def cache(self) -> None:
        """Cache the pad data in Redis using hash structure"""
        cache_key = f"pad:{self.id}"
        
        # Store each field separately in the hash
        cache_data = {
            'id': str(self.id),
            'owner_id': str(self.owner_id),
            'display_name': self.display_name,
            'data': json.dumps(self.data),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        
        self._redis.hset(cache_key, mapping=cache_data)
        self._redis.expire(cache_key, self.CACHE_EXPIRY)

    async def invalidate_cache(self) -> None:
        """Remove the pad from Redis cache"""
        cache_key = f"pad:{self.id}"
        self._redis.delete(cache_key)

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


    