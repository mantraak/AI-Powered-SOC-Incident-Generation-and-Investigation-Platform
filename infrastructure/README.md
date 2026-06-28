# SOC tool stack

This directory deploys the investigation tools independently of the admin and
player applications. Every component runs in Docker and persists its data in a
named volume.

## Included profiles

| Profile | Containers | UI |
|---|---|---|
| `wazuh` | Wazuh manager, indexer and dashboard | <https://localhost:8443> |
| `misp` | MISP, MISP modules, MariaDB and Valkey | <https://localhost:10443> |
| `thehive` | TheHive, Cassandra and Elasticsearch | <http://localhost:9000> |
| `monitoring` | Prometheus, Blackbox Exporter and Grafana | <http://localhost:3001> |
| `security` | Semgrep, Gitleaks and Trivy (on-demand) | CLI reports |

The complete stack is heavy. Allow Docker Desktop at least 16 GB RAM for all
profiles, or start one profile at a time on smaller machines. Wazuh alone needs
about 8 GB of host memory; TheHive's official testing recommendation is also 8
GB. Do not expose this development stack directly to the internet.

## Start on Windows

Install Docker Desktop with the WSL 2 backend, then run from the repository root:

```powershell
./infrastructure/tools.cmd init all
./infrastructure/tools.cmd start wazuh
./infrastructure/tools.cmd start misp
./infrastructure/tools.cmd start thehive
./infrastructure/tools.cmd start monitoring
```

`init` creates `infrastructure/.env.tools` and generates the Wazuh TLS
certificates. Edit that file and replace every `ChangeMe`/development secret
before starting a shared environment.

Wazuh's initial `admin` password is baked into its security configuration, so
do not change only `WAZUH_INDEXER_PASSWORD` before first boot. Start it with the
documented local default, use Wazuh's password-management tool to rotate the
indexer users, and then synchronize the new password in `.env.tools`.

To start everything in one command:

```powershell
./infrastructure/tools.cmd start all
```

Useful operations:

```powershell
./infrastructure/tools.cmd status all
./infrastructure/tools.cmd logs wazuh
./infrastructure/tools.cmd pull all
./infrastructure/tools.cmd stop all
./infrastructure/tools.cmd scan security
```

Stopping preserves data. To deliberately delete all tool data, stop the stack
and run `docker compose --env-file infrastructure/.env.tools -f
infrastructure/docker-compose.tools.yml down --volumes` manually.

## First logins

- Wazuh: `admin` / the value of `WAZUH_INDEXER_PASSWORD`.
- MISP: values from `MISP_ADMIN_EMAIL` and `MISP_ADMIN_PASSWORD`.
- TheHive: first-run account `admin@thehive.local` / `secret`; immediately
  create the lab organization/users and change the password.
- Grafana: values from `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`.

Self-signed TLS warnings are expected for local Wazuh and MISP.

## Application integration contract

Attach the teammate's backend container to the external Docker network
`ai-soc-tools`. Use these container-to-container endpoints:

```dotenv
WAZUH_API_URL=https://wazuh.manager:55000
WAZUH_INDEXER_URL=https://wazuh.indexer:9200
MISP_URL=https://misp
THEHIVE_URL=http://thehive:9000
```

The backend should own API keys and credentials; never send them to the React
client. It should also retry integrations because MISP, Cassandra and the search
engines can take several minutes on their first boot.

Example network declaration in the application Compose file:

```yaml
networks:
  soc-tools:
    external: true
    name: ai-soc-tools
```

Then add `networks: [soc-tools]` to the backend service.

## Resource and security notes

- Wazuh's search API and manager API bind only to localhost on the host.
- MISP and Wazuh use local self-signed certificates.
- TheHive has a dedicated Elasticsearch instance; do not point it at the Wazuh
  indexer.
- The `.env.tools` file and generated Wazuh private keys are ignored by Git.
- Pin and test image upgrades. Do not switch production deployments to `latest`.
