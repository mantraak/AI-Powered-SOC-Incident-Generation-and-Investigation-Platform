from sqlalchemy import Column, ForeignKey, Integer, Text

from app.db.base import Base, TimestampMixin


class NewsSetting(TimestampMixin, Base):
    """Encrypted newsdata.io credential for the threat news feed."""

    __tablename__ = "news_settings"

    encrypted_api_key = Column(Text, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
