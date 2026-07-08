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
  if (!path) return fallback;
  const gatewayUrl = new URL(path, window.location.origin);
  try {
    const configuredUrl = new URL(fallback, window.location.origin);
    const gatewayPrefix = path.replace(/\/$/, "");
    if (configuredUrl.pathname === gatewayPrefix || configuredUrl.pathname.startsWith(`${gatewayPrefix}/`)) {
      gatewayUrl.pathname = configuredUrl.pathname;
    }
    gatewayUrl.search = configuredUrl.search;
    gatewayUrl.hash = configuredUrl.hash;
  } catch {
    // A malformed optional fallback must not break same-origin tool launch.
  }
  return gatewayUrl.toString();
}
