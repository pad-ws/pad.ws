from uuid import uuid4

from sqlalchemy import Column, String, DateTime, func, UUID
from sqlalchemy.orm import DeclarativeMeta, relationship
from sqlalchemy.ext.declarative import declarative_base

Base: DeclarativeMeta = declarative_base()

class UserModel(Base):
    """Model for users table in app schema"""
    __tablename__ = "users"
    __table_args__ = {"schema": "padws"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    username = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=False)
    
    pads = relationship("PadModel", back_populates="owner", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<UserModel(id='{self.id}', username='{self.username}', email='{self.email}')>"
