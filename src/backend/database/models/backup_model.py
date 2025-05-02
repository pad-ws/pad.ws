from uuid import uuid4

from sqlalchemy import Column, String, DateTime, func, UUID, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeMeta, relationship
from sqlalchemy.ext.declarative import declarative_base

Base: DeclarativeMeta = declarative_base()

class BackupModel(Base):
    """Model for backups table in app schema"""
    __tablename__ = "backups"
    __table_args__ = {"schema": "padws"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    source_id = Column(UUID(as_uuid=True), ForeignKey("padws.pads.id"), nullable=False)
    data = Column(JSONB, nullable=False)
    
    pad = relationship("PadModel", back_populates="backups")

    def __repr__(self):
        return f"<BackupModel(id='{self.id}')>"
