## TRY THIS ON YOUR MACHINE

> Several exercises demonstrate weaknesses on your own machine. Nothing here attacks anything external, and cleanup is flagged per item. Don't run the socket demonstrations on a machine you share.

### 7.1 — Measure your own attack surface, service by service

```bash
cd ~/compose-app
docker compose up -d 2>/dev/null
for c in $(docker compose ps -q); do
  name=$(docker inspect -f '{{.Name}}' $c)
  echo "=== $name ==="
  docker inspect $c --format 'user: {{.Config.User}}
  readonly: {{.HostConfig.ReadonlyRootfs}}
  privileged: {{.HostConfig.Privileged}}
  capdrop: {{.HostConfig.CapDrop}}
  secopt: {{.HostConfig.SecurityOpt}}
  memory: {{.HostConfig.Memory}}'
  docker exec $c id 2>/dev/null || echo "  (no shell)"
done
docker compose down
```

**Expect:** empty `user` (meaning root), `readonly: false`, no capability drops, no security options, `memory: 0` (unlimited) — across the board.

**Why it's interesting:** it turns "is my stack hardened" from a feeling into a report you can run in CI and diff. Run the same loop against `compose.hardened.yaml` and compare.

### 7.2 — Watch capabilities actually block something

```bash
echo "--- with default capabilities ---"
docker run --rm alpine sh -c 'ping -c1 -W1 127.0.0.1 > /dev/null && echo "raw socket: allowed (CAP_NET_RAW)"'

echo "--- with all capabilities dropped ---"
docker run --rm --cap-drop ALL alpine sh -c 'ping -c1 -W1 127.0.0.1 2>&1 | tail -1'

echo "--- capability masks compared ---"
docker run --rm alpine grep CapEff /proc/self/status
docker run --rm --cap-drop ALL alpine grep CapEff /proc/self/status
docker run --rm --privileged alpine grep CapEff /proc/self/status
```

**Expect:** ping works by default, fails with everything dropped, and three visibly different hex capability masks — a restricted default, all zeros, and all ones.

**Why it's interesting:** `CapEff` as a hex number is the most compact possible statement of what a container is allowed to do, and seeing `0000000000000000` next to `000001ffffffffff` makes `--privileged` concrete rather than abstract. `CAP_NET_RAW` being granted by default is the specific thing that lets a compromised container spoof ARP against its neighbours on the same bridge.

### 7.3 — Find secrets in an image you'd have shipped

```bash
mkdir -p /tmp/leak-hunt && cd /tmp/leak-hunt
cat > Dockerfile <<'EOF'
FROM alpine
ENV API_TOKEN=tok_live_abc123xyz
ARG BUILD_SECRET=build_sec_456
RUN echo "DB_PASS=prod_pw_789" > /app.conf && \
    echo "starting up" > /dev/null
RUN rm /app.conf
EOF
docker build --build-arg BUILD_SECRET=build_sec_456 -t leaky-image . > /dev/null

echo "--- 1. environment variables, from inspect ---"
docker inspect leaky-image --format '{{json .Config.Env}}'
echo "--- 2. build args, from history ---"
docker history --no-trunc leaky-image | grep -o "build_sec_[a-z0-9]*" | head -1
echo "--- 3. the 'deleted' file, from the layer tarballs ---"
docker save leaky-image -o img.tar && mkdir -p x && tar -xf img.tar -C x
grep -r "prod_pw_789" x/ 2>/dev/null | head -1 | cut -c1-80
```

**Expect:** all three recovered, from an image where one of them was explicitly deleted.

**Why it's interesting:** three distinct leak paths in a seven-line Dockerfile, each one a pattern you'll find in real repositories. And every one is invisible to someone reading only the Dockerfile — the `rm` line genuinely looks like it works. **Cleanup:** `cd ~ && rm -rf /tmp/leak-hunt && docker rmi leaky-image`

### 7.4 — Break a hardened container, and watch it fail safely

```bash
docker run -d --name hardened --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -u 10001:10001 \
  --pids-limit 30 \
  -m 64m \
  alpine sleep 300

echo "--- simulating post-exploitation steps ---"
docker exec hardened sh -c 'echo "backdoor" > /usr/local/bin/x 2>&1 || echo "BLOCKED: cannot write to filesystem"'
docker exec hardened sh -c 'cp /bin/busybox /tmp/p && chmod +x /tmp/p && /tmp/p true 2>&1 || echo "BLOCKED: noexec on /tmp"'
docker exec hardened sh -c 'id | grep -q "uid=0" && echo "root" || echo "BLOCKED: not root"'
docker exec hardened sh -c 'mount -t tmpfs none /mnt 2>&1 | tail -1'
docker exec hardened sh -c 'i=0; while [ $i -lt 100 ]; do sleep 30 & i=$((i+1)); done' 2>&1 | tail -1
docker stop hardened
```

**Expect:** every step blocked, by a different mechanism — the read-only mount, the `noexec` flag, the UID, the capability drop, and the pids cgroup.

**Why it's interesting:** it's a defence-in-depth demonstration where you can attribute each block to a specific flag. That attribution is what lets you argue for these settings in a code review instead of asserting that they're "best practice." **Note:** the process itself is still running and could still read anything its UID can read — hardening reduces impact, it does not make a compromise harmless.

### 7.5 — Check your own daemon exposure the way a scanner would

```bash
echo "--- is the daemon listening on TCP? ---"
sudo ss -tlnp | grep -E ":2375|:2376" || echo "no TCP listener — correct"
echo "--- how is dockerd invoked? ---"
ps aux | grep "[d]ockerd"
echo "--- socket permissions ---"
ls -l /var/run/docker.sock
echo "--- who has root-equivalent access? ---"
getent group docker
echo "--- containers with the socket mounted (each is root-equivalent) ---"
docker ps -q | xargs -r docker inspect --format '{{.Name}} {{range .Mounts}}{{.Source}} {{end}}' | grep docker.sock || echo "none"
echo "--- containers running privileged ---"
docker ps -q | xargs -r docker inspect --format '{{.Name}} privileged={{.HostConfig.Privileged}}' | grep true || echo "none"
```

**Expect:** no TCP listener, a root-owned socket, a short `docker` group, and no privileged or socket-mounting containers.

**Why it's interesting:** this is a five-minute audit that covers the entry point behind essentially every real-world Docker compromise in the wild. Run it on any server you're responsible for. If the first check finds a listener on 2375, treat the host as compromised until proven otherwise — the scanners found it long before you did.

### Cleanup for this volume

```bash
cd ~/compose-app
docker compose down -v 2>/dev/null
docker compose -f compose.hardened.yaml down -v 2>/dev/null
docker system prune -f
```

---

