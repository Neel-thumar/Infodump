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

