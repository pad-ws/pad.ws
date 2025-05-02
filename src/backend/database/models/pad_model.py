from typing import List, Dict, Any, TYPE_CHECKING

from sqlalchemy import Column, String, ForeignKey, Index, UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped

from .base_model import Base, BaseModel, SCHEMA_NAME

if TYPE_CHECKING:
    from .backup_model import BackupModel
    from .user_model import UserModel

class PadModel(Base, BaseModel):
    """Model for pads table in app schema"""
    __tablename__ = "pads"
    __table_args__ = (
        Index("ix_pads_owner_id", "owner_id"),
        Index("ix_pads_display_name", "display_name"),
        {"schema": SCHEMA_NAME}
    )

    # Pad-specific fields
    owner_id = Column(
        UUID(as_uuid=True), 
        ForeignKey(f"{SCHEMA_NAME}.users.id", ondelete="CASCADE"), 
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


class TemplatePadModel(Base, BaseModel):
    """Model for template pads table in app schema"""
    __tablename__ = "template_pads"
    __table_args__ = (
        Index("ix_template_pads_display_name", "display_name"),
        Index("ix_template_pads_name", "name"),
        {"schema": SCHEMA_NAME}
    )

    name = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(100), nullable=False)
    data = Column(JSONB, nullable=False)

    def __repr__(self) -> str:
        return f"<TemplatePadModel(id='{self.id}', display_name='{self.display_name}')>"