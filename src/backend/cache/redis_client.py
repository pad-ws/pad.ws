import os
from redis import asyncio as aioredis
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Redis Configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}"

class RedisClient:
    """Service for managing Redis connections with proper lifecycle management."""
    
    _instance = None
    
    @classmethod
    async def get_instance(cls) -> aioredis.Redis:
        """Get or create a Redis client instance."""
        if cls._instance is None:
            cls._instance = cls()
            await cls._instance.initialize()
        return cls._instance.client
    
    def __init__(self):
        self.client = None
    
    async def initialize(self) -> None:
        """Initialize the Redis client."""
        self.client = aioredis.from_url(
            REDIS_URL,
            password=REDIS_PASSWORD,
            decode_responses=True,
            health_check_interval=30
        )
        
    async def close(self) -> None:
        """Close the Redis client connection."""
        if self.client:
            await self.client.close()
            self.client = None
            print("Redis client closed.")