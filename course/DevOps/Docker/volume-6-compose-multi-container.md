---
id: compose-multi-container
title: Volume 6 — Docker Compose and Multi-Container Applications
order: 6
description: What Compose actually automates, a real multi-service application built from first principles, and why depends_on waits for started rather than ready.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 6 — Docker Compose and Multi-Container Applications

---

## The question this volume answers

Every command in this guide so far has managed exactly one container. Real applications are not one container. A modest web application is an API, a database, a cache, and a reverse proxy — four containers that need the right network, the right volumes, the right environment variables, and a workable startup order.

You can do all of that with the commands you already know. Here is what that looks like:

```bash
docker network create myapp-net
docker volume create myapp-pgdata

docker run -d --name myapp-db --network myapp-net \
  -v myapp-pgdata:/var/lib/postgresql/data \
  -e POSTGRES_USER=appuser -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=appdb \
  --restart unless-stopped -m 512m \
  postgres:16

docker run -d --name myapp-cache --network myapp-net \
  --restart unless-stopped -m 128m \
  redis:7-alpine

sleep 10   # hope that's long enough

docker build -t myapp:latest ./api
docker run -d --name myapp-api --network myapp-net \
  -p 127.0.0.1:8000:8000 \
  -e DATABASE_URL=postgresql://appuser:localdev@myapp-db:5432/appdb \
  -e REDIS_URL=redis://myapp-cache:6379 \
  --restart unless-stopped -m 256m \
  myapp:latest
```

Nothing there is new — networks from Volume 5, volumes from Volume 4, flags from Volume 3, the build from Volume 2. It works.

And it is unusable as a way to run software. It lives in someone's shell history or a bash script nobody trusts. There's no way to see the current state as a whole, no way to tear it down cleanly, no way to know whether the running system matches the script. New team members clone the repo and get nothing. And that `sleep 10` is load-bearing.

**So the question: what is the minimum thing that turns "a pile of docker run commands" into a describable, reproducible, version-controlled application?**

Compose is that thing. It is worth being precise about what it is and isn't, because people either undersell it ("just a dev tool") or oversell it ("basically Kubernetes"). Compose is **a declarative front end to the Docker API for a single host**. It types your `docker run` commands for you, from a file. That's the whole value proposition, and it is a much bigger deal than it sounds.

---

## Compose from first principles

### The same stack, declared

```bash
mkdir -p ~/compose-app && cd ~/compose-app
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
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    restart: unless-stopped

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
    restart: unless-stopped

volumes:
  pgdata:
```

Map it line by line against the shell version above and you'll find nothing new — `build:` is `docker build`, `ports:` is `-p`, `volumes:` is `-v`, `environment:` is `-e`, `restart:` is `--restart`.

But three things are now true that weren't before: the whole system is **one artifact you can commit**, the state is **inspectable as a unit**, and teardown is **one command that knows what it created**.

### Two things Compose does for free

**It creates a network and puts everything on it.** No `networks:` key needed — Compose creates a user-defined bridge network named after the project and attaches every service. Which means, per Volume 5, that the embedded resolver at `127.0.0.11` answers for service names. That's why `api` reaches the database at the hostname `db` with no configuration at all.

**Service names are the DNS names.** Not container names — *service* names. Compose names the actual containers something like `compose-app-db-1`, and registers the alias `db`. This matters when you scale: three replicas of `api` all answer to the name `api`, and the resolver round-robins between them.

### The `version:` key is obsolete

You will see thousands of Compose files starting with `version: "3.8"`. Modern Compose ignores it and warns about it:

```bash
docker compose version
```

The Compose Specification unified the old v2 and v3 formats, and the top-level `version` key is no longer used. Omit it. If you see it in an old file, delete the line — this will matter in the incident section, because the version key is entangled with the single most confusing piece of Compose history.

Also note: **`docker compose` (plugin, v2, Go) has replaced `docker-compose` (standalone, v1, Python).** The hyphenated form is legacy. Commands are nearly identical; use the space.

---

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

## The Compose file, key by key

### `build` versus `image`

```yaml
  api:
    build: ./api          # build from a Dockerfile in ./api
  db:
    image: postgres:16    # pull a prebuilt image
```

Longer build form, when you need it:

```yaml
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.prod
      args:
        APP_VERSION: "1.2.3"
      target: runtime      # stop at this multi-stage target (Volume 2)
    image: myregistry.example.com/myapp:1.2.3   # tag the result
```

Using both `build` and `image` means "build it, and tag it this" — which is how you build locally and push the same artifact.

### `environment`, `env_file`, and `.env` — three different things

This trips everyone, so be precise:

```bash
cat > .env <<'EOF'
POSTGRES_PASSWORD=localdev
API_PORT=8000
EOF

cat > api.env <<'EOF'
LOG_LEVEL=debug
FEATURE_FLAG_X=true
EOF
```

| Mechanism | Who reads it | When |
| --- | --- | --- |
| `.env` in the project directory | **Compose itself** | At parse time, to substitute `${VARS}` **in the YAML** |
| `env_file: [api.env]` | The **container** | At run time, as environment variables |
| `environment:` | The **container** | At run time, literal or substituted values |

```yaml
  api:
    env_file:
      - api.env
    environment:
      DATABASE_URL: postgresql://appuser:${POSTGRES_PASSWORD}@db:5432/appdb
    ports:
      - "127.0.0.1:${API_PORT}:8000"
```

`${POSTGRES_PASSWORD}` comes from `.env` and is substituted **into the file** before Docker ever sees it. `LOG_LEVEL` from `api.env` is handed to the container and never appears in the YAML. Confirm what Compose actually resolved:

```bash
docker compose config
```

**That command is the single best debugging tool in Compose.** It prints the fully resolved file — all substitutions applied, all override files merged, all defaults filled in. When something isn't behaving, look at what Compose actually thinks you wrote.

> **`.env` goes in `.gitignore`, always.** Commit a `.env.example` with the keys and dummy values. And note this is still the environment-variable secrets anti-pattern from Volume 2 — fine for local development, not for production. Volume 7 covers the alternatives.

### `networks` — when the default isn't enough

The default single network means every service can reach every other service. For a real tiering model, declare them:

```yaml
services:
  proxy:
    image: nginx:1.27
    networks: [frontend]
    ports: ["80:80"]

  api:
    build: ./api
    networks: [frontend, backend]

  db:
    image: postgres:16
    networks: [backend]

networks:
  frontend:
  backend:
    internal: true      # no route to the outside world at all
```

Now the database is unreachable from the proxy and, thanks to `internal: true`, has no outbound internet access either — a genuinely meaningful mitigation, since a compromised database container can't call home. This is Volume 5's `DOCKER-ISOLATION` chains, declared.

### `volumes` — named, bind, and the dev/prod split

```yaml
  api:
    volumes:
      - ./api:/app              # bind mount: live code reload (dev only)
      - appcache:/app/.cache    # named volume: persistent
      - /app/node_modules       # anonymous: shadow the bind mount
    tmpfs:
      - /tmp
```

That third entry is a real technique worth knowing: when you bind-mount your source over `/app`, you also cover up anything the *image* built there (like installed dependencies). An anonymous volume at the sub-path shadows the bind mount for that directory only, letting the image's version win. It's a hack, and it's the standard one.

### `healthcheck` — the thing that makes ordering work

```yaml
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
```

`start_period` is the grace window during which failures don't count toward `retries` — for slow-starting services this is the difference between a working healthcheck and a container declared dead during normal startup.

### `deploy`, `profiles`, and overrides, briefly

```yaml
  worker:
    build: ./api
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
```

`deploy.resources.limits` works in plain Compose (it maps to the cgroup limits from Volume 3); most other `deploy` keys are Swarm-only and silently ignored otherwise — a common source of "why isn't this taking effect."

**Profiles** let optional services sit in the same file without always running:

```yaml
  adminer:
    image: adminer
    profiles: ["debug"]
    ports: ["8081:8080"]
```

```bash
docker compose --profile debug up -d
```

**Override files** are how dev and prod share a base. Compose automatically merges `compose.yaml` with `compose.override.yaml` if present:

```bash
# compose.override.yaml — picked up automatically, for development
# compose.prod.yaml — explicit:
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

---

## The commands

```bash
docker compose up -d              # create/start everything, detached
docker compose up -d --build      # rebuild images first
docker compose ps                 # state of this project's services
docker compose logs -f api        # follow one service's logs
docker compose logs -f            # all services, interleaved and colour-coded
docker compose exec api bash      # shell into a running service
docker compose run --rm api python migrate.py   # one-off container, then discard
docker compose restart api
docker compose stop
docker compose down               # stop and remove containers + network
docker compose down -v            # ...AND DELETE THE NAMED VOLUMES
docker compose config             # resolved configuration
docker compose top                # processes across services
```

Two distinctions worth committing to memory.

**`exec` versus `run`.** `exec` runs a command in an *existing, running* container (Volume 3's `setns`). `run` starts a *new* container from the service definition — useful for one-off tasks, and it ignores `ports` by default to avoid conflicts. If a service isn't running, `exec` fails and `run` works.

**`down` versus `down -v`.** `down` removes containers and the network and **keeps named volumes**. `down -v` deletes them. That single flag is the difference between "restart the stack" and "destroy the database," and it is exactly the Volume 4 data-loss mechanism with a friendlier interface. Anonymous volumes are removed by plain `down` too, which is one more reason to name everything.

---

## The incident: `depends_on` waits for the wrong thing

### The failure, reproduced

You already triggered it above. Let's look at it deliberately.

```bash
cd ~/compose-app
docker compose down -v
docker compose up -d
sleep 2
docker compose ps -a --format "table {{.Service}}\t{{.Status}}"
docker compose logs migrate
docker compose logs api | head -20
```

**Expect:** `migrate` exited non-zero with a connection error, and `api` is either crashed or serving 500s on `/customers` because the table doesn't exist.

Now run it again immediately:

```bash
docker compose down
docker compose up -d
sleep 6
docker compose logs migrate | tail -3
```

**Expect:** this time it probably worked — because the postgres image is now cached and the container starts faster relative to the others.

**That is the worst possible property for a bug to have.** It depends on image cache state, disk speed, host load, and whether the database is initializing for the first time or reopening an existing volume. It passes on the developer's warm machine and fails on the cold CI runner. It works for six months and then fails on the morning of a production migration.

### Why — and it is not a bug

Read Docker's own description of the short form's guarantee: Compose creates services in dependency order, and guarantees dependency services are **started** before starting a dependent service.

Started. Not ready.

Trace it against Volume 3's lifecycle. `depends_on: [db]` means: the `db` container reaches **running** state — `clone()` happened, the process exists — before Compose starts `migrate`. That is the entire promise, and Compose keeps it perfectly.

But PostgreSQL's startup sequence after the process exists is substantial: initialize the data directory on first run, run recovery, start background workers, **bind the socket**, and only then accept connections. On a first run with an empty volume that can be many seconds. Redis is faster but not instant. An application server may need to load a large model, warm a JIT, or connect to its own dependencies.

**The gap between "the process exists" and "the service answers" is where this bug lives**, and it is unbounded. Compose cannot know how to close it, because only the service itself knows what ready means. `pg_isready` for Postgres, `redis-cli ping` for Redis, an HTTP endpoint for your API — there is no generic answer, which is exactly why the generic tool doesn't provide one.

### A genuinely confusing history

This is where the `version:` key comes back to bite, and it's worth getting right because misremembered versions of this story are everywhere.

- **Compose file format v2.1** introduced `depends_on` with a `condition` option, including `service_healthy`.
- **Format v3.0 through v3.8 removed it.** The stated context was Swarm compatibility — in a cluster, ordering guarantees like this don't hold the same way. So for several years, files written to v3 got a schema error or a silently different behaviour, while v2.1 files worked. This produced a large body of Stack Overflow answers, blog posts, and tooling that are all correct *for their era* and wrong now.
- **The Compose Specification reintroduced it** (visible as v3.9 and in the unified spec that modern Compose implements). Long-form `depends_on` with conditions is fully supported in current Docker Compose.

> **Confidence: high** on the removal-and-return arc and on current support, which is documented in Docker's current Compose file reference. **Medium** on the precise version boundaries — sources describe the reintroduction variously as "3.9" and "the Compose Specification," and since the top-level `version` key is now obsolete anyway, the version numbers are mostly archaeology. The operative fact: **if you are on modern `docker compose` and you omit `version:`, conditions work.**

This history is also the reason so many real-world Compose files contain `wait-for-it.sh` or `dockerize` wrapper scripts. Those tools were the correct answer during the v3 gap. They're still occasionally useful, but for most cases the native mechanism is now better.

### The fix

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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 3s
      timeout: 5s
      retries: 15
      start_period: 10s
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  migrate:
    build: ./api
    entrypoint: ["python", "migrate.py"]
    environment:
      DATABASE_URL: postgresql://appuser:localdev@db:5432/appdb
    depends_on:
      db:
        condition: service_healthy
    restart: "no"

  api:
    build: ./api
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      DATABASE_URL: postgresql://appuser:localdev@db:5432/appdb
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://localhost:8000/health')\""]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 5s
    restart: unless-stopped

volumes:
  pgdata:
EOF
```

Now run it from completely cold:

```bash
docker compose down -v
docker compose up -d --build
docker compose ps -a --format "table {{.Service}}\t{{.Status}}"
docker compose logs migrate
curl -s localhost:8000/customers
curl -s localhost:8000/customers
```

**Expect:** every service healthy, the migration reporting success, and the two `curl` calls returning `"source":"database"` then `"source":"cache"` — proving the whole stack wired up correctly. And it works on the first cold run, repeatedly, on any machine.

The three conditions, precisely:

| Condition | Waits for |
| --- | --- |
| `service_started` | Container running. The old short-form default |
| `service_healthy` | Its `healthcheck` passing |
| `service_completed_successfully` | Container exited with code 0 — for migrations and init jobs |

`service_completed_successfully` is the one people miss, and it's how you express "run the migration to completion, then start the app" without a wrapper script. Note `restart: "no"` on `migrate` — Volume 3's lesson that restarting a completed job is a loop, not recovery.

Two further options worth knowing: `required: false` (introduced in Compose v2.20.0) downgrades a missing dependency to a warning, and `restart: true` in the long form restarts the dependent service when its dependency is restarted.

### The lesson that outlives Compose

Here's why this is more than a YAML tip. **Startup ordering is not a real solution to dependency availability.** Even with perfect ordering, your database can restart at 3am, the network can partition, a connection pool can go stale. The dependency will be unavailable at some point *while your application is already running*, and no amount of startup sequencing helps then.

So the actually-correct design is: **the application retries its own connections, with backoff, forever, and reports itself unhealthy until they succeed.** Then startup order stops mattering, because starting before the database is just a special case of the database being temporarily unavailable — which the application already handles.

Compose conditions are a convenience that makes cold starts clean and local development pleasant. They are not resilience. If you take one thing from this volume into Kubernetes later, take that: the platform's ordering primitives are a nicety, and the application's retry logic is the actual answer.

---

## TRY THIS ON YOUR MACHINE

> All exercises use `~/compose-app`. Disk and cleanup flagged per item.

### 6.1 — Watch the race condition happen and not happen

```bash
cd ~/compose-app
git init -q 2>/dev/null; cp compose.yaml compose.good.yaml

# strip the healthcheck conditions back to short form
python3 - <<'EOF'
import re
s = open('compose.good.yaml').read()
s = s.replace("""    depends_on:
      db:
        condition: service_healthy
    restart: "no\"""", "    depends_on:\n      - db\n    restart: \"no\"")
s = s.replace("""    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully""", "    depends_on:\n      - db\n      - cache\n      - migrate")
open('compose.bad.yaml','w').write(s)
EOF

for i in 1 2 3; do
  docker compose -f compose.bad.yaml down -v > /dev/null 2>&1
  docker compose -f compose.bad.yaml up -d > /dev/null 2>&1
  sleep 4
  echo "run $i: $(docker compose -f compose.bad.yaml logs migrate 2>&1 | tail -1)"
done
docker compose -f compose.bad.yaml down -v > /dev/null 2>&1
```

**Expect:** inconsistent results across runs — some succeed, some fail with connection errors. The `down -v` each time forces PostgreSQL to reinitialize, which widens the window.

Now the same loop against the good file:

```bash
for i in 1 2 3; do
  docker compose -f compose.good.yaml down -v > /dev/null 2>&1
  docker compose -f compose.good.yaml up -d > /dev/null 2>&1
  echo "run $i: $(docker compose -f compose.good.yaml logs migrate 2>&1 | tail -1)"
done
docker compose -f compose.good.yaml down -v > /dev/null 2>&1
```

**Expect:** consistent success, and `up -d` takes visibly longer because it's actually waiting.

**Why it's interesting:** you've made a race condition reproducible, which is the hardest part of debugging one. The nondeterminism *is* the diagnosis — anything that fails differently on identical input is a timing problem. **Disk:** the stack is a few hundred MB, reclaimed by `down -v`.

### 6.2 — Prove service names are DNS, not magic

```bash
docker compose up -d
docker compose exec api cat /etc/resolv.conf
docker compose exec api python -c "import socket; print(socket.gethostbyname('db'))"
docker compose exec api python -c "import socket; print(socket.gethostbyname('cache'))"
docker network ls | grep compose-app
docker network inspect compose-app_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

**Expect:** `nameserver 127.0.0.11` (Volume 5's embedded resolver), service names resolving to bridge-network IPs, and a network Compose created named `<project>_default`.

Now break it on purpose:

```bash
docker compose stop db
docker compose exec api python -c "
import socket
try: print(socket.gethostbyname('db'))
except Exception as e: print('resolution failed:', e)"
docker compose start db
```

**Expect:** resolution fails while the container is stopped — the name is registered per running container, not statically.

**Why it's interesting:** it confirms that Compose's "services find each other" is exactly the Volume 5 mechanism with names supplied automatically, and it shows the name's lifetime is tied to the container's. Nothing is cached, nothing is written to `/etc/hosts`.

### 6.3 — Watch a healthcheck transition through its states

```bash
docker compose down
docker compose up -d db
for i in $(seq 1 10); do
  echo "$(date +%T) $(docker compose ps db --format '{{.Status}}')"
  sleep 2
done
```

**Expect:** `health: starting` for a while, then `healthy`. You're watching the `start_period` window, then the check passing.

Inspect the raw record:

```bash
docker inspect $(docker compose ps -q db) --format '{{json .State.Health}}' | python3 -m json.tool | head -25
```

**Expect:** `Status`, `FailingStreak`, and a `Log` array of the last few probe results with exit codes, output, and timings.

Now break the check and watch it degrade:

```bash
docker compose exec db bash -c "mv /usr/lib/postgresql/16/bin/pg_isready /tmp/" 2>/dev/null
sleep 20
docker compose ps db --format '{{.Status}}'
docker inspect $(docker compose ps -q db) --format '{{.State.Health.FailingStreak}}'
docker compose exec db bash -c "mv /tmp/pg_isready /usr/lib/postgresql/16/bin/" 2>/dev/null
```

**Expect:** the status goes `unhealthy` after `retries` consecutive failures — and note the container is still **running**. Docker does not restart unhealthy containers; it only reports.

**Why it's interesting:** that last fact surprises almost everyone. A healthcheck is a signal, not an action. Compose uses it for ordering; an orchestrator uses it to reschedule; plain Docker does nothing with it. If you want "restart when unhealthy" on a single host, you need a sidecar watching for it or external monitoring — which is one honest reason people graduate to Kubernetes. **Cleanup:** `docker compose down`

### 6.4 — See exactly what Compose is doing on your behalf

```bash
docker compose up -d
echo "--- containers ---"
docker compose ps --format "table {{.Service}}\t{{.Name}}\t{{.Image}}"
echo "--- labels Compose stamped on them ---"
docker inspect $(docker compose ps -q api) --format '{{json .Config.Labels}}' | python3 -m json.tool
echo "--- the full docker-level config of one service ---"
docker inspect $(docker compose ps -q db) --format '{{json .HostConfig.Binds}} {{json .HostConfig.RestartPolicy}}'
```

**Expect:** labels like `com.docker.compose.project`, `com.docker.compose.service`, and `com.docker.compose.config-hash`.

**Why it's interesting:** **those labels are the entire state model.** Compose is stateless — it has no database, no daemon, no memory of what it did. `docker compose ps` works by querying Docker for containers whose project label matches the current directory name. `docker compose down` deletes by label. And `config-hash` is how `up` knows whether a running container still matches its definition or needs recreating.

Prove it:

```bash
docker ps --filter "label=com.docker.compose.project=compose-app" --format "{{.Names}}"
```

That's literally what Compose runs. Once you see this, Compose stops being a separate system and becomes what it is: a YAML parser that issues Docker API calls and labels the results.

### 6.5 — Scale a service and watch DNS round-robin

```bash
docker compose up -d --scale api=3
docker compose ps --format "table {{.Service}}\t{{.Name}}\t{{.Ports}}"
```

**Expect:** an error, or only one replica, because `ports:` maps a fixed host port and three containers can't share it. Remove the port mapping to scale properly:

```bash
docker compose down
sed 's|      - "127.0.0.1:8000:8000"|      - "8000"|' compose.yaml > compose.scale.yaml
docker compose -f compose.scale.yaml up -d --scale api=3
docker compose -f compose.scale.yaml ps --format "table {{.Name}}\t{{.Ports}}"

docker compose -f compose.scale.yaml exec cache sh -c '
for i in 1 2 3 4 5 6; do
  nslookup api 2>/dev/null | grep Address | tail -1
done'
```

**Expect:** three containers on random high host ports, and the DNS lookups returning different IPs across calls.

**Why it's interesting:** this is both a capability and its limit. You get basic DNS round-robin load balancing for free — no proxy, no config. But you also just hit the wall: you can't publish a fixed port for multiple replicas, there's no health-aware routing, no rolling update, and no way to spread replicas across machines. **This is precisely the gap orchestration fills**, and Volume 8 picks it up from here. **Cleanup:**

```bash
docker compose -f compose.scale.yaml down -v
rm -f compose.scale.yaml compose.bad.yaml compose.good.yaml
```

### Cleanup for this volume

```bash
cd ~/compose-app
docker compose down -v --rmi local
docker system df
```

Keep `~/compose-app` — Volume 7 hardens this exact application.

---

## Where this leaves you, and what's next

You can now describe a multi-service application as a single committed artifact, and you know that Compose is not a new system but a YAML front end that issues the same Docker API calls you were making by hand — with a set of labels as its only state. Services find each other by Volume 5's embedded DNS. Data persists via Volume 4's named volumes. Limits are Volume 3's cgroups. Builds are Volume 2's layers.

And you can reproduce, explain, and fix the timing bug that has broken more first deployments than anything else in Docker — along with the more valuable version of the lesson, which is that startup ordering is a convenience and application-level retry is the actual answer.

You have also, along the way, accumulated a stack with a password in plain text in a committed YAML file, a database container running as root, no capability restrictions, a writable root filesystem, and base images nobody has scanned.

**Volume 7: Security and Production Hardening.**

We start with an honest threat model: what a container genuinely protects against, and what it does not — the shared kernel means a kernel exploit still escapes, and this volume will not oversell the boundary. Then each defence introduced by the specific attack it stops: non-root users, read-only root filesystems, dropping capabilities, seccomp and AppArmor profiles, and what `no-new-privileges` actually prevents. Then image scanning and minimal base images, with concrete numbers on attack surface. Then secrets — why baking them into an image or passing them as environment variables is a documented anti-pattern, and what to do instead, including BuildKit's secret mounts. And we close on the best-documented category of container attack in the wild: automated cryptomining worms that find and exploit exposed Docker daemons, which you now have exactly the background to understand completely.

Say "continue" when you're ready.
