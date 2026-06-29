import json
import threading
from pathlib import Path

from app.core.config import settings


class MitreDataUnavailable(RuntimeError):
    pass


class MitreCatalog:
    def __init__(self):
        self._lock = threading.Lock()
        self._mtime: float | None = None
        self._catalog: dict | None = None
        self._by_id: dict[str, dict] = {}

    def _load(self) -> dict:
        path = Path(settings.MITRE_CATALOG_PATH)
        if not path.exists():
            raise MitreDataUnavailable("MITRE ATT&CK catalogue is not initialized")
        mtime = path.stat().st_mtime
        if self._catalog is not None and self._mtime == mtime:
            return self._catalog
        with self._lock:
            if self._catalog is not None and self._mtime == mtime:
                return self._catalog
            try:
                catalog = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise MitreDataUnavailable("MITRE ATT&CK catalogue cannot be read") from exc
            self._catalog = catalog
            self._mtime = mtime
            self._by_id = {item["id"].upper(): item for item in catalog.get("techniques", [])}
            return catalog

    def metadata(self) -> dict:
        return self._load().get("metadata", {})

    def tactics(self) -> list[dict]:
        return self._load().get("tactics", [])

    def get(self, technique_id: str) -> dict | None:
        self._load()
        return self._by_id.get(technique_id.strip().upper())

    def search(self, query: str = "", tactic: str | None = None, limit: int = 50) -> list[dict]:
        techniques = self._load().get("techniques", [])
        query = query.strip().lower()
        tactic = tactic.strip().lower() if tactic else None
        results = []
        for technique in techniques:
            if tactic and tactic not in technique.get("tactics", []):
                continue
            haystack = f"{technique['id']} {technique['name']} {technique.get('description', '')}".lower()
            if query and query not in haystack:
                continue
            results.append(technique)
            if len(results) >= limit:
                break
        return results

    def invalid_ids(self, technique_ids: list[str]) -> list[str]:
        self._load()
        return sorted({item.strip().upper() for item in technique_ids if item and item.strip().upper() not in self._by_id})


mitre_catalog = MitreCatalog()


def collect_generated_ids(data: dict) -> list[str]:
    ids = set()
    for step in data.get("attack_steps", []):
        value = step.get("technique") or step.get("mitre_id")
        if value:
            ids.add(value.strip().upper())
    for collection in ("timeline", "events", "indicators", "alerts"):
        for item in data.get(collection, []):
            value = item.get("mitre_id")
            if value:
                ids.add(value.strip().upper())
    return sorted(ids)

