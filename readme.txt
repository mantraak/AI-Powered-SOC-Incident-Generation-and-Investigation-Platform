# Development Setup

## Prerequisites

Install the following before running the project:

* Python **3.12.x**
* Node.js **18+**
* PostgreSQL **16+**
* Redis **7+**
* Git

## Python Version

This project uses **Python 3.12**.

> **Note:** Python 3.14 is **not supported** due to dependency compatibility issues.

### Known Issues with Python 3.14

* `pydantic-core` is not compatible with Python 3.14.
* `pydantic` depends on `pydantic-core`.
* `psycopg2-binary` may fail to build on Python 3.14.

## Backend Setup

```bash
cd backend

python3.12 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
```

## Frontend Setup

```bash
cd frontend

npm install
```

## Database

Install PostgreSQL and create the database:

```sql
CREATE DATABASE aisoc;
```

Set the PostgreSQL password for the `postgres` user if required.

## Redis

Start a local Redis server on the default port:

```
6379
```

## Environment

Update `backend/.env` if your PostgreSQL or Redis configuration differs from the defaults.

## Run the Application

Backend:

```bash
cd backend
source venv/bin/activate
python seed.py
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm run dev
```
