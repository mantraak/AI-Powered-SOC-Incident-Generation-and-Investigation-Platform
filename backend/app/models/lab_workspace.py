from sqlalchemy import Column, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin


class LabWorkspace(TimestampMixin, Base):
    __tablename__ = "lab_workspaces"

<<<<<<< HEAD
    lab_id = Column(Integer, ForeignKey("player_labs.id", ondelete="CASCADE"), nullable=False, unique=True)
=======
    lab_id = Column(Integer, ForeignKey("player_labs.id"), nullable=False, unique=True)
>>>>>>> 06aa3bad5cbf649d56764f464d5221c3b197ed85
    workspace_id = Column(String, nullable=False, unique=True, index=True)
    required_tools = Column(JSON, default=list)
    status = Column(String, default="provisioning")
    encrypted_credentials = Column(Text)
    provisioning_error = Column(Text)

    lab = relationship("PlayerLab", back_populates="workspace")
