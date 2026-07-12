FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

# Schema is managed by Alembic (backend/alembic/versions). entrypoint.sh waits
# for PostgreSQL to accept connections and runs `alembic upgrade head` before
# handing off to CMD - no manual `docker exec` migration step required.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
