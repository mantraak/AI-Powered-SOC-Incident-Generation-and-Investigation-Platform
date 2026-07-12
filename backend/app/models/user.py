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

    # Relationships. passive_deletes=True: let PostgreSQL's ON DELETE CASCADE
    # (set on the FK columns in lab.py/score.py/player_answer.py) do the
    # cleanup when a user is deleted, instead of SQLAlchemy first trying to
    # UPDATE these rows' FK to NULL (which would fail - those columns are
    # NOT NULL - and isn't what we want here anyway).
    labs = relationship("PlayerLab", back_populates="player", passive_deletes=True)
    scores = relationship("PlayerScore", back_populates="player", passive_deletes=True)
    answers = relationship("PlayerAnswer", back_populates="player", passive_deletes=True)
