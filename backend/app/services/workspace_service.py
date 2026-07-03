"""Provision lightweight, isolated per-lab workspaces in shared SOC tools."""

import json
import secrets
import uuid

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.event import ScenarioEvent
from app.models.lab import PlayerLab
from app.models.lab_workspace import LabWorkspace
from app.services.ai_provider import decrypt_api_key, encrypt_api_key


def _password() -> str:
    return f"{secrets.token_urlsafe(14)}A1!"


def _credentials(workspace: LabWorkspace) -> dict:
    if not workspace.encrypted_credentials:
        return {}
    return json.loads(decrypt_api_key(workspace.encrypted_credentials))


def _scenario_tools(lab: PlayerLab) -> list[str]:
    """Choose shared SOC platforms that support this scenario's investigation."""
    difficulty = getattr(lab.scenario.difficulty, "value", lab.scenario.difficulty)
    techniques = set(lab.scenario.mitre_techniques or [])
    tools = ["wazuh"]
    if difficulty in ("intermediate", "advanced"):
        tools.append("thehive")
    if difficulty == "advanced" or techniques.intersection({"T1566.001", "T1071.001", "T1041", "T1583.001"}):
        tools.append("misp")
    if difficulty == "advanced":
        tools.append("grafana")
    return tools


def _shared_tool_credentials(required_tools: list[str]) -> dict:
    catalogue = {
        "misp": {
            "username": settings.MISP_TRAINING_USERNAME,
            "password": settings.MISP_TRAINING_PASSWORD,
            "url": settings.MISP_PUBLIC_URL,
            "scope": "shared-training",
            "purpose": "Threat intelligence, IOC enrichment and correlation",
        },
        "thehive": {
            "username": settings.THEHIVE_TRAINING_USERNAME,
            "password": settings.THEHIVE_TRAINING_PASSWORD,
            "url": settings.THEHIVE_PUBLIC_URL,
            "scope": "shared-training",
            "purpose": "Case management, alert triage and investigation notes",
        },
        "grafana": {
            "username": settings.GRAFANA_TRAINING_USERNAME,
            "password": settings.GRAFANA_TRAINING_PASSWORD,
            "url": settings.GRAFANA_PUBLIC_URL,
            "scope": "shared-training",
            "purpose": "SOC service health and telemetry monitoring",
        },
    }
    return {name: catalogue[name] for name in required_tools if name in catalogue}


def _wazuh_request(client: httpx.Client, method: str, path: str, **kwargs):
    response = client.request(method, f"{settings.WAZUH_INDEXER_URL.rstrip('/')}{path}", **kwargs)
    response.raise_for_status()
    return response


def _provision_wazuh(db: Session, lab: PlayerLab, workspace: LabWorkspace) -> dict:
    suffix = workspace.workspace_id.replace("-", "_")
    username = f"romulus_{suffix}"
    role = f"romulus_role_{suffix}"
    tenant = f"romulus_{suffix}"
    index_name = f"romulus-lab-{workspace.workspace_id}"
    password = _password()

    auth = (settings.WAZUH_INDEXER_USERNAME, settings.WAZUH_INDEXER_PASSWORD)
    with httpx.Client(auth=auth, verify=False, timeout=20.0) as client:
        _wazuh_request(client, "PUT", f"/_plugins/_security/api/tenants/{tenant}", json={
            "description": f"Isolated Romulus lab {lab.id}",
        })
        _wazuh_request(client, "PUT", f"/_plugins/_security/api/roles/{role}", json={
            "cluster_permissions": ["cluster_composite_ops_ro"],
            "index_permissions": [{
                "index_patterns": [index_name],
                "allowed_actions": ["read"],
            }],
            "tenant_permissions": [{
                "tenant_patterns": [tenant],
                "allowed_actions": ["kibana_all_write"],
            }],
        })
        _wazuh_request(client, "PUT", f"/_plugins/_security/api/internalusers/{username}", json={
            "password": password,
            "backend_roles": [role],
            "attributes": {"romulus_workspace": workspace.workspace_id},
        })
        _wazuh_request(client, "PUT", f"/_plugins/_security/api/rolesmapping/{role}", json={
            "users": [username],
            "backend_roles": [role],
        })

        events = db.query(ScenarioEvent).filter(ScenarioEvent.scenario_id == lab.scenario_id).all()
        if events:
            bulk_lines = []
            for event in events:
                bulk_lines.append(json.dumps({"index": {"_index": index_name}}))
                bulk_lines.append(json.dumps({
                    "@timestamp": event.timestamp.isoformat() if event.timestamp else None,
                    "workspace_id": workspace.workspace_id,
                    "lab_id": lab.id,
                    "scenario_id": lab.scenario_id,
                    "event_type": event.event_type,
                    "source": event.source,
                    "host": event.host,
                    "user": event.user,
                    "message": event.message,
                    "mitre_id": event.mitre_id,
                    "is_malicious": event.is_malicious,
                    "event_data": event.event_data or {},
                }))
            response = _wazuh_request(
                client,
                "POST",
                "/_bulk?refresh=true",
                content="\n".join(bulk_lines) + "\n",
                headers={"Content-Type": "application/x-ndjson"},
            )
            if response.json().get("errors"):
                raise RuntimeError("Wazuh rejected one or more workspace events")

    return {
        "wazuh": {
            "username": username,
            "password": password,
            "tenant": tenant,
            "index": index_name,
            "url": f"{settings.WAZUH_PUBLIC_URL.rstrip('/')}/app/login?security_tenant={tenant}",
            "scope": "isolated",
            "purpose": "Dedicated SIEM evidence index and private dashboard tenant",
        }
    }


def deprovision_lab_workspace(db: Session, lab: PlayerLab) -> None:
    workspace = db.query(LabWorkspace).filter(LabWorkspace.lab_id == lab.id).first()
    if not workspace:
        return
    suffix = workspace.workspace_id.replace("-", "_")
    auth = (settings.WAZUH_INDEXER_USERNAME, settings.WAZUH_INDEXER_PASSWORD)
    with httpx.Client(auth=auth, verify=False, timeout=20.0) as client:
        for path in (
            f"/romulus-lab-{workspace.workspace_id}",
            f"/_plugins/_security/api/internalusers/romulus_{suffix}",
            f"/_plugins/_security/api/rolesmapping/romulus_role_{suffix}",
            f"/_plugins/_security/api/roles/romulus_role_{suffix}",
            f"/_plugins/_security/api/tenants/romulus_{suffix}",
        ):
            response = client.delete(f"{settings.WAZUH_INDEXER_URL.rstrip('/')}{path}")
            if response.status_code not in (200, 404):
                response.raise_for_status()


def provision_lab_workspace(db: Session, lab: PlayerLab) -> LabWorkspace:
    workspace = db.query(LabWorkspace).filter(LabWorkspace.lab_id == lab.id).first()
    if workspace and workspace.status == "ready":
        required_tools = _scenario_tools(lab)
        credentials = _credentials(workspace)
        if "wazuh" in credentials:
            tenant = credentials["wazuh"].get("tenant", f"romulus_{workspace.workspace_id}")
            credentials["wazuh"].update({
                "url": f"{settings.WAZUH_PUBLIC_URL.rstrip('/')}/app/login?security_tenant={tenant}",
                "scope": "isolated",
                "purpose": "Dedicated SIEM evidence index and private dashboard tenant",
            })
        credentials.update(_shared_tool_credentials(required_tools))
        workspace.required_tools = required_tools
        workspace.encrypted_credentials = encrypt_api_key(json.dumps(credentials))
        db.commit()
        db.refresh(workspace)
        return workspace
    if not workspace:
        workspace = LabWorkspace(
            lab_id=lab.id,
            workspace_id=uuid.uuid4().hex[:12],
            required_tools=_scenario_tools(lab),
            status="provisioning",
        )
        db.add(workspace)
        db.commit()
        db.refresh(workspace)
    try:
        credentials = _provision_wazuh(db, lab, workspace)
        credentials.update(_shared_tool_credentials(workspace.required_tools or []))
        workspace.encrypted_credentials = encrypt_api_key(json.dumps(credentials))
        workspace.status = "ready"
        workspace.provisioning_error = None
    except Exception as exc:
        workspace.status = "degraded"
        workspace.provisioning_error = f"{exc.__class__.__name__}: {exc}"
    db.commit()
    db.refresh(workspace)
    return workspace


def workspace_payload(workspace: LabWorkspace, reveal_credentials: bool = True) -> dict:
    return {
        "workspace_id": workspace.workspace_id,
        "status": workspace.status,
        "required_tools": workspace.required_tools or [],
        "tools": _credentials(workspace) if reveal_credentials else {},
        "detail": workspace.provisioning_error if workspace.status != "ready" else None,
    }
