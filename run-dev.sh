#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# run-dev.sh  –  start the AI SOC Platform for local development
#
# Prerequisites:
#   • Python 3.11+  with a venv at backend/venv/
#   • Node 18+
#   • PostgreSQL running locally on port 5432 with:
#       database: aisoc   user: postgres   password: postgres
#     (or update backend/.env with your DATABASE_URL)
#   • Redis running locally on port 6379
# ─────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🛡  AI SOC Platform – dev startup"

# ── Backend ────────────────────────────────────────────────────────
echo ""
echo "▶ Starting backend (FastAPI)…"
cd "$ROOT/backend"

if [ ! -d venv ]; then
  echo "  Creating virtual environment…"
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

# Seed admin user and create tables
python seed.py

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID  →  http://localhost:8000"
echo "  Swagger docs →  http://localhost:8000/docs"

# ── Frontend ───────────────────────────────────────────────────────
echo ""
echo "▶ Starting frontend (Vite)…"
cd "$ROOT/frontend"

if [ ! -d node_modules ]; then
  echo "  Installing npm packages…"
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID  →  http://localhost:5173"

# ── Wait ───────────────────────────────────────────────────────────
echo ""
echo "✅ Both services running."
echo "   Admin login: admin@soc.local / Admin@1234"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
