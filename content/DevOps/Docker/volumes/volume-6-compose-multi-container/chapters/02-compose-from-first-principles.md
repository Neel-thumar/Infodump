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

