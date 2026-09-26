"""Stage 6 - turn a selected threat into a real SOC investigation scenario.

Reuses the platform's existing AI scenario pipeline end to end:

* the Scenario row is created exactly like the manual "Create Lab from article"
  flow (``created_from_ai=True``, ``source_url``/``source_article`` populated),
  plus the new automated-pipeline provenance columns;
* generation itself is delegated to ``generator_service.run_ai_generation``, so
  events, artifacts, traffic, traces, indicators, alerts, questions and
  containment actions are produced by the same code paths as a manual lab.

Nothing here bypasses or reimplements that generator.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.scenario import Scenario
from app.models.threat_intel import ThreatCandidate, ThreatCandidateStatus
from app.services.generator_service import run_ai_generation
from app.services.mitre_service import MitreDataUnavailable, mitre_catalog
from app.services.threat_intel.correlator import ThreatCluster
from app.services.threat_intel.normalizer import has_any

logger = logging.getLogger(__name__)

# Category -> candidate ATT&CK techniques. Validated against the live catalogue
# before use, so a catalogue upgrade that renames/removes an ID cannot break a
# run (invalid IDs are dropped, never persisted).
CATEGORY_TECHNIQUES: dict[str, list[str]] = {
    "vulnerability": ["T1190", "T1059", "T1105", "T1068"],
    "ransomware": ["T1486", "T1490", "T1078", "T1021"],
    "malware": ["T1204", "T1059", "T1105", "T1071"],
    "phishing": ["T1566", "T1204", "T1078", "T1114"],
    "cloud_identity": ["T1078", "T1550", "T1528", "T1098"],
    "supply_chain": ["T1195", "T1072", "T1059", "T1105"],
    "data_breach": ["T1078", "T1005", "T1041", "T1567"],
    "apt": ["T1566", "T1078", "T1071", "T1041"],
    "ddos": ["T1498", "T1499", "T1583"],
    "insider_threat": ["T1078", "T1005", "T1052"],
}

# Extra techniques implied by named products/keywords in the reporting.
KEYWORD_TECHNIQUES: list[tuple[tuple[str, ...], str]] = [
    (("vpn", "netscaler", "citrix", "fortigate", "globalprotect", "connect secure"), "T1133"),
    (("active directory", "kerberos", "ntlm", "domain controller"), "T1550"),
    (("powershell", "cmd.exe", "script"), "T1059.001"),
    (("scheduled task", "cron", "persistence"), "T1053"),
    (("credential", "password", "token", "session cookie"), "T1552"),
    (("exfiltrat", "data theft", "stolen data"), "T1041"),
    (("command-and-control", "command and control", "c2 server", "beacon"), "T1071"),
    (("lateral movement", "rdp", "smb", "psexec"), "T1021"),
]

MAX_TECHNIQUES = 8


class ThreatScenarioGenerator:
    """Creates + AI-generates the Scenario backing one automated threat lab."""

    def __init__(self, difficulty: str | None = None, num_questions: int | None = None):
        self.difficulty = difficulty or settings.THREAT_LAB_DIFFICULTY
        self.num_questions = num_questions or settings.THREAT_LAB_NUM_QUESTIONS

    # -- MITRE mapping --------------------------------------------------------

    def suggest_techniques(self, cluster: ThreatCluster) -> list[str]:
        suggested: list[str] = list(cluster.mitre_techniques)
        suggested += CATEGORY_TECHNIQUES.get(cluster.category, ["T1190", "T1059"])

        lowered = " ".join(article.text for article in cluster.articles).lower()
        for keywords, technique in KEYWORD_TECHNIQUES:
            if has_any(lowered, keywords):
                suggested.append(technique)

        ordered: list[str] = []
        for technique in suggested:
            value = str(technique).strip().upper()
            if value and value not in ordered:
                ordered.append(value)

        return self.validate_techniques(ordered)[:MAX_TECHNIQUES]

    @staticmethod
    def validate_techniques(technique_ids: list[str]) -> list[str]:
        """Drop IDs the catalogue does not know; tolerate a missing catalogue."""
        normalized = [str(value).strip().upper() for value in technique_ids if str(value).strip()]
        if not normalized:
            return []
        try:
            invalid = set(mitre_catalog.invalid_ids(normalized))
        except MitreDataUnavailable:
            logger.warning("MITRE catalogue unavailable; generating without technique mapping")
            return []
        return [value for value in normalized if value not in invalid]

    # -- prompt / draft -------------------------------------------------------

    def build_prompt(self, cluster: ThreatCluster, techniques: list[str], score: float) -> str:
        primary = cluster.primary
        facts = [
            f"Threat category: {cluster.category}",
            f"Assessed severity: {cluster.severity}",
            f"Active exploitation reported: {'yes' if cluster.active_exploitation else 'no'}",
            f"Threat priority score: {score}/10",
            f"Correlated from {cluster.article_count} article(s)",
        ]
        if cluster.cve_ids:
            facts.append("CVEs: " + ", ".join(cluster.cve_ids))
        if cluster.malware_names:
            facts.append("Malware/campaign: " + ", ".join(cluster.malware_names))
        if cluster.threat_actors:
            facts.append("Threat actors: " + ", ".join(cluster.threat_actors))
        if cluster.affected_products:
            facts.append("Affected technology: " + ", ".join(cluster.affected_products))
        if cluster.iocs:
            facts.append(
                "Reported indicators: "
                + ", ".join(f"{ioc['ioc_type']}={ioc['value']}" for ioc in cluster.iocs[:15])
            )
        if techniques:
            facts.append("Required MITRE ATT&CK techniques: " + ", ".join(techniques))

        return (
            "Automated daily threat-intelligence lab.\n"
            "Build a hands-on SOC investigation around the real-world threat summarised below. "
            "The analyst must investigate synthetic telemetry and reach conclusions - they must "
            "not simply restate the news article. Include an attack timeline, realistic host and "
            "identity evidence, detection opportunities, investigation objectives, expected "
            "findings and containment recommendations.\n\n"
            "THREAT FACTS\n" + "\n".join(f"- {fact}" for fact in facts) + "\n\n"
            f"PRIMARY SOURCE: {primary.source} - {primary.link}\n\n"
            "REPORTING\n" + cluster.summary_text()
        )

    def build_description(self, cluster: ThreatCluster, score: float) -> str:
        primary = cluster.primary
        bits = [
            (primary.description or primary.title).strip(),
            "",
            f"Automated threat-intelligence lab (priority {score}/10, severity {cluster.severity}).",
        ]
        if cluster.cve_ids:
            bits.append("Tracked CVEs: " + ", ".join(cluster.cve_ids))
        if cluster.affected_products:
            bits.append("Affected technology: " + ", ".join(cluster.affected_products))
        if cluster.active_exploitation:
            bits.append("Active exploitation has been reported in the wild.")
        bits.append(f"Primary source: {primary.source} ({primary.link})")
        return "\n".join(bit for bit in bits if bit is not None)[:4000]

    def create_draft(
        self,
        db: Session,
        candidate: ThreatCandidate,
        cluster: ThreatCluster,
        run_id: int,
        created_by: int | None,
    ) -> Scenario:
        """Persist the draft Scenario for a selected threat (no AI call yet)."""
        techniques = self.suggest_techniques(cluster)
        prompt = self.build_prompt(cluster, techniques, candidate.threat_score)
        primary = cluster.primary

        scenario = Scenario(
            title=self._lab_title(cluster),
            description=self.build_description(cluster, candidate.threat_score),
            article_text=prompt,
            mitre_techniques=techniques,
            iocs=[ioc["value"] for ioc in cluster.iocs][:40],
            difficulty=self.difficulty,
            num_questions=self.num_questions,
            status="draft",
            created_by=created_by,
            # Existing AI-draft provenance (shared with the manual workflow).
            created_from_ai=True,
            source_url=primary.link,
            source_title=primary.source,
            source_article=cluster.summary_text(),
            ai_prompt=prompt,
            draft_version=1,
            # Automated-pipeline provenance.
            auto_generated=True,
            threat_score=candidate.threat_score,
            threat_rank=candidate.rank,
            threat_category=cluster.category,
            threat_severity=cluster.severity,
            active_exploitation=cluster.active_exploitation,
            threat_fingerprint=candidate.fingerprint,
            threat_feed_run_id=run_id,
            auto_generated_at=datetime.now(timezone.utc),
        )
        db.add(scenario)
        db.commit()
        db.refresh(scenario)

        candidate.scenario_id = scenario.id
        candidate.status = ThreatCandidateStatus.generating
        candidate.mitre_techniques = techniques
        db.commit()
        return scenario

    @staticmethod
    def _lab_title(cluster: ThreatCluster) -> str:
        """A lab-shaped title, not a headline."""
        primary_title = cluster.primary.title.strip().rstrip(".")
        label = {
            "vulnerability": "Exploitation Investigation",
            "ransomware": "Ransomware Incident Investigation",
            "malware": "Malware Intrusion Investigation",
            "phishing": "Phishing Campaign Investigation",
            "cloud_identity": "Cloud Identity Compromise Investigation",
            "supply_chain": "Supply-Chain Compromise Investigation",
            "data_breach": "Data Breach Investigation",
            "apt": "Targeted Intrusion Investigation",
            "ddos": "Availability Attack Investigation",
            "insider_threat": "Insider Threat Investigation",
        }.get(cluster.category, "Threat Investigation")
        return f"{primary_title[:150]} - {label}"

    # -- generation -----------------------------------------------------------

    def generate(self, db: Session, scenario: Scenario) -> Scenario:
        """Run the existing AI generator for this scenario and reload it.

        ``run_ai_generation`` opens its own session and never raises, so a bad
        AI response marks this one scenario ``validation_failed`` and leaves the
        rest of the pipeline untouched.
        """
        scenario_id = scenario.id
        db.commit()  # make sure the draft is visible to the generator's session
        run_ai_generation(scenario_id)
        db.expire_all()
        return db.query(Scenario).filter(Scenario.id == scenario_id).first()
