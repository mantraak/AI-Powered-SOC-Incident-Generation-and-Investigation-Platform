"""Latest cybersecurity incident feed, backed by newsdata.io."""

import time

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.news_setting import NewsSetting
from app.services.ai_provider import decrypt_api_key, encrypt_api_key

# newsdata.io bills per request and free plans are small, so identical queries are
# served from a short-lived in-process cache instead of hitting the API every load.
_cache: dict[tuple, tuple[float, dict]] = {}

MAX_QUERY_CHARS = 180

CYBER_DEFAULT_QUERY = (
    "cybersecurity OR cyber attack OR ransomware OR data breach OR malware OR "
    "zero-day OR vulnerability OR phishing OR threat actor"
)

CYBER_RELEVANCE_TERMS = {
    "apt",
    "breach",
    "cisa",
    "credential",
    "cve",
    "cyber",
    "cyberattack",
    "cybersecurity",
    "data breach",
    "ddos",
    "exploit",
    "exploited",
    "firewall",
    "hacker",
    "hacking",
    "infosec",
    "intrusion",
    "ioc",
    "malware",
    "microsoft patch",
    "phishing",
    "ransomware",
    "security flaw",
    "security incident",
    "security update",
    "spyware",
    "threat actor",
    "trojan",
    "vulnerability",
    "zero-day",
    "zeroday",
}

CYBER_CONTEXT_TERMS = {
    "attack",
    "campaign",
    "compromise",
    "critical",
    "incident",
    "patch",
    "privacy",
    "risk",
    "security",
    "stolen",
    "threat",
}

NON_CYBER_FALSE_POSITIVE_TERMS = {
    "football",
    "basketball",
    "cricket",
    "movie",
    "celebrity",
    "recipe",
    "stock market",
    "fashion",
}


class NewsError(RuntimeError):
    pass


class NewsKeyMissing(NewsError):
    pass


def get_api_key(db: Session) -> str:
    record = db.query(NewsSetting).order_by(NewsSetting.id.asc()).first()
    if record:
        return decrypt_api_key(record.encrypted_api_key)
    if settings.NEWSDATA_API_KEY:
        return settings.NEWSDATA_API_KEY
    raise NewsKeyMissing("No newsdata.io API key is configured. Set one in Admin › AI Settings.")


def get_public_news_config(db: Session) -> dict:
    record = db.query(NewsSetting).order_by(NewsSetting.id.asc()).first()
    if record:
        return {"api_key_configured": True, "source": "admin"}
    return {
        "api_key_configured": bool(settings.NEWSDATA_API_KEY),
        "source": "environment" if settings.NEWSDATA_API_KEY else "none",
    }


def save_api_key(db: Session, api_key: str, user_id: int) -> dict:
    api_key = api_key.strip()
    if not api_key:
        raise NewsError("A newsdata.io API key is required")
    record = db.query(NewsSetting).order_by(NewsSetting.id.asc()).first()
    if not record:
        record = NewsSetting()
        db.add(record)
    record.encrypted_api_key = encrypt_api_key(api_key)
    record.updated_by = user_id
    db.commit()
    _cache.clear()
    return get_public_news_config(db)


def _normalize_article(row: dict) -> dict | None:
    link = row.get("link") or row.get("source_url")
    title = row.get("title")
    if not link or not title:
        return None
    categories = row.get("category") or []
    return {
        "id": str(row.get("article_id") or link),
        "title": str(title)[:300],
        "link": str(link),
        "description": str(row.get("description") or "")[:600],
        "published_at": str(row.get("pubDate") or "") or None,
        "source": str(row.get("source_name") or row.get("source_id") or "Unknown source"),
        "image_url": row.get("image_url") or None,
        "categories": [str(value) for value in categories if value][:5],
    }


def _build_cyber_query(query: str | None) -> str:
    """Keep custom searches inside the cybersecurity lane."""
    raw = (query or "").strip()
    if not raw:
        return (settings.NEWS_DEFAULT_QUERY.strip() or CYBER_DEFAULT_QUERY)[:MAX_QUERY_CHARS]

    lowered = raw.lower()
    if any(term in lowered for term in CYBER_RELEVANCE_TERMS):
        return raw[:MAX_QUERY_CHARS]

    # A player/admin search like "Microsoft" or "hospital" should mean
    # cybersecurity news about that entity, not general Microsoft or hospital news.
    scoped = f"({raw}) AND (cybersecurity OR cyber attack OR data breach OR ransomware OR malware OR vulnerability)"
    return scoped[:MAX_QUERY_CHARS]


def _is_cyber_relevant(article: dict) -> bool:
    text = " ".join([
        article.get("title") or "",
        article.get("description") or "",
        article.get("source") or "",
        " ".join(article.get("categories") or []),
    ]).lower()

    if not text.strip():
        return False
    if any(term in text for term in NON_CYBER_FALSE_POSITIVE_TERMS) and not any(
        term in text for term in CYBER_RELEVANCE_TERMS
    ):
        return False
    if any(term in text for term in CYBER_RELEVANCE_TERMS):
        return True

    # Allow "security incident", "security patch", "critical vulnerability-like"
    # stories even when the word "cyber" is absent.
    return "security" in text and any(term in text for term in CYBER_CONTEXT_TERMS)


def _raise_for_newsdata_error(response: httpx.Response) -> None:
    if response.status_code == 200:
        return
    detail = ""
    try:
        payload = response.json()
        results = payload.get("results")
        if isinstance(results, dict):
            detail = str(results.get("message") or "")
    except ValueError:
        pass
    if response.status_code in (401, 403):
        raise NewsError(detail or "newsdata.io rejected the API key. Check it in Admin › AI Settings.")
    if response.status_code == 429:
        raise NewsError(detail or "newsdata.io rate limit reached. Try again later.")
    raise NewsError(detail or f"newsdata.io returned HTTP {response.status_code}")


async def fetch_latest_news(
    db: Session,
    query: str | None = None,
    page: str | None = None,
) -> dict:
    """Fetch cybersecurity headlines. Cached briefly per query to conserve API credits."""
    search = _build_cyber_query(query)
    cache_key = (search, page or "")

    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < settings.NEWS_CACHE_TTL_SECONDS:
        return {**cached[1], "cached": True}

    api_key = get_api_key(db)
    params = {
        "apikey": api_key,
        "q": search,
        "language": settings.NEWS_LANGUAGE,
    }
    if page:
        params["page"] = page

    try:
        async with httpx.AsyncClient(timeout=20.0, trust_env=False) as client:
            response = await client.get(settings.NEWSDATA_API_URL, params=params)
    except httpx.RequestError as exc:
        raise NewsError("newsdata.io is unreachable") from exc

    _raise_for_newsdata_error(response)

    try:
        payload = response.json()
    except ValueError as exc:
        raise NewsError("newsdata.io returned an unreadable response") from exc

    if payload.get("status") != "success":
        results = payload.get("results")
        message = results.get("message") if isinstance(results, dict) else None
        raise NewsError(str(message or "newsdata.io returned an error"))

    rows = payload.get("results")
    raw_articles = [
        article
        for article in (_normalize_article(row) for row in rows if isinstance(row, dict))
        if article
    ] if isinstance(rows, list) else []
    articles = [article for article in raw_articles if _is_cyber_relevant(article)]

    result = {
        "query": search,
        "articles": articles,
        "next_page": payload.get("nextPage") or None,
        "total_results": len(articles),
        "cached": False,
    }
    _cache[cache_key] = (time.time(), result)
    return result
