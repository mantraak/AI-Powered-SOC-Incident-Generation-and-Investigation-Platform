from sqlalchemy import Column, String, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin


class ScenarioArtifact(TimestampMixin, Base):
    __tablename__ = "scenario_artifacts"

    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    name = Column(String)
    artifact_type = Column(String)
    host = Column(String)
    content = Column(Text)
    file_path = Column(String)
    related_event_ids = Column(JSON, default=list)

    scenario = relationship("Scenario", back_populates="artifacts")
