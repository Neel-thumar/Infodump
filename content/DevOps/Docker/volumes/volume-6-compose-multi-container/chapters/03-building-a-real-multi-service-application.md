## Building a real multi-service application

Let's build something that actually exercises the hard parts: an API that talks to a database *and* a cache, plus a migration that must run before the API starts. That last requirement is where all the interesting problems live.

### The application

```bash
mkdir -p ~/compose-app/api && cd ~/compose-app/api
```

```bash
cat > requirements.txt <<'EOF'
flask==3.0.3
gunicorn==22.0.0
psycopg[binary]==3.2.1
redis==5.0.7
EOF
```

```bash
cat > app.py <<'EOF'
import os
import time
import psycopg
import redis
from flask import Flask, jsonify

app = Flask(__name__)
DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]

cache = redis.from_url(REDIS_URL, decode_responses=True)


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.get("/customers")
def customers():
    cached = cache.get("customers")
    if cached:
        return jsonify(source="cache", data=cached)

    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()

    payload = "; ".join(f"{r[0]}:{r[1]}" for r in rows)
    cache.setex("customers", 30, payload)
    return jsonify(source="database", data=payload)


@app.get("/")
def index():
    return jsonify(
        service="api",
        host=os.uname().nodename,
        started=time.strftime("%H:%M:%S"),
    )
EOF
```

```bash
cat > migrate.py <<'EOF'
import os
import psycopg

print("running migration...", flush=True)
with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id serial PRIMARY KEY,
            name text NOT NULL
        )""")
    count = conn.execute("SELECT count(*) FROM customers").fetchone()[0]
    if count == 0:
        conn.execute(
            "INSERT INTO customers (name) VALUES ('Acme'), ('Globex'), ('Initech')")
        print("seeded 3 customers", flush=True)
    conn.commit()
print("migration complete", flush=True)
EOF
```

```bash
cat > Dockerfile <<'EOF'
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py migrate.py ./

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8000"]
CMD ["--workers", "2", "--access-logfile", "-", "app:app"]
EOF
```

```bash
cat > .dockerignore <<'EOF'
__pycache__/
*.pyc
EOF
```

Every decision in that Dockerfile is Volume 2's — dependency layer before source, exec form, non-root user, unbuffered output.

### The naive Compose file, which will break

```bash
cd ~/compose-app
```

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data

  cache:
    image: redis:7-alpine

  migrate:
    build: ./api
    entrypoint: ["python", "migrate.py"]
    environment:
      DATABASE_URL: postgresql://appuser:localdev@db:5432/appdb
    depends_on:
      - db

  api:
    build: ./api
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      DATABASE_URL: postgresql://appuser:localdev@db:5432/appdb
      REDIS_URL: redis://cache:6379
    depends_on:
      - db
      - cache
      - migrate

volumes:
  pgdata:
```

Write it and run it:

```bash
cat > compose.yaml <<'EOF'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data

  cache:
    image: redis:7-alpine

  migrate:
    build: ./api
    entrypoint: ["python", "migrate.py"]
    environment:
      DATABASE_URL: postgresql://appuser:localdev@db:5432/appdb
    depends_on:
      - db

  api:
    build: ./api
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      DATABASE_URL: postgresql://appuser:localdev@db:5432/appdb
      REDIS_URL: redis://cache:6379
    depends_on:
      - db
      - cache
      - migrate

volumes:
  pgdata:
EOF

docker compose up -d
sleep 3
docker compose ps -a
docker compose logs migrate
```

**Expect, on a cold start with no cached postgres image:** the migration almost certainly failed with a connection error — something like `connection refused` or `the database system is starting up`.

That failure is the subject of this volume's incident, and we'll fix it properly in a moment. First, finish the tour.

```bash
docker compose down
```

---

