from sqlalchemy import Column, String, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class Question(TimestampMixin, Base):
    __tablename__ = "questions"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    order = Column(Integer)
    question_text = Column(Text)
    question_type = Column(String)  # text, multiple_choice, ip_domain, mitre, timeline, summary
    choices = Column(JSON, default=list)
    correct_answer = Column(Text)
    required_keywords = Column(JSON, default=list)
    points = Column(Integer, default=10)
    hint = Column(Text)
    related_event_ids = Column(JSON, default=list)
    related_artifact_ids = Column(JSON, default=list)

    scenario = relationship("Scenario", back_populates="questions")
    answers = relationship("PlayerAnswer", back_populates="question")
