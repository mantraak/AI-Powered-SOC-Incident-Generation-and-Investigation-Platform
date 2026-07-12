from sqlalchemy import Column, Integer, ForeignKey, Float, Text, String
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class PlayerScore(TimestampMixin, Base):
    __tablename__ = "player_scores"

    player_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lab_id = Column(Integer, ForeignKey("player_labs.id", ondelete="CASCADE"), nullable=False)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    question_score = Column(Float, default=0)
    containment_score = Column(Float, default=0)
    total_score = Column(Float, default=0)
    max_possible = Column(Float, default=100)
    feedback = Column(Text)
    grade = Column(String)

    player = relationship("User", back_populates="scores")
