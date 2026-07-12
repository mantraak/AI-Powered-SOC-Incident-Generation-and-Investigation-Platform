# Romulus

An AI-driven Security Operations Center (SOC) training platform that automatically generates realistic cybersecurity incidents and provides an end-to-end investigation environment using industry-standard security tools.

The platform enables administrators to create incident scenarios from natural language descriptions, threat intelligence, and MITRE ATT&CK techniques. It then generates realistic attack timelines, logs, forensic artifacts, alerts, and investigation tasks that analysts can investigate through integrated SOC tooling.

---

## Features

### AI Scenario Generation

* AI-powered incident generation
* Attack storyline creation
* MITRE ATT&CK mapping
* Timeline generation
* IOC extraction
* Investigation question generation
* Containment task generation

### Security Operations

* SIEM event generation
* Synthetic forensic artifact generation
* Threat intelligence integration
* Incident case management
* Analyst investigation portal
* Automated evaluation and scoring

### Platform

* Role-based authentication
* Scenario management
* REST API
* Docker deployment
* Monitoring and logging
* CI/CD pipeline

---

## Architecture

```text
                  Administrator
                        │
                        ▼
            Scenario Creation Portal
                        │
                        ▼
              AI Scenario Generator
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
   Event Generator  Artifact Generator  IOC Generator
        │               │                │
        └───────────────┼────────────────┘
                        ▼
               Scenario Validation
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
      Wazuh           MISP            TheHive
                        │
                        ▼
           Player Investigation Portal
                        │
                        ▼
             Evaluation & Scoring Engine
```

---

## Tech Stack

### Frontend

* React
* TypeScript
* Tailwind CSS

### Backend

* FastAPI
* SQLAlchemy
* Pydantic
* Celery

### Database

* PostgreSQL
* Redis

### Infrastructure

* Docker
* Docker Compose
* Nginx

### Security Tools

* Wazuh
* OpenSearch
* MISP
* TheHive
* MITRE ATT&CK

### DevSecOps

* GitHub Actions
* Semgrep
* Trivy
* Gitleaks
* Prometheus
* Grafana

---

## Project Structure

```text
romulus/
│
├── backend/
│   ├── api/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── generators/
│   ├── integrations/
│   ├── evaluators/
│   └── worker/
│
├── frontend/
│
├── infrastructure/
│
├── scenarios/
│
├── event-templates/
│
├── artifact-templates/
│
├── tests/
│
└── docs/
```

---

## Workflow

1. Administrator creates a new incident scenario.
2. AI generates attack steps, timeline, events, artifacts, alerts, and investigation questions.
3. Generated events are imported into the SIEM.
4. Indicators are published to the threat intelligence platform.
5. Incident cases are created for investigation.
6. Players investigate the incident using integrated SOC tools.
7. The platform evaluates responses and generates a final score with feedback.

---

## Installation

The admin/player application is being developed separately. The SOC tool layer
can already be initialized and started on Windows with:

```powershell
./infrastructure/tools.cmd init all
./infrastructure/tools.cmd start all
```

### SOC tools (current implementation)

The Dockerized tool layer is available independently from the application UI.
It includes Wazuh, MISP, TheHive, Prometheus and Grafana using selectable Docker
Compose profiles. See [infrastructure/README.md](infrastructure/README.md) for
requirements, startup commands, credentials and the backend integration
contract.

### MITRE ATT&CK catalogue

The application uses a pinned local copy of Enterprise ATT&CK 19.1. On the
first application start, the `mitre-sync` container downloads the official
STIX 2.1 collection and stores a compact searchable catalogue in the
`mitre_data` Docker volume. The backend validates both administrator-selected
and AI-generated technique IDs against this catalogue.

Administrators can search by technique ID, name, description, or tactic from
the scenario creation page. Authenticated API endpoints are available under:

```text
GET /api/v1/mitre/metadata
GET /api/v1/mitre/tactics
GET /api/v1/mitre/techniques
GET /api/v1/mitre/techniques/{technique_id}
```

To deliberately refresh the pinned catalogue:

```bash
MITRE_FORCE_SYNC=true docker compose --project-directory . \
  -f infrastructure/docker-compose.yml run --rm mitre-sync
```

### AI Moderator

Administrators can open **AI Moderator** in the sidebar and submit up to four
public cyber-incident article links, select MITRE ATT&CK techniques, or use
MITRE techniques alone. It produces an attack narrative, ATT&CK-aligned flow,
fictional assets, synthetic log/event counts, alerts, artifacts, investigation
questions, containment actions, assumptions, and safety notes.

Click **Create scenario draft** to carry the reviewed flow and log plan into the
normal scenario generator. The feature creates inert training data; it does not
execute attack tools or malware. Private/internal URLs and non-standard ports
are blocked.

Configure NVIDIA from **Admin > AI Settings** after signing in. Enter the chat
completions endpoint, model identifier, and a newly generated API key, then use
**Test saved connection**. The key is encrypted in the database and is never
returned to the browser.

For unattended deployment, the environment fallback is:

```bash
export NVIDIA_API_KEY='your-new-rotated-key'
export AI_API_ENDPOINT='https://integrate.api.nvidia.com/v1/chat/completions'
export AI_MODEL='meta/llama-3.3-70b-instruct'
docker compose --project-directory . -f infrastructure/docker-compose.yml up -d --build
```

Open Romulus at <https://localhost:48173>. The same gateway exposes all SOC
applications under `/wazuh/`, `/misp/`, `/thehive/`, `/grafana/`, and
`/prometheus/`; tool containers do not publish separate host ports.

---

## Security

* JWT Authentication
* Role-Based Access Control (RBAC)
* Input validation
* Rate limiting
* Container isolation
* Secret management
* Secure Docker deployment

---

## Future Enhancements

* Active Directory lab support
* Kubernetes deployment
* Automated attack emulation
* Additional forensic artifact types
* Cloud environment simulation
* Multi-SIEM support
* Adaptive AI-generated investigations
