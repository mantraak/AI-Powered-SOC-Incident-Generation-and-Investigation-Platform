from sqlalchemy import Column, String, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    title = Column(String)
    severity = Column(String)  # low, medium, high, critical
    description = Column(Text)
    mitre_id = Column(String)
    rule_name = Column(String)

    scenario = relationship("Scenario", back_populates="alerts")
