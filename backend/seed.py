"""
Seed script – creates the default admin account if it does not exist.
Run once after the database tables are created:
    python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.db.session import SessionLocal
from app.db.base import Base
from app.db.session import engine
import app.db.init_db  # noqa – registers models

Base.metadata.create_all(bind=engine)

from app.models.user import User
from app.core.security import get_password_hash

db = SessionLocal()
try:
    existing = db.query(User).filter(User.email == "admin@soc.local").first()
    if not existing:
        admin = User(
            email="admin@soc.local",
            full_name="Platform Admin",
            hashed_password=get_password_hash("Admin@1234"),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("✅ Admin user created: admin@soc.local / Admin@1234")
    else:
        print("ℹ️  Admin user already exists.")
finally:
    db.close()
