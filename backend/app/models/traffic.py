from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin


class ScenarioTraffic(TimestampMixin, Base):
    __tablename__ = "scenario_traffic"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    src_ip = Column(String)
    dst_ip = Column(String)
    src_port = Column(Integer)
    dst_port = Column(Integer)
    protocol = Column(String)
    packets = Column(Integer, default=0)
    bytes = Column(Integer, default=0)
    direction = Column(String)
    summary = Column(String)
    mitre_id = Column(String)
    is_malicious = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True))
    flow_data = Column(JSON, default=dict)

    scenario = relationship("Scenario", back_populates="traffic")
