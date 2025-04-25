import os
from typing import Optional, Dict, Any, List
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import Column, String, JSON, DateTime, Integer, func, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

load_dotenv()

# PostgreSQL connection configuration
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'postgres')
DB_NAME = os.getenv('POSTGRES_DB', 'pad')
DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')

# SQLAlchemy async database URL
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)

# Create async session factory
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Create base model
Base = declarative_base()

# Canvas backup configuration
BACKUP_INTERVAL_SECONDS = 300  # 5 minutes between backups
MAX_BACKUPS_PER_USER = 10  # Maximum number of backups to keep per user

# In-memory dictionaries to track user activity
user_last_backup_time = {}  # Tracks when each user last had a backup
user_last_activity_time = {}  # Tracks when each user was last active

# Memory management configuration
INACTIVITY_THRESHOLD_MINUTES = 30  # Remove users from memory after this many minutes of inactivity
MAX_USERS_BEFORE_CLEANUP = 1000  # Trigger cleanup when we have this many users in memory
CLEANUP_INTERVAL_SECONDS = 3600  # Run cleanup at least once per hour (1 hour)
last_cleanup_time = datetime.now()  # Track when we last ran cleanup

class CanvasData(Base):
    """Model for canvas data table"""
    __tablename__ = "canvas_data"
    
    user_id = Column(String, primary_key=True)
    data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<CanvasData(user_id='{self.user_id}')>"

class CanvasBackup(Base):
    """Model for canvas backups table"""
    __tablename__ = "canvas_backups"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    canvas_data = Column(JSON, nullable=False)
    
    def __repr__(self):
        return f"<CanvasBackup(id={self.id}, user_id='{self.user_id}')>"

async def get_db_session():
    """Get a database session"""
    async with async_session() as session:
        yield session

async def init_db():
    """Initialize the database with required tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def cleanup_inactive_users(inactivity_threshold_minutes: int = INACTIVITY_THRESHOLD_MINUTES):
    """Remove users from memory tracking if they've been inactive for the specified time"""
    current_time = datetime.now()
    inactive_users = []
    
    for user_id, last_activity in user_last_activity_time.items():
        # Check if user has been inactive for longer than the threshold
        if (current_time - last_activity).total_seconds() > (inactivity_threshold_minutes * 60):
            inactive_users.append(user_id)
    
    # Remove inactive users from both dictionaries
    for user_id in inactive_users:
        if user_id in user_last_backup_time:
            del user_last_backup_time[user_id]
        if user_id in user_last_activity_time:
            del user_last_activity_time[user_id]
            
    return len(inactive_users)  # Return count of removed users for logging

async def check_if_cleanup_needed():
    """Check if we should run the cleanup function"""
    global last_cleanup_time
    current_time = datetime.now()
    time_since_last_cleanup = (current_time - last_cleanup_time).total_seconds()
    
    # Run cleanup if we have too many users or it's been too long
    if (len(user_last_activity_time) > MAX_USERS_BEFORE_CLEANUP or 
            time_since_last_cleanup > CLEANUP_INTERVAL_SECONDS):
        removed_count = await cleanup_inactive_users()
        last_cleanup_time = current_time
        print(f"[db.py] Cleanup completed: removed {removed_count} inactive users from memory")

async def store_canvas_data(user_id: str, data: Dict[str, Any]) -> bool:
    try:
        # Update user's last activity time
        current_time = datetime.now()
        user_last_activity_time[user_id] = current_time
        
        # Check if cleanup is needed
        await check_if_cleanup_needed()
        
        async with async_session() as session:
            # Check if record exists
            stmt = select(CanvasData).where(CanvasData.user_id == user_id)
            result = await session.execute(stmt)
            canvas_data = result.scalars().first()
            
            if canvas_data:
                # Update existing record
                canvas_data.data = data
            else:
                # Create new record
                canvas_data = CanvasData(user_id=user_id, data=data)
                session.add(canvas_data)
            
            # Check if we should create a backup
            should_backup = False
            if user_id not in user_last_backup_time:
                # First time this user is saving, create a backup
                should_backup = True
            else:
                # Check if backup interval has passed since last backup
                time_since_last_backup = (current_time - user_last_backup_time[user_id]).total_seconds()
                if time_since_last_backup >= BACKUP_INTERVAL_SECONDS:
                    should_backup = True
            
            if should_backup:
                # Update the backup timestamp
                user_last_backup_time[user_id] = current_time
                
                # Count existing backups for this user
                backup_count_stmt = select(func.count()).select_from(CanvasBackup).where(CanvasBackup.user_id == user_id)
                backup_count_result = await session.execute(backup_count_stmt)
                backup_count = backup_count_result.scalar()
                
                # If user has reached the maximum number of backups, delete the oldest one
                if backup_count >= MAX_BACKUPS_PER_USER:
                    oldest_backup_stmt = select(CanvasBackup).where(CanvasBackup.user_id == user_id).order_by(CanvasBackup.timestamp).limit(1)
                    oldest_backup_result = await session.execute(oldest_backup_stmt)
                    oldest_backup = oldest_backup_result.scalars().first()
                    
                    if oldest_backup:
                        await session.delete(oldest_backup)
                
                # Create new backup
                new_backup = CanvasBackup(user_id=user_id, canvas_data=data)
                session.add(new_backup)
            
            await session.commit()
        return True
    except Exception as e:
        print(f"Error storing canvas data: {e}")
        return False

async def get_canvas_data(user_id: str) -> Optional[Dict[str, Any]]:
    try:
        # Update user's last activity time
        user_last_activity_time[user_id] = datetime.now()
        
        async with async_session() as session:
            stmt = select(CanvasData).where(CanvasData.user_id == user_id)
            result = await session.execute(stmt)
            canvas_data = result.scalars().first()
            
            if canvas_data:
                return canvas_data.data
            return None
    except Exception as e:
        print(f"Error retrieving canvas data: {e}")
        return None

async def get_recent_canvases(user_id: str, limit: int = MAX_BACKUPS_PER_USER) -> List[Dict[str, Any]]:
    """Get the most recent canvas backups for a user"""
    try:
        # Update user's last activity time
        user_last_activity_time[user_id] = datetime.now()
        
        async with async_session() as session:
            # Get the most recent backups, limited to MAX_BACKUPS_PER_USER
            stmt = select(CanvasBackup).where(CanvasBackup.user_id == user_id).order_by(CanvasBackup.timestamp.desc()).limit(limit)
            result = await session.execute(stmt)
            backups = result.scalars().all()
            
            return [{"id": backup.id, "timestamp": backup.timestamp, "data": backup.canvas_data} for backup in backups]
    except Exception as e:
        print(f"Error retrieving canvas backups: {e}")
        return []
