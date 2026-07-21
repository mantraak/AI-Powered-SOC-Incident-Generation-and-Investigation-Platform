from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Romulus"
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
    WEB_SEARCH_ENABLED: bool = True
    WEB_SEARCH_MAX_RESULTS: int = 6
    WEB_SEARCH_REGION: str = "us-en"
    WEB_SEARCH_TIMEOUT: int = 20
    WEB_SEARCH_FETCH_TOP: int = 2

    # Threat news feed. Administrators can override the key in the UI.
    NEWSDATA_API_KEY: Optional[str] = None
    NEWSDATA_API_URL: str = "https://newsdata.io/api/1/latest"
    NEWS_DEFAULT_QUERY: str = "cybersecurity OR ransomware OR data breach OR malware"
    NEWS_LANGUAGE: str = "en"
    NEWS_CACHE_TTL_SECONDS: int = 900
    MODERATOR_MAX_SOURCE_CHARS: int = 12000
    MODERATOR_MAX_DOWNLOAD_BYTES: int = 2_000_000
    WAZUH_API_URL: str = "https://wazuh.manager:55000"
    WAZUH_INDEXER_URL: str = "https://wazuh.indexer:9200"
    WAZUH_DASHBOARD_URL: str = "https://wazuh.dashboard:5601"
    WAZUH_INDEXER_USERNAME: str = "admin"
    WAZUH_INDEXER_PASSWORD: str = "SecretPassword"
    MISP_URL: str = "https://misp"
    THEHIVE_URL: str = "http://thehive:9000"
    GRAFANA_URL: str = "http://grafana:3000"
    PROMETHEUS_URL: str = "http://prometheus:9090"

    WAZUH_PUBLIC_URL: str = "https://localhost:48173/wazuh"
    MISP_PUBLIC_URL: str = "https://localhost:48173/misp"
    THEHIVE_PUBLIC_URL: str = "https://localhost:48173/thehive"
    GRAFANA_PUBLIC_URL: str = "https://localhost:48173/grafana"
    PROMETHEUS_PUBLIC_URL: str = "https://localhost:48173/prometheus"
    MISP_TRAINING_USERNAME: str = "admin@admin.test"
    MISP_TRAINING_PASSWORD: str = "ChangeMe-MISP-2026!"
    THEHIVE_TRAINING_USERNAME: str = "admin@thehive.local"
    THEHIVE_TRAINING_PASSWORD: str = "secret"
    GRAFANA_TRAINING_USERNAME: str = "admin"
    GRAFANA_TRAINING_PASSWORD: str = "ChangeMe-Grafana-2026!"

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
