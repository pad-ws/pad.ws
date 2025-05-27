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
        worker_id: Optional[str] = None,
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
        self.worker_id = worker_id  # Cache-only field, not persisted to database

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
        
        await pad.ensure_worker()
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
            
            # Get sharing_policy and whitelist (or use defaults if not in cache)
            sharing_policy = cached_data.get('sharing_policy', 'private')
            whitelist_str = cached_data.get('whitelist', '[]')
            whitelist = [UUID(uid) for uid in json.loads(whitelist_str)] if whitelist_str else []
            # Get worker_id from cache (cache-only field)
            worker_id = cached_data.get('worker_id', None)
            
            # Create a minimal PadStore instance
            store = PadStore(
                id=pad_id,
                owner_id=owner_id,
                display_name=display_name,
                data=data,
                created_at=created_at,
                updated_at=updated_at,
                sharing_policy=sharing_policy,
                whitelist=whitelist
            )
            
            return cls(
                id=pad_id,
                owner_id=owner_id,
                display_name=display_name,
                data=data,
                created_at=created_at,
                updated_at=updated_at,
                store=store,
                redis=redis,
                sharing_policy=sharing_policy,
                whitelist=whitelist,
                worker_id=worker_id
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
            await pad.ensure_worker()
            return pad
            
        # Fall back to database
        store = await PadStore.get_by_id(session, pad_id)
        if store:
            pad = cls.from_store(store, redis)
            await pad.ensure_worker()
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
        await self.release_worker()
        
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
            'updated_at': self.updated_at.isoformat(),
            'sharing_policy': self.sharing_policy,
            'whitelist': json.dumps([str(uid) for uid in self.whitelist]) if self.whitelist else '[]',
            'worker_id': self.worker_id or ''  # Cache-only field
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

    async def ensure_worker(self) -> bool:
        """Ensure a worker is assigned to this pad and processing updates"""
        from workers.canvas_worker import CanvasWorker
        
        # If we already have a worker assigned, check if it's still active
        if self.worker_id and self.worker_id.strip():
            # TODO: Add worker health check if needed
            return True
            
        # Get the canvas worker instance and assign it to this pad
        canvas_worker = await CanvasWorker.get_instance()
        success = await canvas_worker.start_processing_pad(self.id)
        
        if success:
            self.worker_id = canvas_worker.worker_id
            # Update cache with new worker assignment
            await self.cache()
            print(f"Assigned worker {self.worker_id[:8]} to pad {self.id}")
            return True
        else:
            print(f"Failed to assign worker to pad {self.id}")
            return False

    async def assign_worker(self, worker_id: str) -> None:
        """Assign a specific worker to this pad (cache-only)"""
        self.worker_id = worker_id
        await self.cache()

    async def release_worker(self) -> None:
        """Release the worker from this pad"""
        if self.worker_id:
            from workers.canvas_worker import CanvasWorker
            canvas_worker = await CanvasWorker.get_instance()
            await canvas_worker.stop_processing_pad(self.id)
            
            old_worker_id = self.worker_id
            self.worker_id = None
            await self.cache()
            print(f"Released worker {old_worker_id[:8]} from pad {self.id}")

    async def get_connected_users(self) -> List[Dict[str, str]]:
        """Get all connected users from the pad users hash as a list of dicts with user_id and username."""
        key = f"pad:users:{self.id}"
        try:
            # Get all users from the hash
            all_users = await self._redis.hgetall(key)
            
            # Convert to list of dicts with user_id and username
            connected_users = []
            for user_id, user_data_str in all_users.items():
                user_id_str = user_id.decode() if isinstance(user_id, bytes) else user_id
                user_data = json.loads(user_data_str.decode() if isinstance(user_data_str, bytes) else user_data_str)
                connected_users.append({
                    "user_id": user_id_str,
                    "username": user_data["username"]
                })
            
            return connected_users
        except Exception as e:
            print(f"Error getting connected users from Redis for pad {self.id}: {e}")
            return []

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
            "updated_at": self.updated_at.isoformat(),
            "worker_id": self.worker_id if self.worker_id else None
        }
    