from typing import List
from sqlalchemy import Column, Index, String
from sqlalchemy.orm import relationship, Mapped

from .base_model import Base, BaseModel
from .pad_model import PadModel

class UserModel(Base, BaseModel):
    """Model for users table in app schema"""
    __tablename__ = "users"
    __table_args__ = (
        BaseModel.get_schema(),
        Index("ix_users_username", "username"),
        Index("ix_users_email", "email")
    )

    # User-specific fields
    username = Column(String(254), nullable=False, unique=True)
    email = Column(String(254), nullable=False)
    
    # Relationships
    pads: Mapped[List["PadModel"]] = relationship(
        "PadModel", 
        back_populates="owner", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        return f"<UserModel(id='{self.id}', username='{self.username}', email='{self.email}')>"
