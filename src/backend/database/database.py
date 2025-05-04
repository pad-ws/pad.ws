"""
Database connection and session management.
"""

import os
import asyncio
import subprocess
import time
from typing import AsyncGenerator, Optional
from urllib.parse import quote_plus as urlquote
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema
from fastapi import Depends
from alembic.config import Config

from .models import Base, SCHEMA_NAME

from dotenv import load_dotenv

load_dotenv()

# PostgreSQL connection configuration
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'postgres')
DB_NAME = os.getenv('POSTGRES_DB', 'pad')
DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')

# SQLAlchemy async database URL
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{urlquote(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)

# Create async session factory
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def run_migrations_with_lock(redis_client=None, lock_timeout: int = 120, max_wait_time: int = 300) -> bool:
    """
    Run database migrations using Alembic with a Redis distributed lock.
    All workers will wait for the migration to complete before proceeding.
    
    Args:
        redis_client: Redis client instance
        lock_timeout: How long the lock should be held (seconds)
        max_wait_time: Maximum time to wait for migrations to complete (seconds)
        
    Returns:
        bool: True if migrations were run successfully or completed by another instance, False on timeout or error
    """
    if redis_client is None:
        # Import here to avoid circular imports
        from config import get_redis_client
        redis_client = get_redis_client()
    
    # Keys for Redis coordination
    lock_name = "alembic_migration_lock"
    status_key = "alembic_migration_status"
    lock_value = f"instance_{time.time()}"
    
    # Check if migrations are already completed
    migration_status = redis_client.get(status_key)
    if migration_status == "completed":
        print("Migrations already completed - continuing startup")
        return True
    
    # Try to acquire the lock - non-blocking
    lock_acquired = redis_client.set(
        lock_name, 
        lock_value,
        nx=True,  # Only set if key doesn't exist
        ex=lock_timeout  # Expiry in seconds
    )
    
    if lock_acquired:
        print("This instance will run migrations")
        try:
            # Set status to in-progress
            redis_client.set(status_key, "in_progress", ex=lock_timeout)
            
            # Run migrations
            success = await run_migrations_subprocess()
            
            if success:
                # Set status to completed with a longer expiry (1 hour)
                redis_client.set(status_key, "completed", ex=3600)
                print("Migration completed successfully - signaling other instances")
                return True
            else:
                # Set status to failed
                redis_client.set(status_key, "failed", ex=3600)
                print("Migration failed - signaling other instances")
                return False
        finally:
            # Release the lock only if we're the owner
            current_value = redis_client.get(lock_name)
            if current_value == lock_value:
                redis_client.delete(lock_name)
    else:
        print("Another instance is running migrations - waiting for completion")
        
        # Wait for the migration to complete
        start_time = time.time()
        while time.time() - start_time < max_wait_time:
            # Check migration status
            status = redis_client.get(status_key)
            
            if status == "completed":
                print("Migrations completed by another instance - continuing startup")
                return True
            elif status == "failed":
                print("Migrations failed in another instance - continuing startup with caution")
                return False
            elif status is None:
                # No status yet, might be a stale lock or not started
                # Check if lock exists
                if not redis_client.exists(lock_name):
                    # Lock released but no status - try to acquire the lock ourselves
                    print("No active migration lock - attempting to acquire")
                    return await run_migrations_with_lock(redis_client, lock_timeout, max_wait_time)
            
            # Wait before checking again
            await asyncio.sleep(1)
        
        # Timeout waiting for migration
        print(f"Timeout waiting for migrations after {max_wait_time} seconds")
        return False

async def run_migrations_subprocess() -> bool:
    """
    Run Alembic migrations using a subprocess
    
    Returns:
        bool: True if migrations were successful, False otherwise
    """
    try:
        # Get the path to the database directory
        db_dir = Path(__file__).parent
        
        # Create a subprocess to run alembic
        process = await asyncio.create_subprocess_exec(
            'alembic', 'upgrade', 'head',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(db_dir)  # Run in the database directory
        )
        
        # Wait for the process to complete with a timeout
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)
            
            if process.returncode == 0:
                print("Database migrations completed successfully")
                if stdout:
                    print(stdout.decode())
                return True
            else:
                print(f"Migration failed with error code {process.returncode}")
                if stderr:
                    print(stderr.decode())
                return False
                
        except asyncio.TimeoutError:
            print("Migration timed out after 60 seconds")
            # Try to terminate the process
            process.terminate()
            return False
            
    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

async def run_migrations() -> None:
    """
    Legacy function to run migrations directly (without lock)
    This is kept for backward compatibility
    """
    await run_migrations_subprocess()

async def init_db() -> None:
    """Initialize the database with required tables"""
    # Only create tables, let Alembic handle schema creation
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

# Dependency for getting repositories
async def get_user_repository(session: AsyncSession = Depends(get_session)):
    """Get a user repository"""
    from .repository import UserRepository
    return UserRepository(session)

async def get_pad_repository(session: AsyncSession = Depends(get_session)):
    """Get a pad repository"""
    from .repository import PadRepository
    return PadRepository(session)

async def get_backup_repository(session: AsyncSession = Depends(get_session)):
    """Get a backup repository"""
    from .repository import BackupRepository
    return BackupRepository(session)

async def get_template_pad_repository(session: AsyncSession = Depends(get_session)):
    """Get a template pad repository"""
    from .repository import TemplatePadRepository
    return TemplatePadRepository(session)

# Dependency for getting services
async def get_user_service(session: AsyncSession = Depends(get_session)):
    """Get a user service"""
    from .service import UserService
    return UserService(session)

async def get_pad_service(session: AsyncSession = Depends(get_session)):
    """Get a pad service"""
    from .service import PadService
    return PadService(session)

async def get_backup_service(session: AsyncSession = Depends(get_session)):
    """Get a backup service"""
    from .service import BackupService
    return BackupService(session)

async def get_template_pad_service(session: AsyncSession = Depends(get_session)):
    """Get a template pad service"""
    from .service import TemplatePadService
    return TemplatePadService(session)
