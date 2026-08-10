"""Stage 1 - collect the last-24h threat feed via the existing news service.

Reuses ``app.services.news_service.fetch_latest_news`` verbatim (same API key
resolution, same cache, same error types) so the manual Threat Feed page and
the automated pipeline always see the same upstream data.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.news_service import NewsError, NewsKeyMissing, fetch_latest_news
from app.services.threat_intel.normalizer import parse_published

logger = logging.getLogger(__name__)


class ThreatFeedCollector:
    """Fetches the configured feed queries and windows them to the last N hours."""

    def __init__(self, lookback_hours: int | None = None, queries: list[str] | None = None):
        self.lookback_hours = lookback_hours or settings.THREAT_FEED_LOOKBACK_HOURS
        self.queries = queries if queries is not None else self.configured_queries()

    @staticmethod
    def configured_queries() -> list[str]:
        raw = settings.THREAT_FEED_QUERIES or settings.NEWS_DEFAULT_QUERY
        queries = [part.strip() for part in str(raw).split(",") if part.strip()]
        return queries or [settings.NEWS_DEFAULT_QUERY]

    async def collect(self, db: Session) -> tuple[list[dict], list[dict]]:
        """Return ``(articles, errors)``.

        A failure on one query never aborts the others: partial feed data still
        produces labs, and the errors are recorded on the ThreatFeedRun.
        """
        collected: dict[str, dict] = {}
        errors: list[dict] = []

        for query in self.queries:
            try:
                feed = await fetch_latest_news(db, query)
            except NewsKeyMissing as exc:
                # No key at all - nothing any query can do; surface once and stop.
                errors.append({"stage": "collect", "query": query, "error": str(exc)})
                logger.warning("Threat feed collection skipped: %s", exc)
                break
            except NewsError as exc:
                errors.append({"stage": "collect", "query": query, "error": str(exc)})
                logger.warning("Threat feed query %r failed: %s", query, exc)
                continue
            except Exception as exc:  # noqa: BLE001 - network/parse edge cases
                errors.append({
                    "stage": "collect",
                    "query": query,
                    "error": f"{exc.__class__.__name__}: {exc}",
                })
                logger.exception("Unexpected threat feed failure for query %r", query)
                continue

            for article in feed.get("articles") or []:
                if not isinstance(article, dict):
                    continue
                # The same story is regularly returned by several queries; the
                # link is the stable cross-query identity.
                key = str(article.get("link") or article.get("id") or "")
                if key and key not in collected:
                    collected[key] = article

        return list(collected.values()), errors

    def within_window(self, articles: list[dict], now: datetime | None = None) -> list[dict]:
        """Keep articles published inside the lookback window.

        Articles with an unparseable/missing timestamp are kept: newsdata.io only
        returns recent items, and dropping them would silently lose threats.
        """
        now = now or datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=self.lookback_hours)
        windowed = []
        for article in articles:
            published = parse_published(article.get("published_at") or article.get("pubDate"))
            if published is None or published >= cutoff:
                windowed.append(article)
        return windowed
