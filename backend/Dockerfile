FROM python:3.11-slim

WORKDIR /app

<<<<<<< HEAD
=======
# Remote lab hosts can have slow access to PyPI. Keep downloads retryable and
# reuse completed wheels between BuildKit rebuilds.
ENV PIP_DEFAULT_TIMEOUT=180 \
    PIP_RETRIES=10 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

>>>>>>> 06aa3bad5cbf649d56764f464d5221c3b197ed85
# System deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
<<<<<<< HEAD
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

# Schema is managed by Alembic (backend/alembic/versions). entrypoint.sh waits
# for PostgreSQL to accept connections and runs `alembic upgrade head` before
# handing off to CMD - no manual `docker exec` migration step required.
ENTRYPOINT ["./entrypoint.sh"]
=======
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout 180 --retries 10 -r requirements.txt

COPY . .

# Table creation and idempotent admin seeding happen in the application lifespan.
>>>>>>> 06aa3bad5cbf649d56764f464d5221c3b197ed85
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
