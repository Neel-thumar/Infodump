## Writing a Dockerfile from first principles

Let's build something real. A small Python web service — not because Python is special, but because it exercises every mechanism that matters: a base image, system packages, language dependencies, application code, configuration, a network port, and a process that must handle signals.

Set up the project:

```bash
mkdir -p ~/docker-app && cd ~/docker-app
```

```bash
cat > app.py <<'EOF'
import os
import signal
import sys
from flask import Flask, jsonify

app = Flask(__name__)
GREETING = os.environ.get("GREETING", "hello")

@app.get("/")
def index():
    return jsonify(message=GREETING, host=os.uname().nodename)

@app.get("/health")
def health():
    return jsonify(status="ok")

def shutdown(signum, frame):
    print(f"received signal {signum}, shutting down cleanly", flush=True)
    sys.exit(0)

signal.signal(signal.SIGTERM, shutdown)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
EOF
```

```bash
cat > requirements.txt <<'EOF'
flask==3.0.3
gunicorn==22.0.0
EOF
```

### The naive version, and why each line is there

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

CMD ["python", "app.py"]
```

```bash
docker build -t myapp:naive .
docker run -d --name myapp -p 8000:8000 --rm myapp:naive
curl localhost:8000
docker stop myapp
```

It works. Now let's take every instruction seriously, because each one has a behaviour people get wrong.

### FROM — you are inheriting someone's decisions

`FROM` sets the base: the starting `lowerdir` chain, plus inherited config (env vars, default user, sometimes an ENTRYPOINT). You are not starting from nothing; you are starting from a filesystem somebody else assembled, with their package versions and their CVEs.

```bash
docker images python:3.12-slim --format "{{.Size}}"
docker images python:3.12-alpine --format "{{.Size}}" 2>/dev/null
```

Base image families worth knowing:

| Base | Rough size | Trade-off |
| --- | --- | --- |
| `debian:bookworm` / `ubuntu:24.04` | 75–120 MB | Full userland, glibc, apt. Everything works. Largest surface |
| `*-slim` variants | 25–80 MB | Same distro, docs and extras stripped. Usually the right default |
| `alpine` | ~8 MB | musl libc, not glibc. Tiny — but Python wheels often lack musl builds, so pip compiles from source, and some binaries subtly misbehave |
| `distroless` (Google) | 2–20 MB | No shell, no package manager, no `ls`. Great security posture, painful to debug |
| `scratch` | 0 bytes | Literally empty. Only for static binaries (Go, Rust) |

> **The Alpine trap, stated plainly:** Alpine uses musl instead of glibc. For Python this regularly means longer builds and occasionally different runtime behaviour, because the manylinux wheel ecosystem targets glibc. "Alpine is smaller so use Alpine" is cargo-culted advice. For compiled Go or Rust it's excellent. For Python, `-slim` is usually the better default. **Confidence: high** on the mechanism; the practical severity has improved over time as musl wheels became more common, so measure rather than assume.

### WORKDIR — not the same as `cd`

`WORKDIR /app` creates the directory if missing and sets it for every subsequent `RUN`, `COPY`, `CMD`, and for the running container. Why not `RUN cd /app`? Because each `RUN` is a separate process in a separate layer. A `cd` in one `RUN` has no effect on the next. This catches everyone once.

### COPY vs ADD

`COPY` copies files from the build context into the image. `ADD` does that *and* auto-extracts local tarballs *and* can fetch URLs. That extra magic is why the convention is: **use `COPY` always, use `ADD` only when you deliberately want tar extraction.** Silently unpacking an archive you thought you were copying is an unpleasant surprise, and fetching URLs in `ADD` gives you an uncacheable, unverifiable download.

Which raises the build context. When you run `docker build .`, the CLI tars up that entire directory and sends it to the daemon *before the build starts*. If your project has a 2 GB `node_modules`, a `.git` with years of history, or a `venv`, all of it goes over that wire on every build.

```bash
cat > .dockerignore <<'EOF'
.git
.gitignore
__pycache__/
*.pyc
.venv/
venv/
node_modules/
.env
*.md
Dockerfile*
EOF
```

Note `.env` in that list. Excluding secrets from the build context is the first of several places in this volume where a small habit prevents a real leak.

### RUN — every one is a layer

Each `RUN` executes in a new container on top of the previous layer and commits the result as a new layer. Two consequences:

**Chain related commands, and clean up in the same instruction.** This is the whiteout lesson from Volume 1 applied to builds:

```dockerfile
# Wrong — the apt cache lives forever in layer 1; layer 2 only hides it
RUN apt-get update && apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# Right — the cache never becomes part of any committed layer
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
```

**Don't over-chain, either.** Merging everything into one gigantic `RUN` gives you one cache entry, so any change rebuilds all of it. Group by *rate of change*: things that change rarely (system packages) in one instruction, things that change often (your code) later and separately.

### ENV vs ARG

| | `ARG` | `ENV` |
| --- | --- | --- |
| Available during build | Yes | Yes |
| Present in the running container | **No** | **Yes** |
| Settable from CLI | `--build-arg` | `-e` at run time |
| Visible in image history | **Yes — `docker history` shows the value** | Yes, in the config |

That last row is the one that matters: **neither is safe for secrets.** `--build-arg API_KEY=...` feels transient, but the value is recorded in the image metadata and anyone with the image can read it. Volume 7 covers BuildKit's `--mount=type=secret`, which is the actual answer.

### EXPOSE documents; it does not publish

`EXPOSE 8000` is metadata. It opens nothing, publishes nothing, and changes no firewall rule. The port is reachable from outside the host only when you pass `-p 8000:8000` at run time. `EXPOSE` exists so tools and humans know what the image intends to listen on, and so `docker run -P` can auto-publish. Volume 5 covers what publishing actually does to your `iptables` rules.

### CMD vs ENTRYPOINT — the real difference

This is the most commonly fumbled pair in Docker, and the rule is short:

- **`ENTRYPOINT`** is the executable. It is not overridden by arguments to `docker run`.
- **`CMD`** is the default arguments. Anything you type after the image name in `docker run` **replaces `CMD` entirely**.

| Dockerfile | `docker run img` runs | `docker run img --verbose` runs |
| --- | --- | --- |
| `CMD ["python", "app.py"]` | `python app.py` | `--verbose` (as a command — fails) |
| `ENTRYPOINT ["python", "app.py"]` | `python app.py` | `python app.py --verbose` |
| `ENTRYPOINT ["python"]` + `CMD ["app.py"]` | `python app.py` | `python --verbose` |

So: `ENTRYPOINT` when your image *is* a program and arguments should go to it (think `docker run myapp --workers 4`). `CMD` alone when your image is an environment and you want `docker run myimage bash` to work for debugging. The combination when you want both a fixed program and overridable defaults.

**Now the part that actually breaks production: exec form versus shell form.**

```dockerfile
CMD python app.py                  # shell form → runs: /bin/sh -c "python app.py"
CMD ["python", "app.py"]           # exec form → runs python directly
```

In shell form, **`/bin/sh` becomes PID 1**, and your application is a child of it. Recall from Volume 1: PID 1 doesn't receive default signal actions, and `sh` does not forward signals to children. So `docker stop` sends `SIGTERM`, `sh` ignores it, your app never hears about it, Docker waits ten seconds, then `SIGKILL`s everything.

Prove it to yourself:

```bash
cat > Dockerfile.shellform <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
CMD python app.py
EOF

docker build -f Dockerfile.shellform -t myapp:shellform .
docker run -d --name shellform --rm -p 8001:8000 myapp:shellform
sleep 2
time docker stop shellform
```

**Expect:** roughly **10 seconds**, and no "received signal" message in the logs — Docker waited out its grace period and hard-killed.

```bash
docker run -d --name execform --rm -p 8001:8000 myapp:naive
sleep 2
time docker stop execform
docker logs execform 2>/dev/null
```

**Expect:** immediate, and the clean-shutdown line appears. (If the container is already gone, catch the log with `docker logs -f` in another terminal before stopping.)

**Always use exec form for `CMD` and `ENTRYPOINT`.** That ten-second delay, multiplied across every container in every deploy, is a surprisingly large share of the "why are our deploys so slow" mystery in real systems — and worse, it means no graceful connection draining.

### USER — stop running as root

By default the container process runs as root (and, per Volume 1, without user namespaces that is *host* root's UID). Fix it in the Dockerfile:

```dockerfile
RUN useradd --create-home --uid 10001 appuser
USER appuser
```

Order matters: everything after `USER` runs as that user, including `RUN` steps that may need to write. Put `USER` after your installs. Volume 7 goes deep on this; adopt the habit now.

### The improved Dockerfile

```dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependencies first — changes rarely
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code second — changes constantly
COPY app.py .

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8000"]
CMD ["--workers", "2", "app:app"]
```

```bash
docker build -t myapp:v2 .
docker run -d --name myapp2 --rm -p 8000:8000 myapp:v2
curl localhost:8000
docker exec myapp2 id
docker stop myapp2
```

`PYTHONUNBUFFERED=1` deserves a note: without it, Python buffers stdout when it isn't a terminal, so your logs appear in delayed chunks or vanish entirely when a container is killed. It is the single most common reason people think "my container produces no logs."

---

