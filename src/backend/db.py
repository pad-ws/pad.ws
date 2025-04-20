import os
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from sqlalchemy import Column, String, JSON, DateTime, func, create_engine
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

class CanvasData(Base):
    """Model for canvas data table"""
    __tablename__ = "canvas_data"
    
    user_id = Column(String, primary_key=True)
    data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<CanvasData(user_id='{self.user_id}')>"

async def get_db_session():
    """Get a database session"""
    async with async_session() as session:
        yield session

async def init_db():
    """Initialize the database with required tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def store_canvas_data(user_id: str, data: Dict[str, Any]) -> bool:
    try:
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
            
            await session.commit()
        return True
    except Exception as e:
        print(f"Error storing canvas data: {e}")
        return False

async def get_canvas_data(user_id: str) -> Optional[Dict[str, Any]]:
    try:
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
