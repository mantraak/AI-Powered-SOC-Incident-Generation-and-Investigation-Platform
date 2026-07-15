from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.db.base import Base, TimestampMixin


class TerminalSetting(TimestampMixin, Base):
    __tablename__ = "terminal_settings"

    enabled = Column(Boolean, default=True, nullable=False)
    image = Column(String, default="ubuntu:22.04", nullable=False)
    default_minutes = Column(Integer, default=45, nullable=False)
    extension_minutes = Column(Integer, default=15, nullable=False)
    max_extensions = Column(Integer, default=2, nullable=False)
    command_timeout_seconds = Column(Integer, default=20, nullable=False)
    network_enabled = Column(Boolean, default=False, nullable=False)
    memory_limit = Column(String, default="256m", nullable=False)
    cpu_quota = Column(Integer, default=50000, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class TerminalSession(TimestampMixin, Base):
    __tablename__ = "terminal_sessions"

    player_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lab_id = Column(Integer, ForeignKey("player_labs.id", ondelete="CASCADE"), nullable=True, index=True)
    container_id = Column(String, nullable=True)
    container_name = Column(String, nullable=True, index=True)
    image = Column(String, nullable=False)
    status = Column(String, default="created", nullable=False)  # created, running, expired, stopped, error
    expires_at = Column(DateTime(timezone=True), nullable=False)
    extensions_used = Column(Integer, default=0, nullable=False)
    last_command = Column(Text, nullable=True)
    last_error = Column(Text, nullable=True)
