from sqlalchemy import Column, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin


class LabWorkspace(TimestampMixin, Base):
    __tablename__ = "lab_workspaces"

    lab_id = Column(Integer, ForeignKey("player_labs.id"), nullable=False, unique=True)
    workspace_id = Column(String, nullable=False, unique=True, index=True)
    required_tools = Column(JSON, default=list)
    status = Column(String, default="provisioning")
    encrypted_credentials = Column(Text)
    provisioning_error = Column(Text)

    lab = relationship("PlayerLab", back_populates="workspace")
