from uuid import uuid4
from datetime import datetime
from typing import Any, Dict

from sqlalchemy import Column, DateTime, UUID, func
from sqlalchemy.orm import DeclarativeMeta, declarative_base

# Create a single shared Base for all models
Base: DeclarativeMeta = declarative_base()

# Define schema name in a central location
SCHEMA_NAME = "padws"

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
    
    @classmethod
    def get_schema(cls) -> Dict[str, Any]:
        """Return schema configuration for the model"""
        return {"schema": SCHEMA_NAME}
