from uuid import uuid4
from typing import Any, Dict

from sqlalchemy import Column, DateTime, UUID, func, MetaData
from sqlalchemy.orm import DeclarativeMeta, declarative_base

# Define schema name in a central location
SCHEMA_NAME = "pad_ws"

# Create metadata with schema
metadata = MetaData(schema=SCHEMA_NAME)

# Create a single shared Base for all models with the schema-aware metadata
Base: DeclarativeMeta = declarative_base(metadata=metadata)

class BaseModel:
    """Base model with common fields for all models"""
    
    # Primary key using UUID
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    
    # Timestamps for creation and updates
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert model instance to dictionary"""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
