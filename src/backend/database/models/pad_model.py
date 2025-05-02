from typing import List, Dict, Any, Optional
from uuid import UUID as UUIDType

from sqlalchemy import Column, String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped

from .base_model import Base, BaseModel
from .backup_model import BackupModel
from .user_model import UserModel

class PadModel(Base, BaseModel):
    """Model for pads table in app schema"""
    __tablename__ = "pads"
    __table_args__ = (
        BaseModel.get_schema(),
        Index("ix_pads_owner_id", "owner_id"),
        Index("ix_pads_display_name", "display_name")
    )

    # Pad-specific fields
    owner_id = Column(
        UUIDType(as_uuid=True), 
        ForeignKey(f"{BaseModel.get_schema()['schema']}.users.id", ondelete="CASCADE"), 
        nullable=False
    )
    display_name = Column(String(100), nullable=False)
    data = Column(JSONB, nullable=False)
    
    # Relationships
    owner: Mapped["UserModel"] = relationship("UserModel", back_populates="pads")
    backups: Mapped[List["BackupModel"]] = relationship(
        "BackupModel", 
        back_populates="pad", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<PadModel(id='{self.id}', display_name='{self.display_name}')>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert model instance to dictionary with additional fields"""
        result = super().to_dict()
        # Convert data to dict if it's not already
        if isinstance(result["data"], str):
            import json
            result["data"] = json.loads(result["data"])
        return result
