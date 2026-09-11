## Hardening the Volume 6 application

Everything above, applied to the stack you built.

```bash
cd ~/compose-app
mkdir -p secrets
echo "a-much-better-password-$(openssl rand -hex 12)" > secrets/db_password.txt
chmod 600 secrets/db_password.txt
printf 'secrets/\n.env\n' >> .gitignore
```

```bash
cat > compose.hardened.yaml <<'EOF'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_DB: appdb
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks: [backend]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 3s
      timeout: 5s
      retries: 15
      start_period: 10s
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
    cap_add: [CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID]
    mem_limit: 512m
    pids_limit: 200
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    user: "999:999"
    read_only: true
    tmpfs:
      - /tmp
    networks: [backend]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 10
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
    mem_limit: 128m
    pids_limit: 50
    restart: unless-stopped

  api:
    build: ./api
    user: "10001:10001"
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      DATABASE_URL_FILE: /run/secrets/db_password
      REDIS_URL: redis://cache:6379
    secrets:
      - db_password
    networks: [frontend, backend]
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
    mem_limit: 256m
    pids_limit: 100
    restart: unless-stopped

networks:
  frontend:
  backend:
    internal: true

volumes:
  pgdata:

secrets:
  db_password:
    file: ./secrets/db_password.txt
EOF
```

Note what changed and why each line is there:

| Change | Attack it addresses |
| --- | --- |
| `secrets:` + `*_FILE` | Password out of git, out of `inspect`, out of `/proc` |
| `user:` on every service | RCE lands as an unprivileged user |
| `read_only: true` + `tmpfs` | No persistence, no dropped payloads, `noexec` on scratch |
| `cap_drop: [ALL]` | Removes `NET_RAW` spoofing and `SYS_ADMIN` escape paths |
| `no-new-privileges` | Kills the SUID escalation class |
| `mem_limit` / `pids_limit` | Resource exhaustion and fork bombs (Volume 3) |
| `backend` + `internal: true` | Database has no outbound internet — a compromised DB can't call home |
| `127.0.0.1:` on the published port | Volume 5's firewall bypass |

> The `api` service's `DATABASE_URL_FILE` needs a small code change to read the password file and assemble the connection string — I've left that as the obvious next step rather than rewriting `app.py` here. The `cap_add` list on postgres is the minimum that image needs to chown its data directory at startup; if you shrink it further, test a **cold** start with an empty volume, because that's where the permissions work happens.

Verify the result:

```bash
docker compose -f compose.hardened.yaml up -d db cache
sleep 12
docker compose -f compose.hardened.yaml ps
docker compose -f compose.hardened.yaml exec cache id
docker compose -f compose.hardened.yaml exec cache sh -c 'touch /etc/newfile 2>&1 || echo "read-only enforced"'
docker inspect $(docker compose -f compose.hardened.yaml ps -q cache) \
  --format '{{json .HostConfig.CapDrop}} {{json .HostConfig.SecurityOpt}} {{.HostConfig.ReadonlyRootfs}}'
docker compose -f compose.hardened.yaml down
```

---

