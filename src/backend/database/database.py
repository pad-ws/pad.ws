"""
Database connection and session management.
"""

import os
from typing import AsyncGenerator
from urllib.parse import quote_plus as urlquote

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema
from fastapi import Depends

from .models import Base, SCHEMA_NAME

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

async def init_db() -> None:
    """Initialize the database with required tables"""
    async with engine.begin() as conn:
        await conn.execute(CreateSchema(SCHEMA_NAME, if_not_exists=True))
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
