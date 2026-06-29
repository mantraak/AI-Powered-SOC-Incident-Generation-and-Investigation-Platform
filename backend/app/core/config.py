from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "AI SOC Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aisoc"

    SECRET_KEY: str = "ChangeThisToALongRandomSecretKey123!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    REDIS_URL: str = "redis://localhost:6379/0"

    # Environment fallback; administrators can override these in the UI.
    NVIDIA_API_KEY: Optional[str] = None
    AI_API_ENDPOINT: str = "https://integrate.api.nvidia.com/v1/chat/completions"
    AI_MODEL: str = "meta/llama-3.3-70b-instruct"
    MODERATOR_MAX_LINKS: int = 4
    MODERATOR_MAX_SOURCE_CHARS: int = 12000
    MODERATOR_MAX_DOWNLOAD_BYTES: int = 2_000_000

    WAZUH_API_URL: str = "https://wazuh.manager:55000"
    MISP_URL: str = "https://misp"
    THEHIVE_URL: str = "http://thehive:9000"
    GRAFANA_URL: str = "http://grafana:3000"
    PROMETHEUS_URL: str = "http://prometheus:9090"

    WAZUH_PUBLIC_URL: str = "https://localhost:8443"
    MISP_PUBLIC_URL: str = "https://localhost:10443"
    THEHIVE_PUBLIC_URL: str = "http://localhost:9000/thehive"
    GRAFANA_PUBLIC_URL: str = "http://localhost:3001"
    PROMETHEUS_PUBLIC_URL: str = "http://localhost:9090"

    MITRE_ATTACK_VERSION: str = "19.1"
    MITRE_STIX_URL: str = (
        "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/"
        "master/enterprise-attack/enterprise-attack-19.1.json"
    )
    MITRE_CATALOG_PATH: str = "/app/data/mitre/catalog.json"
    MITRE_FORCE_SYNC: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
