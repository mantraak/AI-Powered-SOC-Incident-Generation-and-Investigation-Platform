from sqlalchemy import Column, String, Integer, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class ContainmentAction(TimestampMixin, Base):
    __tablename__ = "containment_actions"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    action_type = Column(String)  # isolate_host, disable_account, block_ip, block_domain, revoke_token, quarantine_file
    target = Column(String)
    description = Column(Text)
    is_correct = Column(String, default="positive")  # positive, negative, neutral
    points = Column(Float, default=10)

    scenario = relationship("Scenario", back_populates="containment_actions")
