"""
Database connection and session management.
"""

import os
import asyncio
from typing import AsyncGenerator
from urllib.parse import quote_plus as urlquote
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema
from fastapi import Depends
from alembic.config import Config
from alembic import command

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

async def run_migrations() -> None:
    """Run database migrations using Alembic"""
    # Get the path to the alembic.ini file
    alembic_ini_path = Path(__file__).parent / "alembic.ini"
    
    # Create Alembic configuration
    alembic_cfg = Config(str(alembic_ini_path))
    
    # Set the script_location to the correct path
    # This ensures Alembic finds the migrations directory
    alembic_cfg.set_main_option('script_location', str(Path(__file__).parent / "migrations"))
    
    # Define a function to run in a separate thread
    def run_upgrade():
        # Import the command module here to avoid import issues
        from alembic import command
        
        # Set attributes that env.py might need
        import sys
        from pathlib import Path
        
        # Add the database directory to sys.path
        db_dir = Path(__file__).parent
        if str(db_dir) not in sys.path:
            sys.path.insert(0, str(db_dir))
        
        # Run the upgrade command
        command.upgrade(alembic_cfg, "head")
    
    # Run the migrations in a separate thread to avoid blocking the event loop
    await asyncio.to_thread(run_upgrade)

async def init_db() -> None:
    """Initialize the database with required tables"""
    # Create schema and tables
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
