#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
TOOL="${2:-all}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.tools.yml"
ENV_FILE="$ROOT/.env.tools"
ENV_EXAMPLE="$ROOT/.env.tools.example"
NETWORK_NAME="ai-soc-tools"

case "$ACTION" in
  init|start|stop|status|logs|follow|pull|scan) ;;
  *) echo "Unknown action: $ACTION" >&2; exit 2 ;;
esac

case "$TOOL" in
  all|wazuh|misp|thehive|monitoring|security) ;;
  *) echo "Unknown tool profile: $TOOL" >&2; exit 2 ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI was not found in WSL. Enable Docker Desktop WSL integration or install Docker Engine." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE with development credentials. Change them before exposing the stack." >&2
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

if [[ "$TOOL" == "all" ]]; then
  profiles=(wazuh misp thehive monitoring)
else
  profiles=("$TOOL")
fi

profile_args=()
for profile in "${profiles[@]}"; do
  profile_args+=(--profile "$profile")
done

ensure_network() {
  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    echo "Creating shared application/tool network..."
    docker network create "$NETWORK_NAME" >/dev/null
  fi
}

initialize_wazuh_certificates() {
  if [[ ! -f "$ROOT/wazuh/certs/root-ca.pem" ]]; then
    echo "Generating Wazuh TLS certificates..."
    "${compose[@]}" --profile setup run --rm wazuh-certs
  fi
}

ensure_wazuh_kernel_settings() {
  local current
  current="$(sysctl -n vm.max_map_count 2>/dev/null || echo 0)"
  if (( current >= 262144 )); then
    return
  fi
  if (( EUID == 0 )); then
    echo "Setting vm.max_map_count=262144 for the Wazuh indexer..."
    sysctl -w vm.max_map_count=262144 >/dev/null
    return
  fi
  echo "Wazuh requires vm.max_map_count=262144 (current: $current)." >&2
  echo "Run: sudo sysctl -w vm.max_map_count=262144" >&2
  exit 1
}

case "$ACTION" in
  init)
    ensure_network
    if [[ "$TOOL" == "all" || "$TOOL" == "wazuh" ]]; then
      initialize_wazuh_certificates
      ensure_wazuh_kernel_settings
      # The initializer is intentionally one-shot. Recreate it so a previous
      # failed or stale container cannot leave Compose waiting forever.
      "${compose[@]}" --profile wazuh rm -sf wazuh-security-init >/dev/null 2>&1 || true
    fi
    "${compose[@]}" "${profile_args[@]}" config --quiet
    echo "Tool configuration is ready."
    ;;
  start)
    ensure_network
    if [[ "$TOOL" == "all" || "$TOOL" == "wazuh" ]]; then
      initialize_wazuh_certificates
    fi
    "${compose[@]}" "${profile_args[@]}" up -d
    "${compose[@]}" "${profile_args[@]}" ps
    ;;
  stop)
    "${compose[@]}" down --remove-orphans
    ;;
  status)
    "${compose[@]}" "${profile_args[@]}" ps --all
    ;;
  logs)
    "${compose[@]}" "${profile_args[@]}" logs --tail 200
    ;;
  follow)
    "${compose[@]}" "${profile_args[@]}" logs --tail 200 -f
    ;;
  pull)
    "${compose[@]}" "${profile_args[@]}" pull
    ;;
  scan)
    failed=()
    for scanner in semgrep gitleaks trivy; do
      echo "Running $scanner..."
      if ! "${compose[@]}" --profile security run --rm "$scanner"; then
        failed+=("$scanner")
      fi
    done
    if (( ${#failed[@]} > 0 )); then
      echo "Security scan failed: ${failed[*]}" >&2
      exit 1
    fi
    ;;
esac
