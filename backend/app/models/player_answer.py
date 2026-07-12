from sqlalchemy import Column, String, Integer, ForeignKey, Text, Boolean, Float
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class PlayerAnswer(TimestampMixin, Base):
    __tablename__ = "player_answers"

<<<<<<< HEAD
    player_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    lab_id = Column(Integer, ForeignKey("player_labs.id", ondelete="CASCADE"), nullable=False)
=======
    player_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    lab_id = Column(Integer, ForeignKey("player_labs.id"), nullable=False)
>>>>>>> 06aa3bad5cbf649d56764f464d5221c3b197ed85
    answer_text = Column(Text)
    is_correct = Column(Boolean)
    points_awarded = Column(Float, default=0)
    feedback = Column(Text)
    attached_evidence = Column(String)

    player = relationship("User", back_populates="answers")
    question = relationship("Question", back_populates="answers")
