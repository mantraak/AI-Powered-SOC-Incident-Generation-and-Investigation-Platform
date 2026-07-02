from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.services.mitre_sync import sync_catalog

import app.db.init_db  # noqa: F401 – registers all models with Base

# Create database tables (development only)
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
