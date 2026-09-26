"""Unit tests for the deterministic pipeline stages.

Covers: normalization, entity/IOC extraction, correlation, scoring, ranking,
Top-N selection and the collector's 24h window.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests import factories


@pytest.fixture
def normalizer():
    from app.services.threat_intel.normalizer import ThreatNormalizer

    return ThreatNormalizer()


@pytest.fixture
def correlator():
    from app.services.threat_intel.correlator import ThreatCorrelator

    return ThreatCorrelator()


# -- normalization --------------------------------------------------------------


def test_normalize_extracts_core_fields(normalizer):
    article = normalizer.normalize(factories.ZERO_DAY_CVE[0])
    assert article is not None
    assert article.cve_ids == ["CVE-2026-1234"]
    assert article.severity == "critical"
    assert article.active_exploitation is True
    assert article.category == "vulnerability"
    assert article.security_relevant is True
    assert any(ioc["value"] == "185.220.101.44" for ioc in article.iocs)


def test_normalize_extracts_malware_and_iocs(normalizer):
    article = normalizer.normalize(factories.RANSOMWARE_CAMPAIGN[0])
    assert "akira" in article.malware_names
    assert article.category == "ransomware"
    kinds = {ioc["ioc_type"] for ioc in article.iocs}
    assert {"ip", "domain", "hash"} <= kinds


def test_normalize_rejects_rows_without_title_or_link(normalizer):
    assert normalizer.normalize({"title": "", "link": "https://x.test/a"}) is None
    assert normalizer.normalize({"title": "A threat", "link": ""}) is None
    assert normalizer.normalize({}) is None
    assert normalizer.normalize("not a dict") is None


def test_normalize_tolerates_missing_fields(normalizer):
    article = normalizer.normalize({"title": "Ransomware attack reported", "link": "https://a.test/1"})
    assert article is not None
    assert article.description == ""
    assert article.published_at is None
    assert article.source == "Unknown source"


def test_non_threat_articles_are_flagged_irrelevant(normalizer):
    for row in factories.NOISE:
        article = normalizer.normalize(row)
        assert article.security_relevant is False, row["title"]


def test_general_news_without_a_security_signal_is_irrelevant(normalizer):
    for row in factories.OFF_TOPIC:
        article = normalizer.normalize(row)
        assert article.security_relevant is False, row["title"]


def test_keywords_match_whole_words_only():
    from app.services.threat_intel.normalizer import has_keyword

    assert not has_keyword("streaming sources and resources", "rce")
    assert not has_keyword("the team captain", "apt")
    assert not has_keyword("community association", "sso")
    assert has_keyword("unauthenticated rce in the gateway", "rce")
    assert has_keyword("the flaw was actively exploited", "exploit")
    assert has_keyword("tracked as cve-2026-1234", "cve-")


def test_real_incidents_stay_relevant(normalizer):
    for row in factories.mixed_feed() + factories.ENTITY_FREE_INCIDENTS:
        if row in factories.NOISE:
            continue
        assert normalizer.normalize(row).security_relevant is True, row["title"]


def test_news_outlet_domains_are_not_treated_as_iocs(normalizer):
    article = normalizer.normalize(factories.feed_row(
        "d-1", "Breach disclosed", "Reported by bleepingcomputer.com and evil-c2.top",
    ))
    values = {ioc["value"] for ioc in article.iocs}
    assert "bleepingcomputer.com" not in values
    assert "evil-c2.top" in values


def test_published_parsing_handles_multiple_formats():
    from app.services.threat_intel.normalizer import parse_published

    assert parse_published("2026-08-07 10:30:00").year == 2026
    assert parse_published("2026-08-07T10:30:00Z").tzinfo is not None
    assert parse_published("garbage") is None
    assert parse_published(None) is None


# -- correlation ----------------------------------------------------------------


def test_articles_about_one_campaign_become_one_threat(normalizer, correlator):
    articles = normalizer.normalize_many(factories.RANSOMWARE_CAMPAIGN)
    clusters = correlator.correlate(articles)
    assert len(clusters) == 1
    assert clusters[0].article_count == 3
    assert clusters[0].category == "ransomware"


def test_articles_sharing_a_cve_become_one_threat(normalizer, correlator):
    articles = normalizer.normalize_many(factories.ZERO_DAY_CVE)
    clusters = correlator.correlate(articles)
    assert len(clusters) == 1
    assert clusters[0].cve_ids == ["CVE-2026-1234"]


def test_distinct_threats_stay_separate(normalizer, correlator):
    articles = normalizer.normalize_many(
        factories.ZERO_DAY_CVE + factories.RANSOMWARE_CAMPAIGN + factories.CLOUD_IDENTITY
    )
    clusters = correlator.correlate(articles)
    assert len(clusters) == 3
    assert {cluster.category for cluster in clusters} == {
        "vulnerability", "ransomware", "cloud_identity",
    }


def test_fingerprint_is_stable_and_identity_based(normalizer, correlator):
    first = correlator.correlate(normalizer.normalize_many(factories.ZERO_DAY_CVE))[0]
    # Same CVE, entirely different wording/outlets -> same fingerprint.
    later = correlator.correlate(normalizer.normalize_many([
        factories.feed_row(
            "cve-3", "Follow-up coverage of CVE-2026-1234 exploitation",
            "More organisations confirm compromise via CVE-2026-1234.",
            source="LaterNews", hours_ago=0.5,
        ),
    ]))[0]
    assert first.fingerprint == later.fingerprint


def test_correlate_empty_input(correlator):
    assert correlator.correlate([]) == []


# -- scoring --------------------------------------------------------------------


def test_score_is_explainable_and_bounded(normalizer, correlator):
    from app.services.threat_intel.scorer import ThreatScorer

    cluster = correlator.correlate(normalizer.normalize_many(factories.ZERO_DAY_CVE))[0]
    score, breakdown = ThreatScorer().score(cluster)
    assert 0 <= score <= 10
    assert set(breakdown["components"]) == set(breakdown["weights"])
    assert breakdown["explanation"]
    assert abs(sum(breakdown["components"].values()) - breakdown["raw_score"]) < 1e-6


def test_actively_exploited_zero_day_outranks_generic_malware(normalizer, correlator):
    from app.services.threat_intel.scorer import ThreatScorer

    scorer = ThreatScorer()
    zero_day = correlator.correlate(normalizer.normalize_many(factories.ZERO_DAY_CVE))[0]
    generic = correlator.correlate(normalizer.normalize_many([factories.feed_row(
        "g-1", "Malware loader seen in the wild", "A loader was documented by researchers.",
    )]))[0]
    assert scorer.score(zero_day)[0] > scorer.score(generic)[0]


def test_scoring_is_deterministic(normalizer, correlator):
    from app.services.threat_intel.scorer import ThreatScorer

    fixed_now = datetime.now(timezone.utc)
    cluster = correlator.correlate(normalizer.normalize_many(factories.RANSOMWARE_CAMPAIGN))[0]
    first = ThreatScorer(now=fixed_now).score(cluster)[0]
    second = ThreatScorer(now=fixed_now).score(cluster)[0]
    assert first == second


def test_recency_component_decays(normalizer, correlator):
    from app.services.threat_intel.scorer import ThreatScorer

    now = datetime.now(timezone.utc)
    fresh = correlator.correlate(normalizer.normalize_many([
        factories.feed_row("r-1", "Ransomware attack on hospital network",
                           "Active exploitation reported.", hours_ago=1)
    ]))[0]
    stale = correlator.correlate(normalizer.normalize_many([
        factories.feed_row("r-2", "Ransomware attack on hospital network",
                           "Active exploitation reported.", hours_ago=100)
    ]))[0]
    scorer = ThreatScorer(now=now)
    assert scorer.score(fresh)[1]["components"]["recency"] > \
        scorer.score(stale)[1]["components"]["recency"]


# -- ranking / selection --------------------------------------------------------


def _scored(normalizer, correlator, rows):
    from app.services.threat_intel.ranker import ScoredThreat
    from app.services.threat_intel.scorer import ThreatScorer

    scorer = ThreatScorer()
    threats = []
    for cluster in correlator.correlate(normalizer.normalize_many(rows)):
        score, breakdown = scorer.score(cluster)
        threats.append(ScoredThreat(cluster=cluster, score=score, breakdown=breakdown))
    return threats


def test_top_three_selection_is_diverse(normalizer, correlator):
    from app.services.threat_intel.ranker import ThreatRanker

    threats = _scored(normalizer, correlator, factories.bulk_feed(100))
    selected = ThreatRanker(limit=3, min_score=0.0).select_top(threats)
    assert len(selected) == 3
    assert len({threat.category for threat in selected}) == 3
    assert [threat.rank for threat in selected] == [1, 2, 3]


def test_selection_never_invents_threats(normalizer, correlator):
    from app.services.threat_intel.ranker import ThreatRanker

    threats = _scored(normalizer, correlator, factories.ZERO_DAY_CVE + factories.CLOUD_IDENTITY)
    selected = ThreatRanker(limit=3, min_score=0.0).select_top(threats)
    assert len(selected) == 2


def test_low_quality_threats_are_filtered_by_min_score(normalizer, correlator):
    from app.services.threat_intel.ranker import ThreatRanker

    threats = _scored(normalizer, correlator, [factories.feed_row(
        "w-1", "Vague security concern raised", "No details were provided.", hours_ago=90,
    )])
    assert ThreatRanker(limit=3, min_score=9.9).select_top(threats) == []


def test_ranking_is_deterministic_for_ties(normalizer, correlator):
    from app.services.threat_intel.ranker import ThreatRanker

    threats = _scored(normalizer, correlator, factories.bulk_feed(40))
    ranker = ThreatRanker(limit=3, min_score=0.0)
    first = [threat.fingerprint for threat in ranker.select_top(threats)]
    second = [threat.fingerprint for threat in ranker.select_top(threats)]
    assert first == second


# -- collector window -----------------------------------------------------------


def test_collector_windows_out_old_articles():
    from app.services.threat_intel.collector import ThreatFeedCollector

    collector = ThreatFeedCollector(lookback_hours=24, queries=["test"])
    rows = [
        factories.feed_row("fresh", "Fresh threat", hours_ago=2),
        factories.feed_row("old", "Old threat", hours_ago=48),
        {"id": "undated", "title": "Undated threat", "link": "https://a.test/u", "description": ""},
    ]
    kept = {row["id"] for row in collector.within_window(rows)}
    assert kept == {"fresh", "undated"}


def test_collector_reads_configured_queries():
    from app.services.threat_intel.collector import ThreatFeedCollector

    queries = ThreatFeedCollector.configured_queries()
    assert queries and all(isinstance(query, str) and query for query in queries)


def test_mitre_suggestions_are_validated():
    from app.services.threat_intel.scenario_generator import ThreatScenarioGenerator

    generator = ThreatScenarioGenerator()
    valid = generator.validate_techniques(["T1190", "T9999", "not-an-id"])
    assert valid == ["T1190"]


# -- news feed filtering ----------------------------------------------------------


def test_news_fetch_excludes_off_topic_categories_and_stories(db, monkeypatch):
    import asyncio

    import httpx

    from app.services import news_service

    news_service._cache.clear()
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        rows = [
            {**row, "article_id": row["id"], "source_name": row["source"],
             "pubDate": row["published_at"]}
            for row in factories.ZERO_DAY_CVE[:1] + factories.OFF_TOPIC
        ]
        return httpx.Response(200, json={"status": "success", "results": rows})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        news_service.httpx, "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler)),
    )

    feed = asyncio.run(news_service.fetch_latest_news(db, "ransomware"))
    news_service._cache.clear()

    assert seen["excludecategory"] == "entertainment,sports,lifestyle,food,tourism"
    assert [article["id"] for article in feed["articles"]] == ["cve-1"]
