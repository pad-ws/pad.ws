from uuid import uuid4

from sqlalchemy import Column, String, DateTime, func, UUID, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeMeta, relationship
from sqlalchemy.ext.declarative import declarative_base

Base: DeclarativeMeta = declarative_base()

class PadModel(Base):
    """Model for pads table in app schema"""
    __tablename__ = "pads"
    __table_args__ = {"schema": "padws"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    owner_id = Column(UUID(as_uuid=True), ForeignKey("padws.users.id"), nullable=False)
    display_name = Column(String, nullable=False)
    data = Column(JSONB, nullable=False)
    
    owner = relationship("UserModel", back_populates="pads")
    backups = relationship("BackupModel", back_populates="pad", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PadModel(id='{self.id}')>"
