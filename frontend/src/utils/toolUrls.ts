const gatewayPaths: Record<string, string> = {
  wazuh: "/wazuh/",
  misp: "/misp/",
  thehive: "/thehive/",
  grafana: "/grafana/",
  prometheus: "/prometheus/",
};

/** Keep launches on the current host, scheme and SSH-forwarded gateway port. */
export function gatewayToolUrl(toolId: string, fallback: string): string {
  const path = gatewayPaths[toolId.toLowerCase()];
  return path ? new URL(path, window.location.origin).toString() : fallback;
}
