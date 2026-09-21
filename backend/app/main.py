from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models.user import User
from app.core.security import get_password_hash
from app.services.mitre_sync import sync_catalog
from app.services.threat_intel import scheduler as threat_scheduler

from app.db.init_db import init_db  # also registers all models with Base

# Create missing tables and bring older databases up to the current schema
init_db(engine)


def ensure_default_admin() -> None:
    """Create or migrate the development administrator without a separate script."""
    admin_email = "admin@aisocplatform.dev"
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == admin_email).first()
        if admin:
            return
        admin = db.query(User).filter(User.email == "admin@soc.local").first()
        if admin:
            admin.email = admin_email
            admin.hashed_password = get_password_hash("Admin@1234")
            admin.role = "admin"
            admin.is_active = True
        else:
            db.add(User(
                email=admin_email,
                full_name="Platform Admin",
                hashed_password=get_password_hash("Admin@1234"),
                role="admin",
                is_active=True,
            ))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_default_admin()
    print("🚀 Starting AI-SOC Backend...")

    try:
        sync_catalog()
        print("✅ MITRE ATT&CK catalogue initialized successfully.")
    except Exception as e:
        print(f"❌ Failed to initialize MITRE ATT&CK catalogue: {e}")

    # Automated 24h Threat-Feed -> SOC Lab pipeline. Never blocks startup: the
    # scheduler is opt-out via AUTOMATED_THREAT_LABS_ENABLED / THREAT_LAB_SCHEDULER_ENABLED,
    # and any failure here leaves the rest of the platform untouched.
    try:
        if threat_scheduler.start():
            print("✅ Automated threat-lab scheduler started.")
        else:
            print("ℹ️  Automated threat-lab scheduler disabled by configuration.")
    except Exception as e:
        print(f"❌ Failed to start the automated threat-lab scheduler: {e}")

    yield

    try:
        await threat_scheduler.stop()
    except Exception:
        pass

    print("🛑 Shutting down AI-SOC Backend...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://localhost:48173",
        "https://localhost:48173",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
    }
