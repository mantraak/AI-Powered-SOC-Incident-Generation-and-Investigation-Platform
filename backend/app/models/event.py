from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class ScenarioEvent(TimestampMixin, Base):
    __tablename__ = "scenario_events"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    event_type = Column(String)
    source = Column(String)
    host = Column(String)
    user = Column(String)
    message = Column(String)
    mitre_id = Column(String)
    is_malicious = Column(Boolean, default=False)
    event_data = Column(JSON, default=dict)
    timestamp = Column(DateTime(timezone=True))

    scenario = relationship("Scenario", back_populates="events")
