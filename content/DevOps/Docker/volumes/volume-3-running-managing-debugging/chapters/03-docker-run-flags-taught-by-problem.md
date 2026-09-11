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

