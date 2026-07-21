from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class Indicator(TimestampMixin, Base):
    __tablename__ = "indicators"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    ioc_type = Column(String)  # ip, domain, hash, url, filename
    value = Column(String)
    description = Column(String)
    mitre_id = Column(String)

    scenario = relationship("Scenario", back_populates="indicators")
