# AI-Powered SOC Incident Generation & Investigation Platform

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
ai-soc-platform/
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

```bash
git clone https://github.com/mantraak/ai-soc-platform.git

cd ai-soc-platform

docker compose up --build
```

The application will be available after all services start.

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
