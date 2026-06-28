from sqlalchemy import Column, String, Boolean, Enum
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin
import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    player = "player"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.player, nullable=False)
    is_active = Column(Boolean, default=True)

    # Relationships
    labs = relationship("PlayerLab", back_populates="player")
    scores = relationship("PlayerScore", back_populates="player")
    answers = relationship("PlayerAnswer", back_populates="player")
