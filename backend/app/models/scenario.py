from sqlalchemy import Column, String, Text, Enum, JSON, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base, TimestampMixin
import enum


class ScenarioStatus(str, enum.Enum):
    draft = "draft"
    generating = "generating"
    generated = "generated"
    validation_failed = "validation_failed"
    ready = "ready"
    published = "published"


class DifficultyLevel(str, enum.Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Scenario(TimestampMixin, Base):
    __tablename__ = "scenarios"

    title = Column(String, nullable=False)
    description = Column(Text)
    article_text = Column(Text)
    mitre_techniques = Column(JSON, default=list)
    iocs = Column(JSON, default=list)
    difficulty = Column(Enum(DifficultyLevel), default=DifficultyLevel.intermediate)
    num_questions = Column(Integer, default=10)
    status = Column(Enum(ScenarioStatus), default=ScenarioStatus.draft)
    created_by = Column(Integer, ForeignKey("users.id"))

    # AI-generated content stored as JSON
    attack_steps = Column(JSON, default=list)
    timeline = Column(JSON, default=list)
    assets = Column(JSON, default=list)
    summary = Column(Text)
    celery_task_id = Column(String)

    # Relationships
    events = relationship("ScenarioEvent", back_populates="scenario", cascade="all, delete")
    artifacts = relationship("ScenarioArtifact", back_populates="scenario", cascade="all, delete")
    traffic = relationship("ScenarioTraffic", back_populates="scenario", cascade="all, delete")
    traces = relationship("ScenarioTrace", back_populates="scenario", cascade="all, delete")
    indicators = relationship("Indicator", back_populates="scenario", cascade="all, delete")
    alerts = relationship("Alert", back_populates="scenario", cascade="all, delete")
    questions = relationship("Question", back_populates="scenario", cascade="all, delete")
    containment_actions = relationship("ContainmentAction", back_populates="scenario", cascade="all, delete")
    labs = relationship("PlayerLab", back_populates="scenario")
