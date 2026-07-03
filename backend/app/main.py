from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User
from app.core.security import get_password_hash
from app.services.mitre_sync import sync_catalog

import app.db.init_db  # noqa: F401 – registers all models with Base

# Create database tables (development only)
Base.metadata.create_all(bind=engine)


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

    yield

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
