"""Stage 3 - correlate many articles into one underlying threat.

Ten articles about the same ransomware campaign must become ONE candidate lab,
not ten. Correlation is union-find over a set of deterministic signals, ordered
strongest-first:

    1. shared CVE id                     (hard link)
    2. shared malware / campaign name    (hard link)
    3. shared threat-actor name          (hard link)
    4. shared product + same category    (soft link)
    5. high title-token overlap          (soft link, Jaccard >= threshold)

The resulting cluster carries a stable ``fingerprint`` derived from its
strongest identity, which is what prevents duplicate labs across runs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.services.threat_intel.normalizer import NormalizedArticle, fingerprint_for

TITLE_SIMILARITY_THRESHOLD = 0.45
_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    intersection = len(left & right)
    if not intersection:
        return 0.0
    return intersection / len(left | right)


@dataclass
class ThreatCluster:
    """One unique threat, correlated from >= 1 article."""

    articles: list[NormalizedArticle] = field(default_factory=list)

    # -- aggregated entities --------------------------------------------------

    @property
    def cve_ids(self) -> list[str]:
        return sorted({cve for article in self.articles for cve in article.cve_ids})

    @property
    def malware_names(self) -> list[str]:
        return sorted({name for article in self.articles for name in article.malware_names})

    @property
    def threat_actors(self) -> list[str]:
        return sorted({name for article in self.articles for name in article.threat_actors})

    @property
    def affected_products(self) -> list[str]:
        return sorted({name for article in self.articles for name in article.affected_products})

    @property
    def mitre_techniques(self) -> list[str]:
        return sorted({value for article in self.articles for value in article.mitre_techniques})

    @property
    def iocs(self) -> list[dict]:
        seen: set[tuple[str, str]] = set()
        merged: list[dict] = []
        for article in self.articles:
            for ioc in article.iocs:
                key = (ioc["ioc_type"], ioc["value"])
                if key not in seen:
                    seen.add(key)
                    merged.append(ioc)
        return merged

    @property
    def category(self) -> str:
        counts: dict[str, int] = {}
        for article in self.articles:
            counts[article.category] = counts.get(article.category, 0) + 1
        return max(counts.items(), key=lambda item: (item[1], item[0]))[0]

    @property
    def severity(self) -> str:
        return max(
            (article.severity for article in self.articles),
            key=lambda value: _SEVERITY_ORDER.get(value, 1),
            default="medium",
        )

    @property
    def active_exploitation(self) -> bool:
        return any(article.active_exploitation for article in self.articles)

    @property
    def primary(self) -> NormalizedArticle:
        """The most informative article - used as the lab's headline source."""
        return max(
            self.articles,
            key=lambda article: (
                len(article.description),
                len(article.cve_ids),
                len(article.iocs),
            ),
        )

    @property
    def title(self) -> str:
        return self.primary.title

    @property
    def published_at(self) -> datetime | None:
        stamps = [article.published_at for article in self.articles if article.published_at]
        return max(stamps) if stamps else None

    @property
    def article_count(self) -> int:
        return len(self.articles)

    @property
    def sources(self) -> list[dict]:
        return [article.to_dict() for article in self.articles]

    @property
    def title_tokens(self) -> set[str]:
        tokens: set[str] = set()
        for article in self.articles:
            tokens |= article.title_tokens
        return tokens

    @property
    def fingerprint(self) -> str:
        """Stable identity across pipeline runs.

        Derived from the strongest entity available so that tomorrow's follow-up
        coverage of the same CVE/campaign maps onto the same fingerprint and
        therefore cannot produce a second lab.
        """
        if self.cve_ids:
            return fingerprint_for(["cve"] + self.cve_ids)
        if self.malware_names:
            return fingerprint_for(["malware"] + self.malware_names + [self.category])
        if self.threat_actors:
            return fingerprint_for(["actor"] + self.threat_actors + [self.category])
        if self.affected_products:
            return fingerprint_for(["product"] + self.affected_products + [self.category])
        return fingerprint_for(["title", self.category] + sorted(self.title_tokens)[:8])

    @property
    def identity_keys(self) -> list[str]:
        """All identities this cluster answers to (used for cross-checks)."""
        keys = [f"cve:{value}" for value in self.cve_ids]
        keys += [f"malware:{value}" for value in self.malware_names]
        keys += [f"actor:{value}" for value in self.threat_actors]
        return keys

    def summary_text(self) -> str:
        """Combined reporting text handed to the AI scenario generator."""
        parts = []
        for article in sorted(
            self.articles,
            key=lambda item: len(item.description),
            reverse=True,
        ):
            parts.append(f"[{article.source}] {article.title}\n{article.description}".strip())
        return "\n\n".join(parts)[:8000]


class ThreatCorrelator:
    """Groups normalized articles into unique ``ThreatCluster`` objects."""

    def __init__(self, title_threshold: float = TITLE_SIMILARITY_THRESHOLD):
        self.title_threshold = title_threshold

    def correlate(self, articles: list[NormalizedArticle]) -> list[ThreatCluster]:
        if not articles:
            return []

        parent = list(range(len(articles)))

        def find(index: int) -> int:
            while parent[index] != index:
                parent[index] = parent[parent[index]]
                index = parent[index]
            return index

        def union(left: int, right: int) -> None:
            root_left, root_right = find(left), find(right)
            if root_left != root_right:
                parent[max(root_left, root_right)] = min(root_left, root_right)

        # Hard links: any shared strong entity means the same threat.
        for attribute in ("cve_ids", "malware_names", "threat_actors"):
            buckets: dict[str, list[int]] = {}
            for index, article in enumerate(articles):
                for value in getattr(article, attribute):
                    buckets.setdefault(value.lower(), []).append(index)
            for indexes in buckets.values():
                for other in indexes[1:]:
                    union(indexes[0], other)

        # Soft links: same product + same category, or similar titles.
        for i in range(len(articles)):
            for j in range(i + 1, len(articles)):
                if find(i) == find(j):
                    continue
                if self._soft_match(articles[i], articles[j]):
                    union(i, j)

        grouped: dict[int, ThreatCluster] = {}
        for index, article in enumerate(articles):
            grouped.setdefault(find(index), ThreatCluster()).articles.append(article)

        clusters = list(grouped.values())
        clusters.sort(key=lambda cluster: cluster.article_count, reverse=True)
        return clusters

    def _soft_match(self, left: NormalizedArticle, right: NormalizedArticle) -> bool:
        if jaccard(left.title_tokens, right.title_tokens) >= self.title_threshold:
            return True
        shared_products = set(left.affected_products) & set(right.affected_products)
        if shared_products and left.category == right.category:
            # Product + category alone is weak; require some title overlap too so
            # "Windows patch" and "Windows ransomware" do not merge.
            return jaccard(left.title_tokens, right.title_tokens) >= self.title_threshold / 2
        return False
