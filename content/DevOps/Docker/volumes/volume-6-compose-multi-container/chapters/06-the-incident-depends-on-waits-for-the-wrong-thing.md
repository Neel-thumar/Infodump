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

