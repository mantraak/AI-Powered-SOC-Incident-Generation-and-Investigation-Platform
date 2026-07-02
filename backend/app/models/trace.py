from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin


class ScenarioTrace(TimestampMixin, Base):
    __tablename__ = "scenario_traces"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    trace_type = Column(String)
    host = Column(String)
    process_name = Column(String)
    parent_process = Column(String)
    command_line = Column(Text)
    network_target = Column(String)
    summary = Column(Text)
    mitre_id = Column(String)
    is_malicious = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True))
    trace_data = Column(JSON, default=dict)

    scenario = relationship("Scenario", back_populates="traces")
