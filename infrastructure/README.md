# SOC tool stack

This directory deploys the investigation tools independently of the admin and
player applications. Every component runs in Docker and persists its data in a
named volume.

## Included profiles

| Profile | Containers | UI |
|---|---|---|
| `wazuh` | Wazuh manager, indexer and dashboard | <https://localhost:8443> |
| `misp` | MISP, MISP modules, MariaDB and Valkey | <https://localhost:10443> |
| `thehive` | TheHive, Cassandra and Elasticsearch | <http://localhost:9000/thehive> |
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

The `init` command also creates the shared `ai-soc-tools` Docker network used by
the application backend. Initialize the tools before starting the main
application Compose stack.

After signing in as an administrator, open **SOC Tools** in the sidebar to see
live availability and launch each web interface.

## Start from WSL

Enable Docker Desktop integration for your WSL distribution, or install Docker
Engine and the Compose plugin inside WSL. From the repository root run:

```bash
bash infrastructure/tools.sh init all
bash infrastructure/tools.sh start all
docker compose --project-directory . -f infrastructure/docker-compose.yml up -d --build
```

Open <http://localhost> in the Windows browser. Docker Desktop forwards the
published WSL container ports to Windows automatically.

Useful WSL commands:

```bash
bash infrastructure/tools.sh status all
bash infrastructure/tools.sh logs wazuh
bash infrastructure/tools.sh follow wazuh
bash infrastructure/tools.sh stop all
```

If an earlier Wazuh start was stuck on `wazuh-security-init`, run the start
command again after pulling these changes:

```bash
bash infrastructure/tools.sh start wazuh
bash infrastructure/tools.sh status wazuh
```

The launcher now recreates the one-shot security initializer, checks WSL's
`vm.max_map_count`, and runs OpenSearch security initialization on transport
port 9300. It does not delete the Wazuh data volume.

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

| Application | URL | Development username | Development password |
|---|---|---|---|
| AI SOC | <http://localhost> | `admin@aisocplatform.dev` | `Admin@1234` |
| Wazuh | <https://localhost:8443> | `admin` | `SecretPassword` |
| MISP | <https://localhost:10443> | `admin@admin.test` | `ChangeMe-MISP-2026!` |
| TheHive | <http://localhost:9000/thehive> | `admin@thehive.local` | `secret` |
| Grafana | <http://localhost:3001> | `admin` | `ChangeMe-Grafana-2026!` |
| Prometheus | <http://localhost:9090> | No authentication | No authentication |

Immediately change these credentials before sharing or exposing the stack.

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
