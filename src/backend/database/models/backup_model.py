from typing import Dict, Any, Optional
from uuid import UUID as UUIDType

from sqlalchemy import Column, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped

from backend.database.models.pad_model import PadModel

from .base_model import Base, BaseModel

class BackupModel(Base, BaseModel):
    """Model for backups table in app schema"""
    __tablename__ = "backups"
    __table_args__ = (
        BaseModel.get_schema(),
        Index("ix_backups_source_id", "source_id"),
        Index("ix_backups_created_at", "created_at")
    )

    # Backup-specific fields
    source_id = Column(
        UUIDType(as_uuid=True), 
        ForeignKey(f"{BaseModel.get_schema()['schema']}.pads.id", ondelete="CASCADE"), 
        nullable=False
    )
    data = Column(JSONB, nullable=False)
    
    # Relationships
    pad: Mapped["PadModel"] = relationship("PadModel", back_populates="backups")

    def __repr__(self) -> str:
        return f"<BackupModel(id='{self.id}', created_at='{self.created_at}')>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert model instance to dictionary with additional fields"""
        result = super().to_dict()
        # Convert data to dict if it's not already
        if isinstance(result["data"], str):
            import json
            result["data"] = json.loads(result["data"])
        return result
