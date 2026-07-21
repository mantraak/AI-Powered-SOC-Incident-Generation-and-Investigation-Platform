"""Download pinned Enterprise ATT&CK STIX and build a compact local catalogue."""

import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings


def _external_id(obj: dict) -> str | None:
    for reference in obj.get("external_references", []):
        if reference.get("source_name") == "mitre-attack" and reference.get("external_id"):
            return reference["external_id"]
    return None


def _external_url(obj: dict) -> str | None:
    for reference in obj.get("external_references", []):
        if reference.get("source_name") == "mitre-attack" and reference.get("url"):
            return reference["url"]
    return None


def build_catalog(stix: dict) -> dict:
    objects = stix.get("objects", [])
    tactics = []
    for obj in objects:
        if obj.get("type") != "x-mitre-tactic" or obj.get("revoked") or obj.get("x_mitre_deprecated"):
            continue
        tactics.append({
            "id": _external_id(obj),
            "name": obj.get("name", ""),
            "shortname": obj.get("x_mitre_shortname", ""),
        })

    techniques = []
    for obj in objects:
        if obj.get("type") != "attack-pattern" or obj.get("revoked") or obj.get("x_mitre_deprecated"):
            continue
        technique_id = _external_id(obj)
        if not technique_id or not technique_id.startswith("T"):
            continue
        techniques.append({
            "id": technique_id.upper(),
            "stix_id": obj.get("id"),
            "name": obj.get("name", ""),
            "description": obj.get("description", ""),
            "tactics": sorted({phase.get("phase_name", "") for phase in obj.get("kill_chain_phases", []) if phase.get("phase_name")}),
            "platforms": sorted(obj.get("x_mitre_platforms", [])),
            "data_sources": sorted(obj.get("x_mitre_data_sources", [])),
            "is_subtechnique": bool(obj.get("x_mitre_is_subtechnique", False)),
            "url": _external_url(obj),
        })

    tactics.sort(key=lambda item: item["name"])
    techniques.sort(key=lambda item: item["id"])
    return {
        "metadata": {
            "domain": "enterprise-attack",
            "version": settings.MITRE_ATTACK_VERSION,
            "source_url": settings.MITRE_STIX_URL,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "technique_count": len(techniques),
            "tactic_count": len(tactics),
        },
        "tactics": tactics,
        "techniques": techniques,
    }


def sync_catalog() -> Path:
    destination = Path(settings.MITRE_CATALOG_PATH)
    if destination.exists() and not settings.MITRE_FORCE_SYNC:
        try:
            existing = json.loads(destination.read_text(encoding="utf-8"))
            if existing.get("metadata", {}).get("version") == settings.MITRE_ATTACK_VERSION:
                print(f"MITRE ATT&CK {settings.MITRE_ATTACK_VERSION} catalogue already exists.")
                return destination
        except (OSError, json.JSONDecodeError):
            pass

    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        settings.MITRE_STIX_URL,
        headers={"User-Agent": "romulus-mitre-sync/1.0"},
    )
    print(f"Downloading MITRE ATT&CK {settings.MITRE_ATTACK_VERSION}...")
    with urllib.request.urlopen(request, timeout=120) as response:
        stix = json.load(response)

    catalog = build_catalog(stix)
    if not catalog["techniques"] or not catalog["tactics"]:
        raise RuntimeError("Downloaded STIX data did not contain ATT&CK tactics and techniques")

    fd, temporary_name = tempfile.mkstemp(prefix="catalog-", suffix=".json", dir=destination.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temporary_file:
            json.dump(catalog, temporary_file, ensure_ascii=False, separators=(",", ":"))
        os.replace(temporary_name, destination)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)

    print(f"Saved {len(catalog['techniques'])} techniques to {destination}")
    return destination


if __name__ == "__main__":
    sync_catalog()
