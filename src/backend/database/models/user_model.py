from typing import List, TYPE_CHECKING
from sqlalchemy import Column, Index, String, UUID, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped

from .base_model import Base, BaseModel, SCHEMA_NAME

if TYPE_CHECKING:
    from .pad_model import PadModel

class UserModel(Base, BaseModel):
    """Model for users table in app schema"""
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_username", "username"),
        Index("ix_users_email", "email"),
        {"schema": SCHEMA_NAME}
    )

    # Override the default id column to use Keycloak's UUID
    id = Column(UUID(as_uuid=True), primary_key=True)

    # User-specific fields
    username = Column(String(254), nullable=False, unique=True)
    email = Column(String(254), nullable=False)
    email_verified = Column(Boolean, nullable=False, default=False)
    name = Column(String(254), nullable=True)
    given_name = Column(String(254), nullable=True)
    family_name = Column(String(254), nullable=True)
    roles = Column(JSONB, nullable=False, default=[])
    
    # Relationships
    pads: Mapped[List["PadModel"]] = relationship(
        "PadModel", 
        back_populates="owner", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        return f"<UserModel(id='{self.id}', username='{self.username}', email='{self.email}')>"
