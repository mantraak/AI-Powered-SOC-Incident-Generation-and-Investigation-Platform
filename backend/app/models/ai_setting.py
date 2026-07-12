from sqlalchemy import Column, ForeignKey, Integer, String, Text

from app.db.base import Base, TimestampMixin


class AISetting(TimestampMixin, Base):
    __tablename__ = "ai_settings"

    endpoint = Column(String(500), nullable=False)
    model = Column(String(255), nullable=False)
    encrypted_api_key = Column(Text, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
