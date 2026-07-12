#!/bin/sh
# Runs before every backend-image container start (see Dockerfile ENTRYPOINT).
# Only waits for Postgres / runs migrations when DATABASE_URL is actually set
# in the environment - that's true for the `backend` service, but not for the
# `mitre-sync` one-off job (same image, different command, no DB access
# needed), so it's skipped there rather than failing or hanging.
set -e

if [ -n "$DATABASE_URL" ]; then
  python - <<'PYEOF'
import os
import sys
import time

import psycopg2

url = os.environ["DATABASE_URL"]
if not url.startswith("postgresql"):
    sys.exit(0)  # e.g. sqlite in local/dev runs - nothing to wait for

for attempt in range(30):
    try:
        conn = psycopg2.connect(url)
        conn.close()
        print("[entrypoint] PostgreSQL is ready.")
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001
        print(f"[entrypoint] Waiting for PostgreSQL... ({attempt + 1}/30) {exc}")
        time.sleep(2)

print("[entrypoint] PostgreSQL did not become ready in time.", file=sys.stderr)
sys.exit(1)
PYEOF

  echo "[entrypoint] Running Alembic migrations..."
  alembic upgrade head
fi

echo "[entrypoint] Starting: $*"
exec "$@"
