"""Automated 24-hour Threat Feed → Top-N SOC Lab intelligence pipeline.

Pipeline stages (each stage is its own module and independently testable):

    ThreatFeedCollector   collector.py    fetch + window the raw feed
    ThreatNormalizer      normalizer.py   normalise articles, extract entities/IOCs
    ThreatCorrelator      correlator.py   group articles describing one threat
    ThreatScorer          scorer.py       deterministic, explainable priority score
    ThreatRanker          ranker.py       rank + diversity-aware Top-N selection
    ThreatScenarioGenerator scenario_generator.py  cluster -> AI scenario
    ThreatLabCreator      lab_creator.py  validate -> publish -> student-visible lab
    ThreatPipelineService pipeline.py     orchestration + ThreatFeedRun bookkeeping
"""

from app.services.threat_intel.collector import ThreatFeedCollector
from app.services.threat_intel.correlator import ThreatCluster, ThreatCorrelator
from app.services.threat_intel.lab_creator import ThreatLabCreator, ThreatLabValidationError
from app.services.threat_intel.normalizer import NormalizedArticle, ThreatNormalizer
from app.services.threat_intel.pipeline import ThreatPipelineService, run_daily_threat_pipeline
from app.services.threat_intel.ranker import ThreatRanker
from app.services.threat_intel.scenario_generator import ThreatScenarioGenerator
from app.services.threat_intel.scorer import ThreatScorer

__all__ = [
    "NormalizedArticle",
    "ThreatCluster",
    "ThreatCorrelator",
    "ThreatFeedCollector",
    "ThreatLabCreator",
    "ThreatLabValidationError",
    "ThreatNormalizer",
    "ThreatPipelineService",
    "ThreatRanker",
    "ThreatScenarioGenerator",
    "ThreatScorer",
    "run_daily_threat_pipeline",
]
