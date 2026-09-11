---
id: running-debugging-containers
title: Volume 3 — Running, Managing, and Debugging Containers
order: 3
description: The container lifecycle at the process level, docker run flags taught by problem, real debugging technique, and making cgroup limits visible by triggering them on purpose.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 3 — Running, Managing, and Debugging Containers

---

## The question this volume answers

Volume 2 left you with a static thing: an ordered list of tarballs and a JSON config. Volume 1 left you with a running thing: a process in namespaces, inside a cgroup, on an overlay mount.

This volume is the bridge. **What exactly happens between `docker run` and a process existing, and what happens to that process at every subsequent transition?**

The reason this matters beyond trivia: almost every confusing Docker behaviour in production is a lifecycle question wearing a disguise. Why did my container exit with code 137? Why did `docker stop` take ten seconds? Why is my "stopped" container still eating 4 GB of disk? Why did the restart policy resurrect a container I deliberately stopped? Each one has a precise answer at the process level, and you already have the tools to see it.

---

## The lifecycle, at the process level

### The states

```text
                    docker create
        (image) ─────────────────────► CREATED
                                          │
                                          │ docker start
                                          ▼
        ┌──── docker pause ────────►  RUNNING  ◄──── docker unpause ────┐
        │                                │                              │
        ▼                                │                              │
      PAUSED ───────────────────────────┘                              │
        └───────────────────────────────────────────────────────────────┘
                                          │
                       docker stop        │        docker kill
                  (SIGTERM, wait, SIGKILL)│        (SIGKILL now)
                                          │        or process exits on its own
                                          ▼
                                       EXITED
                                          │
                                          │ docker rm
                                          ▼
                                        (gone)
```

`docker run` is not a primitive. It is `docker create` + `docker start` (+ `docker attach` unless you passed `-d`). Splitting it apart is the clearest way to see where the boundary sits:

```bash
docker create --name lifecycle alpine sleep 300
docker ps -a --filter name=lifecycle
```

**Expect:** status `Created`. Now check whether a process exists:

```bash
docker inspect -f '{{.State.Pid}}' lifecycle
```

**Expect:** `0`. **Nothing is running.** But something has already happened: the writable layer was allocated, the config was resolved, and the container has an ID.

```bash
docker inspect -f '{{.GraphDriver.Data.UpperDir}}' lifecycle
```

That directory exists on your host right now, for a container that has never run. This is the answer to "why does `docker ps -a` show 200 dead containers eating disk" — a container is a persistent object with a filesystem, not a transient event.

```bash
docker start lifecycle
docker inspect -f '{{.State.Pid}}' lifecycle
```

**Expect:** a real host PID. `docker start` is the moment `clone()` happens: namespaces created, cgroup populated, overlay mounted, `pivot_root` performed, and finally `execve()` of your command.

### What each transition actually does

| Command | Signal / mechanism | Process afterwards | Filesystem afterwards |
| --- | --- | --- | --- |
| `create` | none | doesn't exist | writable layer allocated |
| `start` | `clone()` + `execve()` | PID 1 in a new PID namespace | overlay mounted |
| `pause` | **cgroup freezer** — not a signal | exists, unschedulable, unaware | mounted, untouched |
| `unpause` | freezer released | resumes mid-instruction | unchanged |
| `stop` | `SIGTERM`, wait (default 10s), then `SIGKILL` | gone | **writable layer preserved** |
| `kill` | `SIGKILL` immediately (or `-s` yours) | gone | preserved |
| `restart` | stop, then start | new process, new PID | **same writable layer** |
| `rm` | — | — | **writable layer deleted** |

Two rows deserve expansion.

**`pause` is not a signal, and that's the point.** Suspending a process with `SIGSTOP` is observable — the process can be told about it, and a signal handler can interfere. The cgroup freezer operates below that: the kernel simply stops scheduling every task in the cgroup. The process cannot detect it, cannot block it, and cannot run code during it. From its own perspective, no time passed at all.

Watch it directly, using Volume 1's cgroup skills:

```bash
docker run -d --name frozen --rm alpine sh -c 'i=0; while :; do echo $i; i=$((i+1)); sleep 1; done'
sleep 3
docker pause frozen
CID=$(docker inspect -f '{{.Id}}' frozen)
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cgroup.freeze
sleep 5
docker unpause frozen
docker logs frozen | tail -5
docker stop frozen
```

**Expect:** `cgroup.freeze` reads `1` while paused. The counter stops, then resumes from exactly where it was with no gap and no jump. Five seconds of wall-clock time are simply missing from the process's experience. (If the cgroup path doesn't resolve, find it with `find /sys/fs/cgroup -name "*$CID*" -maxdepth 3`.)

**`stop` versus `kill` is where exit codes come from.** You met exit code 137 in Volume 1. Here's the full decoder:

| Exit code | Meaning |
| --- | --- |
| 0 | Clean exit |
| 1–125 | The application's own exit code |
| 125 | The `docker run` command itself failed |
| 126 | The command exists but isn't executable |
| 127 | Command not found in the image |
| **137** | 128 + 9 = `SIGKILL` — OOM killer, or `docker stop` grace period expired |
| **139** | 128 + 11 = `SIGSEGV` |
| **143** | 128 + 15 = `SIGTERM` — a clean shutdown in response to `docker stop` |

The distinction between 143 and 137 is the one to internalize. **143 means your application handled `SIGTERM` and exited.** 137 means it didn't, and Docker had to use force. Volume 2's shell-form-versus-exec-form demo was exactly this difference, and you can now read it off the exit code:

```bash
docker run -d --name sig alpine sleep 300
docker stop sig
docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' sig
docker rm sig
```

**Expect:** `137 false`. `sleep` ignores nothing — it just has no `SIGTERM` handler, so... actually, watch that carefully. BusyBox `sleep` dies on `SIGTERM` in some builds and not others, and this is a nice reminder that "does my PID 1 handle signals" is an empirical question about the specific binary, not a general fact.

`OOMKilled` in that output is worth knowing on its own: it's how you distinguish "the kernel killed it for memory" from "the grace period expired," both of which show 137.

### Three more states you'll meet

- **`Restarting`** — the restart policy is between attempts. Covered below.
- **`Dead`** — a rare state where Docker failed to remove the container (typically a busy mount). Usually needs manual cleanup.
- **`docker ps` lies by default.** It shows running containers only. `docker ps -a` shows everything, and the gap between the two is where forgotten disk usage lives.

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Size}}"
docker rm lifecycle
```

---

## `docker run` flags, taught by problem

Flag lists are useless. Here is each flag as the answer to a situation.

### "My terminal is stuck and Ctrl-C does nothing" → `-d`, `-it`, `--rm`

```bash
docker run alpine sleep 30
```

Your terminal blocks for 30 seconds. `docker run` attaches to the container's stdio by default, which is right for a one-shot command and wrong for a service.

```bash
docker run -d alpine sleep 300        # detached: prints an ID, returns immediately
```

Now the interactive case:

```bash
docker run alpine sh        # exits instantly — why?
docker run -it alpine sh    # a working shell
```

The first exits because `sh` with no terminal and no input reads EOF immediately and quits. `-i` (`--interactive`) keeps stdin open; `-t` (`--tty`) allocates a pseudo-terminal so you get line editing, prompts, and job control. They're almost always used together, and almost always wrongly explained as one flag.

> **Don't use `-t` for non-interactive things.** A TTY merges stderr into stdout and inserts carriage returns, which corrupts logs and breaks piping. `docker run -i` alone is right for `cat file | docker run -i img command`.

`--rm` deletes the container (and its writable layer) the moment it exits. Use it for everything you run by hand. Without it you accumulate the `docker ps -a` graveyard:

```bash
for i in 1 2 3; do docker run alpine echo "run $i"; done
docker ps -a | head -5
docker container prune -f
```

### "I need to find it again tomorrow" → `--name`

Without a name you get a random one like `nostalgic_hopper`. A name gives you a stable handle for `logs`, `exec`, `stop` — and, crucially, becomes a **DNS name** on user-defined networks (see below). Names are unique per host; `--rm` frees them on exit.

### "I can't reach my app from the browser" → `-p`

```bash
docker run -d --name web --rm -p 8080:80 nginx:1.27
curl -s localhost:8080 | head -3
```

The syntax is `-p HOST:CONTAINER`, and the order is the thing people reverse. `-p 8080:80` means "host port 8080 goes to container port 80."

Bind to a specific interface when you don't want the world reaching it:

```bash
docker stop web
docker run -d --name web --rm -p 127.0.0.1:8080:80 nginx:1.27
curl -s localhost:8080 > /dev/null && echo "reachable locally"
```

**This matters more than it looks.** `-p 8080:80` binds `0.0.0.0` — every interface, including your public one. On a cloud VM that's the internet. And Docker writes its own `iptables` rules, which on many setups means **your host firewall rules do not apply to published container ports**. People discover this by finding their "internal" database indexed by Shodan. Volume 5 traces exactly why, and Volume 7 covers the fallout.

```bash
docker port web
docker stop web
```

### "My data vanished when I redeployed" → `-v`

```bash
docker run -d --name db --rm -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=localdev postgres:16
sleep 5
docker exec db psql -U postgres -c "SELECT version();" | head -3
```

`-v pgdata:/var/lib/postgresql/data` mounts a **named volume** — storage that lives outside the container's writable layer and survives `docker rm`. A bind mount uses a host path instead:

```bash
docker run --rm -v ~/docker-app:/code alpine ls /code
```

This is Volume 4's entire subject; for now, the rule is: **anything you'd be upset to lose does not belong in the writable layer.**

```bash
docker stop db
```

### "It needs configuration" → `-e` and `--env-file`

```bash
docker run --rm -e GREETING=hola -e LOG_LEVEL=debug alpine env | sort
docker run --rm --env-file /dev/null alpine env | head -3
```

Environment variables are the standard container configuration channel, because they require no files and no rebuild. Note the caveat you'll meet again in Volume 7: they are visible in `docker inspect`, in `/proc/PID/environ` on the host, and often in logs and crash reports. Fine for a log level. Not fine for a production database password.

### "It died at 3am and nobody restarted it" → `--restart`

Four policies, and only one is usually right:

| Policy | Restarts on crash | Restarts on clean exit (0) | Comes back after host reboot | Respects a manual `docker stop` |
| --- | --- | --- | --- | --- |
| `no` (default) | no | no | no | — |
| `on-failure[:N]` | yes | **no** | yes | yes |
| `always` | yes | **yes** | yes | **no — resurrects it** |
| `unless-stopped` | yes | yes | yes | **yes** |

The `always` versus `unless-stopped` difference is the one that catches people. Both survive reboots. But when the daemon restarts, `always` starts *every* container with that policy — including one you deliberately stopped before the reboot. `unless-stopped` remembers your intent. **For long-running services, `unless-stopped` is the default you want.** For one-shot jobs (migrations, build steps), `no` or `on-failure:N` — restarting a job that already succeeded is not recovery, it's a loop.

Docker also applies **exponential backoff** between restart attempts, starting around 100ms and doubling, with the delay resetting once a container has stayed up for about ten seconds. This is why a crash-looping container doesn't saturate your CPU, and also why the loop can run quietly for hours without anyone noticing.

> **Confidence: high** on the policy semantics; **medium-high** on the exact backoff numbers, which come from Docker's documented behaviour but I'd re-check against current docs before relying on the precise figures.

The debugging trick worth memorizing now:

```bash
docker update --restart no <container>
```

That freezes a crash loop so you can read the logs without racing the restart cycle.

### "It ate the whole machine" → `-m`, `--cpus`, `--pids-limit`

Volume 1 built these by hand. In practice:

```bash
docker run -d --name limited --rm \
  -m 256m --memory-swap 256m \
  --cpus 1.5 \
  --pids-limit 200 \
  nginx:1.27
docker stats --no-stream limited
docker stop limited
```

**Set limits on everything in production.** An unlimited container is a container with permission to take down every other container on the host, and the failure looks like a host problem rather than an application problem, which is why it takes so long to diagnose.

### A few more worth knowing

| Flag | Problem it solves |
| --- | --- |
| `--init` | Your PID 1 doesn't reap zombies — injects `tini` as PID 1 |
| `-u 1000:1000` | Run as a non-root user without rebuilding the image |
| `-w /path` | Override `WORKDIR` |
| `--read-only` | Make the root filesystem immutable (Volume 7) |
| `--network host` | Skip network isolation entirely — fast, and a real security decision |
| `--entrypoint sh` | Bypass a broken `ENTRYPOINT` to debug an image that won't start |
| `--health-cmd` | Define liveness without rebuilding |

That last-but-one flag is the single most useful debugging escape hatch in Docker. When an image crashes on startup and you can't see why:

```bash
docker run --rm -it --entrypoint sh myapp:v2
```

You get a shell in the exact image, in the exact environment, with the broken command not running.

---

## Debugging: seeing what the container sees

### `docker logs` — and its two honest limitations

```bash
cd ~/docker-app
docker build -q -t myapp:v2 .
docker run -d --name myapp --rm -p 8000:8000 -e GREETING="debugging" myapp:v2
curl -s localhost:8000
docker logs myapp
docker logs -f --tail 20 --timestamps myapp    # Ctrl-C to stop following
```

`docker logs` shows **stdout and stderr of PID 1, and nothing else.** Two consequences that cause a great deal of confusion:

1. **If your app writes to a log file inside the container, `docker logs` shows nothing.** The container convention is: log to stdout, let the platform handle routing. Apps ported from VMs usually don't, and this is the fix.
2. **Buffering hides output.** Volume 2's `PYTHONUNBUFFERED=1` exists for this; equivalents exist per language. If logs appear only when a container stops, or vanish when it's killed, you're looking at a buffer, not at Docker.

And a third point that becomes this volume's incident: those logs are **written to a file on your host, which by default has no size limit**:

```bash
CID=$(docker inspect -f '{{.Id}}' myapp)
sudo ls -lh /var/lib/docker/containers/$CID/$CID-json.log
docker info | grep -i "logging driver"
```

### `docker exec` — a second process, not a second container

```bash
docker exec myapp ps aux
docker exec -it myapp bash
```

`docker exec` starts a **new process** in the existing container's namespaces and cgroup. It is not a shell "into" anything — it's `setns()` plus `execve()`, which is precisely what you did by hand with `nsenter` in Volume 1.

Two facts that follow:

- **Processes started by `exec` count against the container's limits.** Running a memory-hungry debug tool inside a 256 MB container can OOM the whole thing, including your application.
- **If the image has no shell, `exec` has nothing to run.** This is the distroless trade-off from Volume 2. The answer is a debug sidecar sharing the target's namespaces:

```bash
docker run --rm -it --pid=container:myapp --network=container:myapp \
  --cap-add SYS_PTRACE alpine sh
```

Inside that shell, `ps aux` shows the *target's* processes and `netstat -tlnp` shows its listening sockets — because you joined its PID and network namespaces. The container being debugged needs no tooling at all. This technique is worth more than any single Docker command.

### `docker inspect` — the whole truth, as JSON

```bash
docker inspect myapp | python3 -m json.tool | head -40
docker inspect -f '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}' myapp
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' myapp
docker inspect -f '{{json .HostConfig.Memory}}' myapp
```

`--format` uses Go templates and is what makes `inspect` usable in scripts. The four fields above — status, exit code, `OOMKilled`, `RestartCount` — are the fastest triage in Docker. `RestartCount` climbing on a container that should be stable is the signal that something is crash-looping behind a restart policy.

### The rest of the kit

```bash
docker stats --no-stream                 # live CPU/memory/net/IO per container
docker top myapp                         # container processes with HOST PIDs
docker diff myapp                        # every file changed since start
docker events --since 5m                 # daemon-level event stream
docker cp myapp:/app/app.py /tmp/         # pull a file out without a shell
```

`docker diff` is underused and deserves a look — it reads the overlay upper directory and reports `A` (added), `C` (changed), `D` (deleted). You are reading copy-on-write output directly:

```bash
docker exec myapp sh -c 'echo test > /tmp/newfile'
docker diff myapp | head
```

And `docker events` is how you find out *why* something disappeared:

```bash
docker events --since 10m --filter 'event=die' --filter 'event=oom'
```

Cleanup: `docker stop myapp`

---

## Making cgroups visible

Volume 1's theory, now as things you watch happen.

### Watch an OOM kill and read the evidence

```bash
docker run -d --name hungry -m 100m --memory-swap 100m python:3.12-slim \
  python -c "
import time
data = []
while True:
    data.append(bytearray(10 * 1024 * 1024))
    print(f'allocated {len(data) * 10} MB', flush=True)
    time.sleep(0.5)
"
sleep 8
docker logs hungry | tail -3
docker inspect -f 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' hungry
docker rm hungry
```

**Expect:** logs climbing to roughly 90 MB, then stopping. `exit=137 oom=true`.

**The lesson that matters operationally:** the application did nothing wrong and got no warning. There is no catchable exception, no graceful shutdown, no chance to flush anything. `SIGKILL` cannot be handled. To your monitoring this looks like a spontaneous disappearance — which is why `OOMKilled` is the first field to check when a container vanishes mysteriously.

> **Flagged:** deliberately triggers the OOM killer inside a 100 MB cgroup. Scoped and safe; `dmesg` will record it.

### Watch throttling, and see why it's invisible

```bash
docker run -d --name slow --rm --cpus 0.2 alpine \
  sh -c 'while :; do md5sum /dev/zero; done'
sleep 5
docker stats --no-stream slow
CID=$(docker inspect -f '{{.Id}}' slow)
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.stat
sleep 5
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.stat
docker stop slow
```

**Expect:** ~20% CPU in `docker stats`, and `nr_throttled` / `throttled_usec` climbing between the two reads.

**Why this is the more insidious failure:** an OOM kill is loud. Throttling is silent. Your app is up, healthy, serving — just slowly and in bursts, with latency spikes that correlate with nothing in the application's own metrics. The host looks idle. `nr_throttled` is the only place the truth is written down, and almost nobody looks at it.

### Contain a fork bomb safely

```bash
docker run --rm --pids-limit 50 alpine sh -c \
  'i=0; while [ $i -lt 200 ]; do sleep 60 & i=$((i+1)); done; echo "spawned all"; wait' \
  2>&1 | tail -5
```

**Expect:** `can't fork` errors after roughly 50 processes. The container fails; your machine is fine.

**Why it's interesting:** the `pids` cgroup controller is the cheapest insurance in Docker and almost nobody sets it. Without `--pids-limit`, a runaway fork loop in any container exhausts the host's global PID space and you cannot even log in to fix it. Run the same thing without the flag only if you enjoy hard reboots — which is to say, don't.

---

## Practical networking

Internals are Volume 5. Here is the working knowledge.

### The default bridge, and why you shouldn't use it

```bash
docker network ls
```

`bridge`, `host`, and `none` ship by default. Containers with no `--network` flag land on `bridge` — and on the default bridge, **name resolution does not work**. Containers can reach each other by IP only.

### User-defined networks: the actual answer

```bash
docker network create appnet
docker run -d --name api --rm --network appnet -e GREETING="from api" myapp:v2
docker run --rm --network appnet alpine sh -c 'apk add -q curl && curl -s http://api:8000'
```

**Expect:** the second container reaches the first **by the name `api`**. Docker runs an embedded DNS server at `127.0.0.11` inside each container on a user-defined network, resolving container names and aliases to current IPs.

Prove it:

```bash
docker run --rm --network appnet alpine cat /etc/resolv.conf
docker run --rm --network appnet alpine nslookup api
```

**This is the single most important practical networking fact in Docker:** create a user-defined network, name your containers, and address them by name. IPs change on every restart; names don't. Every Compose file in Volume 6 relies on this, and Compose creates such a network for you automatically — which is why service names "just work" there.

### Publishing versus connecting

Two distinct things people conflate:

- **Container-to-container on the same network:** use the **container port** directly (`http://api:8000`). No `-p` needed. Publishing is irrelevant here.
- **Host or outside world to container:** requires `-p`. This is the only case that needs it.

So a database used only by your app should have **no `-p` at all**. Every `-p 5432:5432` in a Compose file is a database exposed to the host, and often to the network. It's there because someone wanted to connect a GUI client once.

```bash
docker network inspect appnet --format '{{json .Containers}}' | python3 -m json.tool
docker stop api
docker network rm appnet
```

### The other drivers, briefly

| Driver | What it does | When |
| --- | --- | --- |
| `bridge` | Private network + NAT (default) | Almost always |
| `host` | No network namespace at all — container uses host's stack | Extreme performance need, or port-scanning tools. Loses isolation and port remapping |
| `none` | Network namespace with only `lo` | Batch jobs that must not touch the network |
| `overlay` | Multi-host networking | Swarm / orchestration (Volume 8) |

```bash
docker run --rm --network host alpine ip addr | head -5
docker run --rm --network none alpine ip addr
```

**Expect:** `host` shows your machine's real interfaces; `none` shows only loopback. This is Volume 1's network namespace, exposed as a flag.

---

## The incident: the restart loop that filled the disk

**A note on this one.** Volumes 1 and 2 had named, individually documented incidents with CVE numbers and researcher names. This volume's failure is different in kind: it is a *pattern* that recurs constantly across many organizations, written up repeatedly in incident retrospectives and vendor postmortems, rather than one famous outage with a canonical public writeup. I'd rather tell you that than dress up a composite as a specific event. The mechanism below is well documented; treat the narrative as representative rather than as a particular company's 3am.

**The setup.** A service runs with `restart: always`. It's reliable, so nobody thinks about it. Docker's default logging driver, `json-file`, is in use — because it's the default and nobody changed it. It has **no size limit by default**.

**The trigger.** A dependency becomes unreachable — a broker, a database, a DNS change. The application enters a retry loop and logs every attempt. Thousands of lines per minute, all to stdout, all captured by the logging driver and written to `/var/lib/docker/containers/<id>/<id>-json.log`.

**The escalation.** In the documented cases, one chatty container producing a few megabytes per minute reaches tens of gigabytes in days. The reported pattern is a single JSON log file exceeding 10 GB, and in another case roughly 42 GB accumulated over six days from one service logging at about 5 MB/minute. Then the disk hits 100%.

**The cascade.** Now *every* container on the host fails, because nothing can write. They crash. The restart policy dutifully restarts them. They crash again — and each failed attempt logs more, to a disk that has no space, which fails, which logs. The restart policy converts a single service's bug into a total host outage, and the exponential backoff means it happens quietly over hours rather than announcing itself.

**Why it's genuinely hard to diagnose at 3am.** `docker system df` doesn't obviously show it, because the space isn't in images or volumes — it's in container log files, which that command doesn't foreground. `df -h` says 100% full while `du` on the obvious directories doesn't add up, because a deleted-but-still-open log file holds its blocks until the writing process exits. And the containers you're looking at — all of them restarting — are victims, not the cause. The one service that caused it looks exactly like the others.

**The three independent mistakes**, each individually harmless:

1. **No log rotation.** The default is unbounded. Fix it globally in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Then `sudo systemctl restart docker`. This applies to **newly created** containers only — existing ones keep their original settings, which is a nasty surprise when you "fix" it and nothing changes.

2. **`always` instead of `unless-stopped`,** and no thought about what a restart policy is for. A policy is a safety net for transient failures. It is not a fix for a broken container, and it actively hides the failure — the container looks like it's running because it keeps being restarted.

3. **No resource limits and no monitoring of `RestartCount`.** A container restarting 400 times overnight should page someone. Nothing was watching.

**The rules that fall out:**

- Configure log rotation on every host, before you need it. This is a two-line file.
- Use `unless-stopped` for services, `on-failure:N` for jobs. A bounded retry count makes failures visible instead of eternal.
- Alert on `RestartCount` increasing, not just on "container down" — a crash-looping container is *up* most of the time.
- Set memory limits with headroom, and watch `OOMKilled` and `nr_throttled`.
- When you find a crash loop: `docker update --restart no <name>` first, then read the logs. Debugging while something restarts under you wastes the worst hour of the night.

The deeper point, and it's the theme of this volume: **the restart policy is not resilience. It is a retry.** Resilience means the failure is visible, bounded, and attributable. A retry that hides the error and amplifies its side effects is the opposite.

---

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

## Where this leaves you, and what's next

You can now trace a container from `create` through to `rm` and say what happens to the process, the cgroup, and the overlay at every step. You can read an exit code and know whether the app shut down cleanly, got OOM-killed, or timed out its grace period. You can debug a container with no shell in it, freeze a crash loop before reading its logs, and watch cgroup limits fire on purpose rather than in production.

The recurring theme across all three volumes so far: **Docker's commands are thin wrappers over kernel mechanisms you can inspect directly.** `docker pause` is a write to `cgroup.freeze`. `docker exec` is `setns()`. `-m 256m` is a number in `memory.max`. Whenever Docker's behaviour surprises you, the answer is one level down, and you now know how to look.

One thing this volume deliberately deferred: you used `-v pgdata:/var/lib/postgresql/data` without explaining it, and you watched a stopped container hold 200 MB of a writable layer that `rm` destroyed.

**Volume 4: Data and Persistence.**

Containers are meant to be disposable, and real applications have state — we'll derive that tension explicitly rather than papering over it. Volumes versus bind mounts versus tmpfs: what each actually is at the mount-namespace level, not just which flag to type. Where Docker really puts volume data on your host filesystem, which you'll go find yourself. Backing up and restoring a volume as a worked example. And a close on the data-loss failure that follows directly from what you saw in exercise 3.1 — treating a container's writable layer as if it were storage.

Say "continue" when you're ready.
