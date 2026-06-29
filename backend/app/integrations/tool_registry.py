import asyncio
from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass(frozen=True)
class ToolDefinition:
    tool_id: str
    name: str
    description: str
    category: str
    internal_url: str
    health_path: str
    public_url: str


TOOLS = (
    ToolDefinition("wazuh", "Wazuh", "SIEM event search, alerting and endpoint monitoring.", "SIEM", settings.WAZUH_API_URL, "/", settings.WAZUH_PUBLIC_URL),
    ToolDefinition("misp", "MISP", "Threat-intelligence events, indicators and enrichment.", "Threat Intelligence", settings.MISP_URL, "/users/heartbeat", settings.MISP_PUBLIC_URL),
    ToolDefinition("thehive", "TheHive", "Alert triage, cases, observables and investigation tasks.", "Case Management", settings.THEHIVE_URL, "/thehive/api/status", settings.THEHIVE_PUBLIC_URL),
    ToolDefinition("grafana", "Grafana", "Operational dashboards for the SOC platform and tools.", "Monitoring", settings.GRAFANA_URL, "/api/health", settings.GRAFANA_PUBLIC_URL),
    ToolDefinition("prometheus", "Prometheus", "Metrics collection, service targets and alert evaluation.", "Monitoring", settings.PROMETHEUS_URL, "/-/healthy", settings.PROMETHEUS_PUBLIC_URL),
)


async def _check_tool(client: httpx.AsyncClient, tool: ToolDefinition) -> dict:
    try:
        response = await client.get(f"{tool.internal_url.rstrip('/')}{tool.health_path}")
        online = response.status_code < 500
        detail = f"HTTP {response.status_code}"
    except httpx.TimeoutException:
        online = False
        detail = "Health check timed out"
    except httpx.HTTPError as exc:
        online = False
        detail = f"Unavailable: {exc.__class__.__name__}"

    return {
        "id": tool.tool_id,
        "name": tool.name,
        "description": tool.description,
        "category": tool.category,
        "public_url": tool.public_url,
        "status": "online" if online else "offline",
        "detail": detail,
    }


async def get_tool_statuses() -> list[dict]:
    timeout = httpx.Timeout(10.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, verify=False, follow_redirects=True) as client:
        checks = (_check_tool(client, tool) for tool in TOOLS)
        return list(await asyncio.gather(*checks))
