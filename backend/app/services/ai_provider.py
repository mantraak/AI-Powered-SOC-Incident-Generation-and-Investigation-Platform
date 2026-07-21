"""Encrypted AI provider configuration and OpenAI-compatible API client."""

import base64
import hashlib
import json
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai_setting import AISetting


class AIProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class AIProviderConfig:
    endpoint: str
    model: str
    api_key: str


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("ascii")


def decrypt_api_key(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise AIProviderError(
            "Stored AI key cannot be decrypted. Re-enter it after changing SECRET_KEY."
        ) from exc


def validate_endpoint(endpoint: str) -> str:
    value = endpoint.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise AIProviderError("AI endpoint must be a valid HTTPS URL")
    if parsed.username or parsed.password:
        raise AIProviderError("AI endpoint must not contain credentials")
    if not parsed.path.endswith("/chat/completions"):
        raise AIProviderError("AI endpoint must end with /chat/completions")
    return value


def get_ai_config(db: Session) -> AIProviderConfig:
    record = db.query(AISetting).order_by(AISetting.id.asc()).first()
    if record:
        return AIProviderConfig(
            endpoint=validate_endpoint(record.endpoint),
            model=record.model,
            api_key=decrypt_api_key(record.encrypted_api_key),
        )
    return AIProviderConfig(
        endpoint=validate_endpoint(settings.AI_API_ENDPOINT),
        model=settings.AI_MODEL,
        api_key=settings.NVIDIA_API_KEY or "",
    )


def get_public_ai_config(db: Session) -> dict:
    record = db.query(AISetting).order_by(AISetting.id.asc()).first()
    if record:
        return {
            "endpoint": record.endpoint,
            "model": record.model,
            "api_key_configured": bool(record.encrypted_api_key),
            "source": "admin",
        }
    return {
        "endpoint": settings.AI_API_ENDPOINT,
        "model": settings.AI_MODEL,
        "api_key_configured": bool(settings.NVIDIA_API_KEY),
        "source": "environment",
    }


def save_ai_config(
    db: Session,
    endpoint: str,
    model: str,
    api_key: str | None,
    user_id: int,
) -> dict:
    endpoint = validate_endpoint(endpoint)
    model = model.strip()
    if not model:
        raise AIProviderError("AI model is required")
    record = db.query(AISetting).order_by(AISetting.id.asc()).first()
    if not record:
        if not api_key:
            raise AIProviderError("API key is required for the first configuration")
        record = AISetting()
        db.add(record)
    if api_key:
        record.encrypted_api_key = encrypt_api_key(api_key.strip())
    record.endpoint = endpoint
    record.model = model
    record.updated_by = user_id
    db.commit()
    db.refresh(record)
    return get_public_ai_config(db)


def _extract_content(payload: dict) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIProviderError("AI provider returned an unexpected response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AIProviderError("AI provider returned an empty response")
    return content.strip()


def parse_json_content(content: str) -> dict:
    content = re.sub(r"^```json\s*", "", content.strip(), flags=re.IGNORECASE)
    content = re.sub(r"\s*```$", "", content.strip())
    try:
        value = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AIProviderError("AI response was not valid structured JSON") from exc
    if not isinstance(value, dict):
        raise AIProviderError("AI response did not contain a JSON object")
    return value


def call_ai(config: AIProviderConfig, messages: list[dict], max_tokens: int = 8192) -> str:
    if not config.api_key:
        raise AIProviderError("Configure the NVIDIA API key in Admin > AI Settings")
    response = httpx.post(
        config.endpoint,
        headers={"Authorization": f"Bearer {config.api_key}", "Accept": "application/json"},
        json={
            "model": config.model,
            "messages": messages,
            "temperature": 0.2,
            "top_p": 0.7,
            "max_tokens": max_tokens,
            "stream": False,
        },
        timeout=150.0,
    )
    response.raise_for_status()
    return _extract_content(response.json())


async def call_ai_async(
    config: AIProviderConfig,
    messages: list[dict],
    max_tokens: int = 8192,
) -> str:
    if not config.api_key:
        raise AIProviderError("Configure the NVIDIA API key in Admin > AI Settings")
    async with httpx.AsyncClient(timeout=150.0, trust_env=False) as client:
        response = await client.post(
            config.endpoint,
            headers={"Authorization": f"Bearer {config.api_key}", "Accept": "application/json"},
            json={
                "model": config.model,
                "messages": messages,
                "temperature": 0.2,
                "top_p": 0.7,
                "max_tokens": max_tokens,
                "stream": False,
            },
        )
        response.raise_for_status()
    return _extract_content(response.json())
