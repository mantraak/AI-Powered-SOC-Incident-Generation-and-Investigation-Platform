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

ADMIN_EMAIL = "admin@aisocplatform.dev"
LEGACY_ADMIN_EMAIL = "admin@soc.local"
ADMIN_PASSWORD = "Admin@1234"

db = SessionLocal()
try:
    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if not existing:
        legacy_admin = db.query(User).filter(User.email == LEGACY_ADMIN_EMAIL).first()
        if legacy_admin:
            legacy_admin.email = ADMIN_EMAIL
            legacy_admin.hashed_password = get_password_hash(ADMIN_PASSWORD)
            legacy_admin.role = "admin"
            legacy_admin.is_active = True
            print(f"✅ Admin user migrated: {LEGACY_ADMIN_EMAIL} → {ADMIN_EMAIL}")
        else:
            admin = User(
                email=ADMIN_EMAIL,
                full_name="Platform Admin",
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            print(f"✅ Admin user created: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        db.commit()
    else:
        print(f"ℹ️  Admin user already exists: {ADMIN_EMAIL}")
finally:
    db.close()
