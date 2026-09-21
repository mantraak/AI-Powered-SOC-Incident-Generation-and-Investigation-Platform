"""Stage 4 - deterministic, explainable threat-priority scoring.

No LLM opinion is involved: every point is attributable to a named component,
and the breakdown is persisted alongside the score so an administrator (or a
student) can see exactly why a threat ranked where it did.

    raw = severity + exploitability + active_exploitation + impact
        + affected_systems + recency + investigation_value + confidence

The raw total is normalised onto a 0-10 display scale.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.threat_intel.correlator import ThreatCluster
from app.services.threat_intel.normalizer import (
    IMPACT_KEYWORDS,
    INVESTIGATION_VALUE_KEYWORDS,
)

# component -> maximum contribution. Sum defines the raw ceiling.
COMPONENT_WEIGHTS: dict[str, float] = {
    "severity": 3.0,
    "exploitability": 2.0,
    "active_exploitation": 2.5,
    "impact": 2.0,
    "affected_systems": 1.5,
    "recency": 1.5,
    "investigation_value": 2.0,
    "confidence": 1.5,
}

THEORETICAL_MAX = sum(COMPONENT_WEIGHTS.values())  # 16.0

# No real threat maxes out every component at once (a ransomware campaign has no
# CVE exploitability; a patch advisory has no active exploitation). Normalising
# against the theoretical ceiling would compress every real score into the lower
# half of the scale, so the display scale is anchored to an attainable maximum
# and clamped at 10.
MAX_RAW_SCORE = 13.0
DISPLAY_SCALE = 10.0

_SEVERITY_POINTS = {"critical": 3.0, "high": 2.2, "medium": 1.2, "low": 0.5}

_EXPLOITABILITY_KEYWORDS = (
    "remote code execution", "rce", "unauthenticated", "no user interaction",
    "wormable", "public exploit", "proof-of-concept", "poc exploit", "exploit code",
    "pre-auth", "authentication bypass", "privilege escalation", "sql injection",
    "path traversal", "deserialization", "command injection",
)


class ThreatScorer:
    """Scores a ``ThreatCluster``; returns ``(score_0_10, breakdown)``."""

    def __init__(self, now: datetime | None = None):
        self.now = now or datetime.now(timezone.utc)

    def score(self, cluster: ThreatCluster) -> tuple[float, dict]:
        text = " ".join(article.text for article in cluster.articles).lower()

        components = {
            "severity": self._severity(cluster),
            "exploitability": self._exploitability(cluster, text),
            "active_exploitation": self._active_exploitation(cluster),
            "impact": self._impact(text),
            "affected_systems": self._affected_systems(cluster),
            "recency": self._recency(cluster),
            "investigation_value": self._investigation_value(cluster, text),
            "confidence": self._confidence(cluster),
        }

        raw = round(sum(components.values()), 3)
        normalized = round(min(DISPLAY_SCALE, raw / MAX_RAW_SCORE * DISPLAY_SCALE), 2)

        breakdown = {
            "components": {key: round(value, 3) for key, value in components.items()},
            "weights": COMPONENT_WEIGHTS,
            "raw_score": raw,
            "max_raw_score": MAX_RAW_SCORE,
            "theoretical_max": THEORETICAL_MAX,
            "normalized_score": normalized,
            "explanation": self._explain(cluster, components),
            "scored_at": self.now.isoformat(),
        }
        return normalized, breakdown

    # -- components -----------------------------------------------------------

    @staticmethod
    def _severity(cluster: ThreatCluster) -> float:
        return _SEVERITY_POINTS.get(cluster.severity, 1.2)

    @staticmethod
    def _exploitability(cluster: ThreatCluster, text: str) -> float:
        points = 0.0
        if cluster.cve_ids:
            points += 0.8
        hits = sum(1 for keyword in _EXPLOITABILITY_KEYWORDS if keyword in text)
        points += min(1.2, hits * 0.4)
        return min(COMPONENT_WEIGHTS["exploitability"], points)

    @staticmethod
    def _active_exploitation(cluster: ThreatCluster) -> float:
        if not cluster.active_exploitation:
            return 0.0
        # Corroboration by several outlets raises confidence in the claim.
        confirming = sum(1 for article in cluster.articles if article.active_exploitation)
        return min(COMPONENT_WEIGHTS["active_exploitation"], 1.8 + 0.35 * (confirming - 1))

    @staticmethod
    def _impact(text: str) -> float:
        hits = sum(1 for keyword in IMPACT_KEYWORDS if keyword in text)
        return min(COMPONENT_WEIGHTS["impact"], hits * 0.4)

    @staticmethod
    def _affected_systems(cluster: ThreatCluster) -> float:
        return min(COMPONENT_WEIGHTS["affected_systems"], len(cluster.affected_products) * 0.5)

    def _recency(self, cluster: ThreatCluster) -> float:
        published = cluster.published_at
        if not published:
            return COMPONENT_WEIGHTS["recency"] * 0.5
        if not published.tzinfo:
            published = published.replace(tzinfo=timezone.utc)
        age_hours = max(0.0, (self.now - published).total_seconds() / 3600)
        if age_hours <= 6:
            return COMPONENT_WEIGHTS["recency"]
        if age_hours <= 12:
            return COMPONENT_WEIGHTS["recency"] * 0.8
        if age_hours <= 24:
            return COMPONENT_WEIGHTS["recency"] * 0.6
        if age_hours <= 48:
            return COMPONENT_WEIGHTS["recency"] * 0.3
        return 0.0

    @staticmethod
    def _investigation_value(cluster: ThreatCluster, text: str) -> float:
        """Can a student actually investigate this, or is it just news?"""
        points = 0.0
        if cluster.iocs:
            points += min(0.8, 0.2 * len(cluster.iocs))
        if cluster.mitre_techniques:
            points += 0.4
        if cluster.cve_ids:
            points += 0.3
        hits = sum(1 for keyword in INVESTIGATION_VALUE_KEYWORDS if keyword in text)
        points += min(0.8, hits * 0.2)
        # A threat with no technical hooks at all cannot make a good lab.
        if not (cluster.cve_ids or cluster.malware_names or cluster.threat_actors
                or cluster.affected_products):
            points *= 0.5
        return min(COMPONENT_WEIGHTS["investigation_value"], points)

    @staticmethod
    def _confidence(cluster: ThreatCluster) -> float:
        """Independent corroboration + description richness."""
        distinct_sources = len({article.source for article in cluster.articles})
        points = min(1.0, 0.4 * distinct_sources)
        if any(len(article.description) > 200 for article in cluster.articles):
            points += 0.5
        return min(COMPONENT_WEIGHTS["confidence"], points)

    # -- explanation ----------------------------------------------------------

    @staticmethod
    def _explain(cluster: ThreatCluster, components: dict[str, float]) -> list[str]:
        reasons = []
        top = sorted(components.items(), key=lambda item: item[1], reverse=True)
        labels = {
            "severity": f"Reported severity is {cluster.severity}",
            "exploitability": "Reporting describes an exploitable weakness",
            "active_exploitation": "Exploitation activity reported in the wild",
            "impact": "Wide or high-value impact described",
            "affected_systems": (
                "Affects " + ", ".join(cluster.affected_products[:4])
                if cluster.affected_products else "Affected systems identified"
            ),
            "recency": "Reported within the current intelligence window",
            "investigation_value": "Usable investigation artefacts are available",
            "confidence": f"Corroborated by {cluster.article_count} article(s)",
        }
        for key, value in top:
            if value > 0:
                reasons.append(f"{labels[key]} (+{round(value, 2)})")
        if cluster.cve_ids:
            reasons.append("Tracked CVEs: " + ", ".join(cluster.cve_ids[:5]))
        return reasons[:8]
