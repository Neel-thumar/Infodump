## TRY THIS ON YOUR MACHINE

> Assumes `~/docker-app` from Volume 2 and a working `myapp:v2` image. Disk and cleanup flagged per item.

### 3.1 — Watch a container's writable layer grow, then reclaim it

```bash
docker run -d --name fatty alpine sh -c 'dd if=/dev/urandom of=/big.bin bs=1M count=200; sleep 300'
sleep 12
docker ps -s --filter name=fatty --format "table {{.Names}}\t{{.Size}}"
UPPER=$(docker inspect -f '{{.GraphDriver.Data.UpperDir}}' fatty)
sudo du -sh $UPPER
docker stop fatty
docker ps -as --filter name=fatty --format "table {{.Names}}\t{{.Status}}\t{{.Size}}"
sudo du -sh $UPPER
```

**Expect:** `docker ps -s` reports something like `200MB (virtual 208MB)` — the first number is the writable layer, the second includes the shared image. After `docker stop`, the container is not running **and the 200 MB is still on your disk.**

```bash
docker rm fatty
sudo du -sh $UPPER 2>&1 | tail -1
```

**Expect:** the directory is gone. Only `rm` reclaims it.

**Why it's interesting:** this is the most common source of mystery disk consumption on Docker hosts. Stopped containers are not free. A CI runner creating a few hundred containers a day without `--rm` fills a disk on a schedule, and `docker images` shows nothing wrong. **Disk:** ~200 MB, reclaimed at the end.

### 3.2 — Debug a container that has no shell

```bash
docker run -d --name target --rm -p 8000:8000 myapp:v2
docker run --rm -it \
  --pid=container:target \
  --network=container:target \
  --cap-add SYS_PTRACE \
  nicolaka/netshoot sh -c 'ps aux; echo "---"; netstat -tlnp; echo "---"; ip addr'
docker stop target
```

**Expect:** you see the target's gunicorn processes, its listening socket on 8000, and its `eth0` — from a completely separate container that shares its PID and network namespaces.

**Why it's interesting:** this is the production debugging technique. Your hardened, distroless, shell-less image stays hardened; the tooling lives in a throwaway container that joins its namespaces. It's `setns()` from Volume 1, exposed as two `docker run` flags, and it works on containers you cannot modify. **Disk:** ~200 MB for `netshoot`. **Cleanup:** `docker rmi nicolaka/netshoot`

### 3.3 — Prove that `docker pause` is invisible to the process

```bash
docker run -d --name timer --rm alpine sh -c \
  'while :; do echo "$(date +%s) tick"; sleep 1; done'
sleep 3
docker pause timer
sleep 6
docker unpause timer
sleep 3
docker logs timer
docker stop timer
```

**Expect:** the `tick` lines are consecutive with no gap in the *sequence* — but the Unix timestamps jump by about six seconds at the pause point.

**Why it's interesting:** the process's own view of events is perfectly continuous; only wall-clock time betrays the freeze. It didn't miss a signal, didn't get a handler invoked, didn't observe anything. This is what "the kernel stopped scheduling it" means, and it's why `pause` is safe for things a `SIGSTOP` would disturb. It's also why a paused container still holds its memory, its ports, and its file locks — pausing is not a way to free resources.

### 3.4 — Build a crash loop, then diagnose it the right way

```bash
docker run -d --name looper --restart on-failure:10 alpine sh -c 'echo starting; sleep 2; exit 1'
sleep 20
docker ps -a --filter name=looper --format "table {{.Names}}\t{{.Status}}"
docker inspect -f 'restarts={{.RestartCount}} exit={{.State.ExitCode}}' looper
docker events --since 60s --filter container=looper --filter event=die --until 0s
docker update --restart no looper
docker logs looper | tail -5
docker rm -f looper
```

**Expect:** `RestartCount` climbing, repeated `die` events with exit code 1, and the loop freezing the moment you change the policy.

**Why it's interesting:** every step here is the real incident procedure. `RestartCount` is the metric to alert on. `docker events` gives you the timeline. `docker update --restart no` stops the world so you can actually read the logs. Notice too that with `on-failure:10` the loop *ends* — a bounded policy converts an eternal silent failure into a stopped container someone will notice.

### 3.5 — Fill a log file and watch rotation fix it

```bash
docker run -d --name noisy --rm alpine sh -c 'while :; do echo "$(head -c 200 /dev/urandom | base64)"; done'
sleep 15
docker stop noisy
```

That was deliberately brief — it writes fast. Now compare with rotation configured per container:

```bash
docker run -d --name quiet --rm \
  --log-opt max-size=1m --log-opt max-file=2 \
  alpine sh -c 'while :; do echo "$(head -c 200 /dev/urandom | base64)"; done'
sleep 20
CID=$(docker inspect -f '{{.Id}}' quiet)
sudo ls -lh /var/lib/docker/containers/$CID/ | grep json.log
docker stop quiet
```

**Expect:** with rotation, you see at most two log files, each capped near 1 MB. The unbounded one would have kept going until the disk did.

**Why it's interesting:** you just watched this volume's incident happen in miniature and then watched the two-option fix contain it. Note that `--log-opt` per container is the demo; the real fix is in `/etc/docker/daemon.json` so it applies everywhere by default.

> **Flagged:** the first container writes to disk as fast as it can. It runs for 15 seconds — don't leave it running longer, and don't run it on a nearly-full disk. **Cleanup:** both use `--rm`, so stopping them removes the containers and their logs.

### Cleanup for this volume

```bash
docker ps -aq | xargs -r docker stop
docker container prune -f
docker network prune -f
docker system df
```

---

