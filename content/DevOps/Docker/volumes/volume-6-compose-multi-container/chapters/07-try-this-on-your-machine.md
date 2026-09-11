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

