from uuid import UUID
from typing import Dict, Any, Optional, List
from datetime import datetime
from redis import RedisError
from sqlalchemy.ext.asyncio import AsyncSession
from config import default_pad
import json

from cache import RedisClient
from database.models.pad_model import PadStore
from redis.asyncio import Redis as AsyncRedis

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
        created_at: datetime,
        updated_at: datetime,
        store: PadStore,
        redis: AsyncRedis,
        data: Dict[str, Any] = None,
        sharing_policy: str = "private",
        whitelist: List[UUID] = None,
    ):
        self.id = id
        self.owner_id = owner_id
        self.display_name = display_name
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
        self._store = store
        self._redis = redis
        self.data = data or {}
        self.sharing_policy = sharing_policy or "private"
        self.whitelist = whitelist or []

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        owner_id: UUID,
        display_name: str,
        data: Dict[str, Any] = default_pad,
        sharing_policy: str = "private",
        whitelist: List[UUID] = None,
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
            data=pad_data,
            sharing_policy=sharing_policy or "private",
            whitelist=whitelist or []
        )
        redis = await RedisClient.get_instance()
        pad = cls.from_store(store, redis)
        
        await pad.cache()
            
        return pad

    @classmethod
    async def from_redis(cls, redis: AsyncRedis, pad_id: UUID) -> Optional['Pad']:
        """Create a Pad instance from Redis cache data"""
        cache_key = f"pad:{pad_id}"
        
        try:
            if not await redis.exists(cache_key):
                return None
                
            cached_data = await redis.hgetall(cache_key)
            if not cached_data:
                return None
                
            pad_id = UUID(cached_data['id'])
            owner_id = UUID(cached_data['owner_id'])
            display_name = cached_data['display_name']
            data = json.loads(cached_data['data'])
            created_at = datetime.fromisoformat(cached_data['created_at'])
            updated_at = datetime.fromisoformat(cached_data['updated_at'])
            
            # Create a minimal PadStore instance
            store = PadStore(
                id=pad_id,
                owner_id=owner_id,
                display_name=display_name,
                data=data,
                created_at=created_at,
                updated_at=updated_at
            )
            
            return cls(
                id=pad_id,
                owner_id=owner_id,
                display_name=display_name,
                data=data,
                created_at=created_at,
                updated_at=updated_at,
                store=store,
                redis=redis
            )
        except (json.JSONDecodeError, KeyError, ValueError, RedisError) as e:
            return None
        except Exception as e:
            print(f"Unexpected error retrieving pad from cache: {str(e)}")
            return None

    @classmethod
    async def get_by_id(cls, session: AsyncSession, pad_id: UUID) -> Optional['Pad']:
        """Get a pad by ID, first trying Redis cache then falling back to database"""
        redis = await RedisClient.get_instance()
        
        # Try to get from cache first
        pad = await cls.from_redis(redis, pad_id)
        if pad:
            return pad
            
        # Fall back to database
        store = await PadStore.get_by_id(session, pad_id)
        if store:
            pad = cls.from_store(store, redis)
            await pad.cache()
            return pad
        return None

    @classmethod
    def from_store(cls, store: PadStore, redis: AsyncRedis) -> 'Pad':
        """Create a Pad instance from a store"""
        return cls(
            id=store.id,
            owner_id=store.owner_id,
            display_name=store.display_name,
            data=store.data,
            created_at=store.created_at,
            updated_at=store.updated_at,
            store=store,
            redis=redis,
            sharing_policy=store.sharing_policy or "private",
            whitelist=store.whitelist or []
        )

    async def save(self, session: AsyncSession) -> 'Pad':
        """Save the pad to the database and update cache"""
        self._store.display_name = self.display_name
        self._store.data = self.data
        self._store.sharing_policy = self.sharing_policy
        self._store.whitelist = self.whitelist
        self._store.updated_at = datetime.now()
        self._store = await self._store.save(session)

        await self.cache()
        return self

    async def rename(self, session: AsyncSession, new_display_name: str) -> 'Pad':
        """Rename the pad by updating its display name"""
        self.display_name = new_display_name
        self.updated_at = datetime.now()
        if self._store:
            self._store.display_name = new_display_name
            self._store.updated_at = self.updated_at
            self._store.sharing_policy = self.sharing_policy
            self._store.whitelist = self.whitelist
            self._store = await self._store.save(session)
            
        await self.cache()
            
        return self

    async def delete(self, session: AsyncSession) -> bool:
        """Delete the pad from both database and cache"""
        success = await self._store.delete(session)
        if success:
            await self.invalidate_cache()
        else:
            print(f"Failed to delete pad {self.id} from database")
            return False

        print(f"Deleted pad {self.id} from database and cache")
        return success

    async def cache(self) -> None:
        """Cache the pad data in Redis using hash structure"""
            
        cache_key = f"pad:{self.id}"
        
        cache_data = {
            'id': str(self.id),
            'owner_id': str(self.owner_id),
            'display_name': self.display_name,
            'data': json.dumps(self.data),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        try:
            async with self._redis.pipeline() as pipe:
                await pipe.hset(cache_key, mapping=cache_data)
                await pipe.expire(cache_key, self.CACHE_EXPIRY)
                await pipe.execute()
        except Exception as e:
            print(f"Error caching pad {self.id}: {str(e)}")

    async def invalidate_cache(self) -> None:
        """Remove the pad from Redis cache"""
        cache_key = f"pad:{self.id}"
        await self._redis.delete(cache_key)

    async def set_sharing_policy(self, session: AsyncSession, policy: str) -> 'Pad':
        """Update the sharing policy of the pad"""
        if policy not in ["private", "whitelist", "public"]:
            raise ValueError("Invalid sharing policy")
            
        print(f"Changing sharing policy for pad {self.id} from {self.sharing_policy} to {policy}")
        self.sharing_policy = policy
        self._store.sharing_policy = policy
        self.updated_at = datetime.now()
        self._store.updated_at = self.updated_at
        
        await self._store.save(session)
        await self.cache()
        
        return self

    async def add_to_whitelist(self, session: AsyncSession, user_id: UUID) -> 'Pad':
        """Add a user to the pad's whitelist"""
        if user_id not in self.whitelist:
            self.whitelist.append(user_id)
            self._store.whitelist = self.whitelist
            self.updated_at = datetime.now()
            self._store.updated_at = self.updated_at
            
            await self._store.save(session)
            await self.cache()
            
        return self

    async def remove_from_whitelist(self, session: AsyncSession, user_id: UUID) -> 'Pad':
        """Remove a user from the pad's whitelist"""
        if user_id in self.whitelist:
            self.whitelist.remove(user_id)
            self._store.whitelist = self.whitelist
            self.updated_at = datetime.now()
            self._store.updated_at = self.updated_at
            
            await self._store.save(session)
            await self.cache()
            
        return self

    def can_access(self, user_id: UUID) -> bool:
        """Check if a user can access the pad"""
        if self.owner_id == user_id:
            return True
        if self.sharing_policy == "public":
            return True
        if self.sharing_policy == "whitelist":
            return user_id in self.whitelist
        return False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            "id": str(self.id),
            "owner_id": str(self.owner_id),
            "display_name": self.display_name,
            "data": self.data,
            "sharing_policy": self.sharing_policy,
            "whitelist": [str(uid) for uid in self.whitelist],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }




    