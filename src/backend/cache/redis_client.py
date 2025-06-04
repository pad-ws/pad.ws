import os
import asyncio
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
    _client = None
    _lock = asyncio.Lock()
    
    @classmethod
    async def get_instance(cls) -> aioredis.Redis:
        """Get or create a Redis client instance with proper singleton behavior."""
        if cls._client is None:
            async with cls._lock:
                # Double-check pattern to prevent race conditions
                if cls._client is None:
                    if cls._instance is None:
                        cls._instance = cls()
                    await cls._instance.initialize()
        return cls._client
    
    
    async def initialize(self) -> None:
        """Initialize the Redis client with connection pool limits."""
        if RedisClient._client is None:
            try:
                RedisClient._client = aioredis.from_url(
                    REDIS_URL,
                    password=REDIS_PASSWORD,
                    decode_responses=True,
                    health_check_interval=30,
                    max_connections=20,  # Limit connection pool size
                    retry_on_timeout=True,
                    socket_keepalive=True,
                    socket_keepalive_options={}
                )
                print(f"Redis client initialized with connection pool (max 20 connections)")
                
                # Test the connection
                await RedisClient._client.ping()
                
            except Exception as e:
                print(f"Failed to initialize Redis client: {e}")
                RedisClient._client = None
                raise
    
    @classmethod
    async def close(cls) -> None:
        """Close the Redis client connection and reset singleton state."""
        if cls._client:
            try:
                await cls._client.close()
                print("Redis client closed.")
            except Exception as e:
                print(f"Error closing Redis client: {e}")
            finally:
                cls._client = None
                cls._instance = None