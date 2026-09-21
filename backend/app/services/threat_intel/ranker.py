"""Stage 5 - rank scored threats and select a diverse Top-N.

Selection is deliberately not "the N highest scores": three labs about the same
ransomware family teach one lesson three times. A category that is already
represented is penalised, so the daily set spans different threat types - while
a genuinely dominant threat can still win a second slot if its score gap is
large enough.

If fewer than N threats clear the quality bar, fewer are selected. The pipeline
never invents threats to reach N.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings
from app.services.threat_intel.correlator import ThreatCluster

# Points deducted per already-selected threat sharing the same category.
CATEGORY_REPEAT_PENALTY = 1.5


@dataclass
class ScoredThreat:
    cluster: ThreatCluster
    score: float
    breakdown: dict
    rank: int | None = None

    @property
    def fingerprint(self) -> str:
        return self.cluster.fingerprint

    @property
    def category(self) -> str:
        return self.cluster.category


class ThreatRanker:
    """Orders scored threats and picks the diverse Top-N."""

    def __init__(self, limit: int | None = None, min_score: float | None = None):
        self.limit = limit if limit is not None else settings.THREAT_LAB_GENERATION_LIMIT
        self.min_score = min_score if min_score is not None else settings.THREAT_LAB_MIN_SCORE

    def rank(self, threats: list[ScoredThreat]) -> list[ScoredThreat]:
        """Sort by score desc; ties broken deterministically by fingerprint."""
        ordered = sorted(
            threats,
            key=lambda threat: (-threat.score, threat.fingerprint),
        )
        for position, threat in enumerate(ordered, start=1):
            threat.rank = position
        return ordered

    def select_top(self, threats: list[ScoredThreat]) -> list[ScoredThreat]:
        """Diversity-aware Top-N selection over already-ranked threats."""
        eligible = [threat for threat in self.rank(threats) if threat.score >= self.min_score]
        selected: list[ScoredThreat] = []
        remaining = list(eligible)

        while remaining and len(selected) < max(0, self.limit):
            used_categories = [threat.category for threat in selected]
            best = max(
                remaining,
                key=lambda threat: (
                    threat.score - CATEGORY_REPEAT_PENALTY * used_categories.count(threat.category),
                    -threat.rank if threat.rank else 0,
                ),
            )
            selected.append(best)
            remaining.remove(best)

        # Re-number the selection 1..N in final presentation order.
        selected.sort(key=lambda threat: (-threat.score, threat.fingerprint))
        for position, threat in enumerate(selected, start=1):
            threat.rank = position
        return selected
