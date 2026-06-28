from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base, TimestampMixin


class PlayerLab(TimestampMixin, Base):
    __tablename__ = "player_labs"

    player_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    status = Column(String, default="assigned")  # assigned, in_progress, submitted, evaluated
    started_at = Column(DateTime(timezone=True))
    submitted_at = Column(DateTime(timezone=True))
    notes = Column(Text)

    player = relationship("User", back_populates="labs")
    scenario = relationship("Scenario", back_populates="labs")
