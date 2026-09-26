"""Stage 2 - normalise raw feed articles and extract threat entities/IOCs.

Everything here is deterministic and offline: no AI call, no network. That
keeps the expensive/failure-prone parts of the pipeline (feed + AI) isolated
to their own stages and makes correlation and scoring fully unit-testable.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

# -- Entity patterns -----------------------------------------------------------

CVE_RE = re.compile(r"\bCVE[-\s]?(\d{4})[-\s]?(\d{4,7})\b", re.IGNORECASE)
MITRE_RE = re.compile(r"\bT\d{4}(?:\.\d{3})?\b")
IPV4_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
HASH_RE = re.compile(r"\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b")
DOMAIN_RE = re.compile(
    r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+"
    r"(?:com|net|org|io|ru|cn|info|biz|xyz|top|onion|co|uk|de|fr|jp|br|in|site|online|shop|club)\b"
)

# Domains that are news outlets / vendors rather than indicators.
_DOMAIN_STOPLIST = {
    "bleepingcomputer.com", "thehackernews.com", "securityweek.com", "darkreading.com",
    "krebsonsecurity.com", "therecord.media", "infosecurity-magazine.com", "zdnet.com",
    "techcrunch.com", "reuters.com", "bbc.co.uk", "theregister.com", "wired.com",
    "cisa.gov", "nist.gov", "microsoft.com", "google.com", "twitter.com", "x.com",
    "linkedin.com", "facebook.com", "youtube.com", "github.com", "cve.org", "mitre.org",
    "forbes.com", "cnn.com", "helpnetsecurity.com", "scmagazine.com", "cyberscoop.com",
}

# Reserved / documentation ranges that are never useful as IOCs.
_IP_STOPLIST_PREFIXES = ("0.", "127.", "255.")

KNOWN_MALWARE = [
    "lockbit", "blackcat", "alphv", "clop", "cl0p", "conti", "revil", "royal", "akira",
    "black basta", "rhysida", "medusa", "qakbot", "qbot", "emotet",
    "trickbot", "icedid", "bumblebee", "raspberry robin", "cobalt strike", "brute ratel",
    "agent tesla", "redline", "lumma", "vidar", "raccoon", "formbook", "remcos", "asyncrat",
    "njrat", "gootloader", "socgholish", "darkgate", "pikabot", "latrodectus", "strela",
    "mirai", "xworm", "snake keylogger", "amadey", "danabot", "rhadamanthys", "stealc",
    "hive", "8base", "cactus", "inc ransom", "qilin", "safepay", "termite", "fog ransomware",
]

KNOWN_ACTORS = [
    "apt28", "apt29", "apt41", "apt10", "apt34", "apt37", "apt38", "apt43",
    "fancy bear", "cozy bear", "midnight blizzard", "nobelium", "sandworm", "turla",
    "lazarus", "kimsuky", "andariel", "bluenoroff", "charming kitten", "muddywater",
    "volt typhoon", "salt typhoon", "flax typhoon", "silk typhoon", "storm-0558",
    "scattered spider", "lapsus", "fin7", "fin11", "ta505", "ta577", "wizard spider",
    "evil corp", "carbanak", "sidewinder", "mustang panda", "gamaredon",
    "unc3944", "unc2452", "star blizzard", "secret blizzard",
]

KNOWN_PRODUCTS = [
    "windows", "active directory", "exchange", "sharepoint", "microsoft 365", "entra id",
    "azure", "aws", "s3", "google cloud", "okta", "citrix", "netscaler", "fortinet",
    "fortios", "fortigate", "ivanti", "pulse secure", "connect secure", "palo alto",
    "pan-os", "globalprotect", "sonicwall", "cisco", "ios xe", "asa", "vmware", "esxi",
    "vcenter", "horizon", "jenkins", "gitlab", "atlassian", "confluence", "jira",
    "moveit", "goanywhere", "cleo", "solarwinds", "veeam", "backup exec", "papercut",
    "progress", "wordpress", "drupal", "magento", "apache", "struts", "tomcat", "log4j",
    "openssl", "linux", "kubernetes", "docker", "chrome", "firefox", "safari", "ios",
    "android", "macos", "outlook", "teams", "zimbra", "roundcube", "salesforce",
    "servicenow", "sap", "oracle", "mysql", "postgresql", "mongodb", "elasticsearch",
    "qnap", "synology", "zyxel", "d-link", "tp-link",
]

# category -> keywords. Ordered by specificity; first match wins.
CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("ransomware", ("ransomware", "ransom demand", "encrypts files", "double extortion", "leak site")),
    ("vulnerability", ("zero-day", "zero day", "0-day", "vulnerability", "cve-", "rce",
                       "remote code execution", "patch tuesday", "security update", "exploit",
                       "privilege escalation", "sql injection", "buffer overflow")),
    ("supply_chain", ("supply chain", "supply-chain", "npm package", "pypi package",
                      "malicious package", "compromised update", "third-party breach")),
    ("cloud_identity", ("cloud credential", "identity provider", "oauth", "saml", "mfa bypass",
                        "session token", "access key", "single sign-on", "sso",
                        "azure ad", "entra id", "okta")),
    ("phishing", ("phishing", "spear-phishing", "smishing", "vishing",
                  "business email compromise", "credential harvest")),
    ("malware", ("malware", "trojan", "backdoor", "infostealer", "stealer", "botnet",
                 "loader", "rootkit", "wiper", "spyware")),
    ("apt", ("nation-state", "state-sponsored", "espionage", "advanced persistent")),
    ("data_breach", ("data breach", "breach", "leaked", "exposed database", "records exposed",
                     "data theft", "stolen data")),
    ("ddos", ("ddos", "denial of service", "botnet attack")),
    ("insider_threat", ("insider threat", "rogue employee", "insider attack")),
]

SEVERITY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "critical": ("critical", "cvss 10", "cvss 9", "catastrophic", "wormable",
                 "unauthenticated remote code execution", "emergency patch", "kev catalog"),
    "high": ("high severity", "severe", "widespread", "mass exploitation", "urgent",
             "remote code execution", "privilege escalation", "millions of"),
    "medium": ("medium severity", "moderate", "limited impact"),
    "low": ("low severity", "minor", "proof of concept only"),
}

ACTIVE_EXPLOITATION_KEYWORDS = (
    "actively exploited", "exploited in the wild", "in-the-wild exploitation",
    "under active attack", "active exploitation", "being exploited", "exploitation attempts",
    "attacks observed", "known exploited vulnerabilities", "mass exploitation",
    "zero-day exploited", "has been exploited", "ongoing attacks", "ongoing campaign",
)

IMPACT_KEYWORDS = (
    "millions", "thousands of organizations", "worldwide", "global", "critical infrastructure",
    "hospital", "government", "federal agencies", "banks", "financial", "power grid",
    "water utility", "airline", "telecom", "enterprise", "fortune 500", "supply chain",
    "customers affected", "records", "nationwide",
)

INVESTIGATION_VALUE_KEYWORDS = (
    "indicators of compromise", "ioc", "detection", "yara", "sigma", "log", "telemetry",
    "hunting", "forensic", "command-and-control", "command and control", "c2", "tactics",
    "techniques", "mitre att&ck", "att&ck", "sha256", "malicious domain", "malicious ip",
    "incident response", "compromise assessment",
)

# Terms that mark an article as *not* an actionable SOC threat.
NON_THREAT_KEYWORDS = (
    "stock", "shares", "earnings", "acquisition", "funding round", "series a", "series b",
    "ipo", "appoints", "hires", "promotion", "webinar", "conference agenda", "opinion",
    "predictions for", "best antivirus", "vpn deal", "black friday", "discount", "review:",
    "how to choose", "buyer", "market size", "market report", "cagr",
)

SECURITY_RELEVANCE_KEYWORDS = (
    "attack", "hacker", "hacking", "cyber", "security", "threat", "malware", "ransomware",
    "breach", "vulnerability", "exploit", "phishing", "compromise", "intrusion", "botnet",
    "espionage", "backdoor", "credential", "patch", "cve", "apt", "incident", "victim",
    "extortion", "leak", "stealer",
)

# Terms that unambiguously describe a security incident. Words such as
# "security", "threat", "attack", "exploit" or "vulnerability" also appear in
# politics, sport and climate news ("the striker exploited the gap"), so they
# only count as corroboration, never as the primary signal.
INCIDENT_KEYWORDS = (
    "ransomware", "malware", "cyberattack", "cyber attack", "cyber-attack", "data breach",
    "security breach", "hacked", "hacker", "hacking", "zero-day", "zero day", "0-day",
    "security vulnerability", "security flaw", "phishing", "spyware", "botnet",
    "backdoor", "trojan", "infostealer", "stealer", "wiper", "ddos", "denial of service",
    "cyber espionage", "threat actor", "credential theft", "stolen credentials",
    "data leak", "leaked data", "supply chain attack", "command-and-control",
    "command and control",
)

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9&.+-]*")
_TITLE_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "in", "on", "to", "for", "with", "by", "from",
    "as", "at", "is", "are", "was", "were", "be", "been", "it", "its", "this", "that",
    "new", "now", "after", "over", "into", "amid", "says", "said", "report", "reports",
    "reported", "reportedly", "how", "why", "what", "when", "more", "than", "up", "out",
    "you", "your", "we", "us", "they", "their", "can", "could", "may", "might", "will",
    "have", "has", "had", "not", "but", "also", "about", "against", "via", "using", "use",
    "used", "attack", "attacks", "cyber", "cybersecurity", "security", "hackers", "hacker",
    "flaw", "flaws", "bug", "bugs", "issue", "issues", "users", "user", "million", "billion",
}


_KEYWORD_PATTERNS: dict[str, re.Pattern] = {}


def keyword_pattern(keyword: str) -> re.Pattern:
    """Whole-word pattern for a keyword, tolerating plural/verb suffixes.

    Plain substring tests let short terms fire inside unrelated words ("rce" in
    "source", "apt" in "captain", "sso" in "association"), which is how general
    news was being tagged as vulnerabilities. Keywords ending in punctuation
    (e.g. "cve-", "review:") are treated as prefixes.
    """
    pattern = _KEYWORD_PATTERNS.get(keyword)
    if pattern is None:
        body = re.escape(keyword)
        if keyword[-1:].isalnum():
            body += r"(?:s|es|ed|ing)?(?![a-z0-9])"
        pattern = re.compile(rf"(?<![a-z0-9]){body}")
        _KEYWORD_PATTERNS[keyword] = pattern
    return pattern


def has_keyword(lowered: str, keyword: str) -> bool:
    return keyword_pattern(keyword).search(lowered) is not None


def has_any(lowered: str, keywords) -> bool:
    return any(has_keyword(lowered, keyword) for keyword in keywords)


def count_keywords(lowered: str, keywords) -> int:
    return sum(1 for keyword in keywords if has_keyword(lowered, keyword))


@dataclass
class NormalizedArticle:
    """A feed article reduced to structured, comparable threat facts."""

    article_id: str
    title: str
    link: str
    description: str
    source: str
    published_at: datetime | None
    categories: list[str] = field(default_factory=list)
    image_url: str | None = None

    cve_ids: list[str] = field(default_factory=list)
    malware_names: list[str] = field(default_factory=list)
    threat_actors: list[str] = field(default_factory=list)
    affected_products: list[str] = field(default_factory=list)
    mitre_techniques: list[str] = field(default_factory=list)
    iocs: list[dict] = field(default_factory=list)

    category: str = "malware"
    severity: str = "medium"
    active_exploitation: bool = False
    security_relevant: bool = True
    title_tokens: set[str] = field(default_factory=set)

    @property
    def text(self) -> str:
        return f"{self.title}. {self.description}"

    @property
    def entity_key(self) -> str:
        """Strongest available identity for this article's underlying threat."""
        if self.cve_ids:
            return f"cve:{self.cve_ids[0]}"
        if self.malware_names:
            return f"malware:{self.malware_names[0]}"
        if self.threat_actors:
            return f"actor:{self.threat_actors[0]}"
        tokens = "-".join(sorted(self.title_tokens)[:6])
        return f"title:{tokens or self.article_id}"

    def to_dict(self) -> dict:
        return {
            "article_id": self.article_id,
            "title": self.title,
            "url": self.link,
            "source": self.source,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "description": self.description,
        }


def parse_published(value: str | None) -> datetime | None:
    """newsdata.io returns 'YYYY-MM-DD HH:MM:SS' (UTC); ISO strings also occur."""
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    for candidate in (text.replace(" ", "T"), text):
        cleaned = candidate.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(cleaned)
        except ValueError:
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%a, %d %b %Y %H:%M:%S %z"):
        try:
            parsed = datetime.strptime(text, fmt)
        except ValueError:
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def title_tokens(title: str) -> set[str]:
    return {
        token
        for token in _TOKEN_RE.findall(title.lower())
        if len(token) > 3 and token not in _TITLE_STOPWORDS
    }


def fingerprint_for(parts: list[str]) -> str:
    """Stable 40-char identity for a correlated threat (used for idempotency)."""
    canonical = "|".join(sorted({part.strip().lower() for part in parts if part and part.strip()}))
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()


class ThreatNormalizer:
    """Turns raw feed rows (as returned by ``news_service``) into ``NormalizedArticle``."""

    def normalize_many(self, rows: list[dict]) -> list[NormalizedArticle]:
        normalized: list[NormalizedArticle] = []
        for row in rows:
            article = self.normalize(row)
            if article:
                normalized.append(article)
        return normalized

    def normalize(self, row: dict) -> NormalizedArticle | None:
        """Return None for rows that cannot form a usable threat record."""
        if not isinstance(row, dict):
            return None
        title = str(row.get("title") or "").strip()
        link = str(row.get("link") or row.get("source_url") or "").strip()
        if not title or not link:
            return None

        description = str(row.get("description") or "").strip()
        raw_categories = row.get("categories") or row.get("category") or []
        if isinstance(raw_categories, str):
            raw_categories = [raw_categories]
        categories = [str(value) for value in raw_categories if value][:5]

        article = NormalizedArticle(
            article_id=str(row.get("id") or row.get("article_id") or link),
            title=title[:300],
            link=link,
            description=description[:2000],
            source=str(row.get("source") or row.get("source_name") or "Unknown source"),
            published_at=parse_published(row.get("published_at") or row.get("pubDate")),
            categories=categories,
            image_url=row.get("image_url") or None,
        )

        text = article.text
        lowered = text.lower()
        article.cve_ids = self.extract_cves(text)
        article.malware_names = self._match_known(lowered, KNOWN_MALWARE)
        article.threat_actors = self._match_known(lowered, KNOWN_ACTORS)
        article.affected_products = self._match_known(lowered, KNOWN_PRODUCTS)
        article.mitre_techniques = sorted(set(MITRE_RE.findall(text)))
        article.iocs = self.extract_iocs(text, article.link)
        article.category = self.classify(lowered, categories)
        article.severity = self.severity_of(lowered, article)
        article.active_exploitation = has_any(lowered, ACTIVE_EXPLOITATION_KEYWORDS)
        article.security_relevant = self.is_security_relevant(lowered, article)
        article.title_tokens = title_tokens(article.title)
        return article

    # -- extraction helpers ---------------------------------------------------

    @staticmethod
    def extract_cves(text: str) -> list[str]:
        return sorted({f"CVE-{year}-{number}" for year, number in CVE_RE.findall(text)})

    @staticmethod
    def _match_known(lowered: str, vocabulary: list[str]) -> list[str]:
        found = []
        for term in vocabulary:
            if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", lowered):
                found.append(term)
        return sorted(set(found))

    @staticmethod
    def extract_iocs(text: str, self_link: str = "") -> list[dict]:
        """Extract IP/domain/hash indicators, filtering out news-outlet noise."""
        iocs: list[dict] = []
        seen: set[tuple[str, str]] = set()

        for value in IPV4_RE.findall(text):
            if value.startswith(_IP_STOPLIST_PREFIXES):
                continue
            key = ("ip", value)
            if key not in seen:
                seen.add(key)
                iocs.append({
                    "ioc_type": "ip",
                    "value": value,
                    "description": "IP referenced in threat reporting",
                })

        for value in HASH_RE.findall(text):
            key = ("hash", value.lower())
            if key not in seen:
                seen.add(key)
                iocs.append({
                    "ioc_type": "hash",
                    "value": value.lower(),
                    "description": "File hash referenced in threat reporting",
                })

        self_host = ""
        if self_link:
            match = DOMAIN_RE.search(self_link)
            self_host = match.group(0).lower() if match else ""
        for value in DOMAIN_RE.findall(text):
            lowered_value = value.lower()
            registrable = ".".join(lowered_value.split(".")[-2:])
            if registrable in _DOMAIN_STOPLIST or lowered_value in self_host:
                continue
            key = ("domain", lowered_value)
            if key not in seen:
                seen.add(key)
                iocs.append({
                    "ioc_type": "domain",
                    "value": lowered_value,
                    "description": "Domain referenced in threat reporting",
                })

        return iocs[:40]

    @staticmethod
    def classify(lowered: str, categories: list[str]) -> str:
        for category, keywords in CATEGORY_KEYWORDS:
            if has_any(lowered, keywords):
                return category
        return "malware"

    @staticmethod
    def severity_of(lowered: str, article: NormalizedArticle) -> str:
        for severity in ("critical", "high", "medium", "low"):
            if has_any(lowered, SEVERITY_KEYWORDS[severity]):
                return severity
        if article.cve_ids and has_any(lowered, ACTIVE_EXPLOITATION_KEYWORDS):
            return "critical"
        if article.cve_ids or article.malware_names or article.threat_actors:
            return "high"
        return "medium"

    @staticmethod
    def is_security_relevant(lowered: str, article: NormalizedArticle | None = None) -> bool:
        """Only articles with a concrete security signal can become a lab.

        A signal is a hard entity (CVE, known malware/actor, hash or IP
        indicator), an incident term corroborated by further security language,
        or a named product described in security terms. Generic mentions of
        "security" or "threat" are not enough.
        """
        hard_entity = bool(article and (
            article.cve_ids or article.malware_names or article.threat_actors
            or any(ioc["ioc_type"] in ("hash", "ip") for ioc in article.iocs)
        ))
        incident_hits = count_keywords(lowered, INCIDENT_KEYWORDS)
        # Distinct security terms of either kind; overlapping entries count once.
        security_terms = count_keywords(
            lowered, set(INCIDENT_KEYWORDS) | set(SECURITY_RELEVANCE_KEYWORDS)
        )
        named_product = bool(article and article.affected_products)

        needed = 3 if has_any(lowered, NON_THREAT_KEYWORDS) else 2
        # Business/marketing stories occasionally still describe an incident;
        # they need one more corroborating term than ordinary reporting.
        return (
            hard_entity
            or (incident_hits >= 1 and security_terms >= needed)
            or (named_product and security_terms >= needed + 1)
        )
