---
id: images-layers-dockerfile
title: Volume 2 — Images, Layers, and the Dockerfile
order: 2
description: What an image actually is on disk, how the build cache really decides, multi-stage builds with a measured before/after, and why "latest" is a trap.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 2 — Images, Layers, and the Dockerfile

---

## The question this volume answers

You ended Volume 1 by mounting an OverlayFS by hand: some read-only lower directories, a writable upper directory, a merged view. Then you found Docker's own `LowerDir` chain in `docker inspect` and saw it was the same four arguments.

So here's the question that follows immediately. **If a running container is an overlay mount, then an image must be the recipe for the lowerdir chain — a list of directories plus instructions for how to stack them.** Is that all it is?

Very nearly, yes. And once you see it that way, the rest of this volume stops being syntax to memorize and becomes consequences you can derive. Why `latest` is dangerous, why moving one line in a Dockerfile turns a four-minute build into four seconds, why a 900 MB image can become 12 MB without removing a single feature, why deleting a secret doesn't delete it — all of these fall out of "an image is a stack of directories plus metadata."

Let's prove the claim first, then build on it.

---

## What an image actually is

### Take one apart

Do this before reading the explanation. It takes thirty seconds and it removes the mystery permanently.

```bash
docker pull alpine:3.20
mkdir -p ~/image-anatomy && cd ~/image-anatomy
docker save alpine:3.20 -o alpine.tar
mkdir extracted && tar -xf alpine.tar -C extracted
find extracted -maxdepth 2 | head -30
```

**Expect:** a `manifest.json`, a JSON file with a long hexadecimal name, an `index.json`, and a `blobs/sha256/` directory full of files named after hashes. No single "image" file. No disk image. No kernel. Nothing that resembles a VM.

```bash
cat extracted/manifest.json | python3 -m json.tool
```

You'll see three things: a **config** file reference, a list of **layers**, and the **repo tags**. Now read the config:

```bash
CONFIG=$(python3 -c "import json;print(json.load(open('extracted/manifest.json'))[0]['Config'])")
python3 -m json.tool extracted/$CONFIG | head -60
```

**Expect:** environment variables, the default command, the working directory, the architecture and OS, a `rootfs` section listing layer `diff_ids`, and a `history` array — one entry per Dockerfile instruction that built this image, including instructions that produced no layer at all.

And a layer is just a tarball of files:

```bash
LAYER=$(python3 -c "import json;print(json.load(open('extracted/manifest.json'))[0]['Layers'][0])")
tar -tf extracted/$LAYER | head -20
```

**Expect:** `bin/`, `etc/`, `usr/`, `lib/` — a plain directory tree.

### The three things in the box

| Component | What it is | Why it exists |
| --- | --- | --- |
| **Layers** | Tarballs of filesystem changes, each identified by the SHA-256 of its content | They become the `lowerdir` chain from Volume 1. Shared between images that have them in common |
| **Config** | JSON: default command, env, working dir, exposed ports, user, plus the ordered list of layer digests and the build history | The metadata a runtime needs to turn a filesystem into a running process |
| **Manifest** | JSON pointing at the config and the layers by digest | The index. What a registry actually serves you first |

So: **an image is an ordered list of tarballs plus a JSON file describing how to run the result.** That's the whole thing. `docker run` fetches the layers, unpacks them into directories, arranges them as `lowerdir=layerN:...:layer1`, adds an empty upper dir, and starts a process with the config's command.

Cleanup:

```bash
cd ~ && rm -rf ~/image-anatomy
```

### Content addressing: why everything is a hash

Notice that nothing is identified by name. Layers are identified by the SHA-256 of their content, and so is the image as a whole. This is **content addressing**, the same idea git uses for objects, and it buys three properties at once:

- **Deduplication is automatic.** Two images built from `debian:bookworm` reference a layer with the same digest. It exists on disk once. No coordination required; identical content produces an identical name.
- **Integrity is free.** If a byte changes anywhere in a layer, its digest changes, and the digest no longer matches the manifest that referenced it. You cannot silently tamper with a layer in transit or at rest.
- **Transfers become diffs.** `docker push` asks the registry which layer digests it already has and uploads only the rest. Change one line of your application and you push a few hundred kilobytes, not the 900 MB image.

That third point was Docker's actual product insight, as argued in Volume 0. Golden VM images had the right correctness model and no distribution story. Content-addressed layers gave environments a distribution story as cheap as pushing a git commit.

### Tags are not names, and digests are

Here is a distinction that causes real production incidents, so be precise about it.

- A **digest** (`sha256:a1b2c3...`) is an immutable, cryptographic name for exact content. `alpine@sha256:abc...` will be the same bytes in ten years or it will not resolve at all.
- A **tag** (`alpine:3.20`) is a mutable pointer to a digest. It is a label someone can move at any time, with no notification and no version bump.

Watch a tag be exactly that:

```bash
docker pull alpine:3.20
docker inspect --format='{{index .RepoDigests 0}}' alpine:3.20
```

**Expect:** something like `alpine@sha256:beefc3...`. That digest is what you actually received. The tag `3.20` merely pointed there today.

We'll return to this with the `latest` trap below, because the failure mode is specific and worth seeing coming.

---

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

## The build cache, mechanically

Now the payoff of putting `requirements.txt` before `app.py`.

### How Docker decides a layer is reusable

For each instruction, the builder computes a **cache key** and looks for an existing layer with that key. The key combines:

1. The **digest of the parent layer** — so a cache miss on any step invalidates every step after it. The cache is a chain, not a set.
2. For most instructions (`RUN`, `ENV`, `WORKDIR`, `CMD`...), the **literal instruction text**. Docker does not know what your `RUN` command does. `RUN apt-get update` matches on the string; its output could differ wildly between runs and the cache won't notice.
3. For `COPY` and `ADD`, the **checksum of the file contents** being copied, plus metadata. This is the exception — content, not just the instruction text.

From those three rules, everything else follows.

### Watch it happen

```bash
docker build -t myapp:v2 .          # everything CACHED
echo "# a harmless comment" >> app.py
docker build -t myapp:v2 .
```

**Expect:** the `COPY requirements.txt` and `pip install` steps report `CACHED`. Only the steps from `COPY app.py` onward re-run. The expensive pip install — the one that hits the network and takes tens of seconds — was skipped because nothing it depends on changed.

Now break it deliberately:

```bash
cat > Dockerfile.badorder <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
EOF

docker build -f Dockerfile.badorder -t myapp:badorder .
echo "# another comment" >> app.py
time docker build -f Dockerfile.badorder -t myapp:badorder .
```

**Expect:** `COPY . .` sees changed content, its cache key changes, and *because the cache is a chain*, `pip install` re-runs too — network round trip and all. A one-character comment change re-downloads your dependencies.

**So the famous rule — "copy your dependency manifest and install before copying source" — is not a convention. It's arithmetic.** You are ordering instructions by rate of change so that frequently-changing content sits downstream of expensive-and-rarely-changing work. Once you see the chain property, you can derive the right ordering for any stack without looking it up.

### Cache gotchas worth knowing now

- **`RUN apt-get update` on its own line is a trap.** The string never changes, so the cache hits forever, and you install packages against a package index that may be months stale. Always chain `update` and `install` in a single `RUN`.
- **`docker build --no-cache`** when you need a truly clean build.
- **The cache is local.** Your CI runner starts cold every time unless you configure cache import/export (`--cache-from`, BuildKit's registry cache). This is why CI builds are often dramatically slower than yours, and people mistakenly conclude "Docker is slow."
- **`docker history myapp:v2`** shows every layer, its size, and the instruction that created it. It is the first thing to run when an image is unexpectedly large — and, as noted above, it exposes `ARG` values.

```bash
docker history myapp:v2
```

---

## Multi-stage builds

### The problem

Compilers, headers, package managers, and build tools are needed to *produce* an artifact and completely useless to *run* it. In a single-stage build they're all baked in forever — bigger downloads, slower deploys, and a much larger attack surface (Volume 7: a compiler in your production image is a gift to anyone who gets a shell in it).

The demonstration is most dramatic with a compiled language, so let's use Go. You don't need Go installed — that's rather the point.

```bash
mkdir -p ~/multistage && cd ~/multistage
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "hello from a very small image")
	})
	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
EOF

cat > go.mod <<'EOF'
module hello

go 1.22
EOF
```

The naive single-stage build:

```dockerfile
FROM golang:1.22
WORKDIR /src
COPY . .
RUN go build -o /bin/hello .
EXPOSE 8080
CMD ["/bin/hello"]
```

```bash
cat > Dockerfile.single <<'EOF'
FROM golang:1.22
WORKDIR /src
COPY . .
RUN go build -o /bin/hello .
EXPOSE 8080
CMD ["/bin/hello"]
EOF

docker build -f Dockerfile.single -t hello:single .
```

Now the multi-stage version:

```bash
cat > Dockerfile.multi <<'EOF'
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/hello .

FROM scratch
COPY --from=builder /bin/hello /hello
EXPOSE 8080
ENTRYPOINT ["/hello"]
EOF

docker build -f Dockerfile.multi -t hello:multi .
```

Measure it yourself:

```bash
docker images hello --format "table {{.Tag}}\t{{.Size}}"
```

**Expect:** roughly **800–1000 MB** for `single` and **around 7–10 MB** for `multi` — the binary and nothing else. Two orders of magnitude. Verify it still works:

```bash
docker run -d --name hellomulti --rm -p 8080:8080 hello:multi
curl localhost:8080
docker stop hellomulti
```

**The mechanism:** each `FROM` starts a *new* image with a fresh layer chain. `COPY --from=builder` reaches into a previous stage's filesystem and takes only the named path. Everything else in the builder stage — the Go toolchain, the module cache, the source — is discarded, never committed to the final image, never pushed, never pulled.

`CGO_ENABLED=0` matters here: it produces a statically linked binary with no libc dependency, which is what lets `scratch` (an empty image) work at all. Without it the binary would need shared libraries that don't exist in an empty filesystem.

For most other languages the final stage is a runtime base rather than `scratch`:

```dockerfile
FROM node:20 AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY --from=build /src/node_modules ./node_modules
USER node
CMD ["node", "dist/server.js"]
```

Two more capabilities worth knowing:

- **`--target`** builds only up to a named stage: `docker build --target builder -t myapp:build .` — useful for a test stage in CI.
- You can `COPY --from=` an **external image**, not just a stage: `COPY --from=alpine:3.20 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/`. That line is how `scratch` images get working TLS.

Cleanup for this section:

```bash
docker rmi hello:single hello:multi
cd ~ && rm -rf ~/multistage
```

---

## Tags, digests, and the `latest` trap

### What `latest` actually is

`latest` is **not** "the newest version." It is a tag with no special properties whatsoever, which Docker uses as a default when you don't specify one. `docker pull nginx` means `docker pull nginx:latest`. If a maintainer never pushes a tag called `latest`, there isn't one — and if they push a three-year-old build under that name, `latest` is three years old.

### The failure mode, concretely

Here's the story in its generic form, and you will meet it eventually.

A team's Dockerfile says `FROM python:latest`. Their CI builds on every merge. Everything is fine for eight months. Then Python 3.13 is released, the `latest` tag moves, and the next CI build — triggered by a one-line README change, with zero application changes — produces an image on a new Python minor version. A C extension they depend on has no 3.13 wheel yet, so it builds from source, or fails. Or worse, it succeeds, and a subtle behaviour change ships to production.

Now the diagnostic nightmare: **`git diff` shows nothing relevant.** The inputs to the build are not fully captured in version control. The build is not reproducible, and nobody can explain why "the same code" behaves differently.

The same thing happens at deploy time. `docker pull myapp:latest` on three hosts at slightly different moments gives you three hosts running different builds, and `docker images` shows the same tag on all of them. You can chase that for hours.

### Doing it properly

```dockerfile
# Bad — a moving target
FROM python:latest

# Better — pinned to a minor version, still gets patch updates
FROM python:3.12-slim

# Best for reproducibility — pinned to exact content
FROM python@sha256:0f0f0d15cda3b4b9e0b12f5c53f4e1e38e1ee7e44b8b1c4d0d0a4dd9a0e5f2c1
```

> That digest is illustrative, not a real one. Get the real digest for any image you've pulled with `docker inspect --format='{{index .RepoDigests 0}}' python:3.12-slim`.

The trade is honest and worth stating both ways: digest pinning gives perfect reproducibility and means **you stop receiving security patches** until someone updates the digest. That's why tools like Renovate and Dependabot exist — pin to digests, and automate the bumps so they arrive as reviewable pull requests rather than silent surprises.

For your *own* images, tag with something that identifies the build immutably:

```bash
docker build -t myapp:v2 -t myapp:$(git rev-parse --short HEAD) .
```

Tag with the commit SHA. Now every running container can be traced to exact source, and `latest` becomes a convenience pointer rather than a load-bearing identifier.

---

## The incident: 17 images, 5 million pulls

Volume 1's incident was a runtime bug. This one is about trust, and it's the reason `FROM` deserves as much scrutiny as any dependency in your lockfile.

**What happened.** Beginning in mid-2017, an account on Docker Hub using the pseudonym **`docker123321`** uploaded container images advertised as tools for popular software — images named after Tomcat, MySQL, and Cron. They were also backdoored: they installed **XMRig-based Monero miners** and, in a number of cases, embedded reverse shells giving the attacker persistent access to the victim's server.

The numbers, as reported by Kromtech in June 2018: **17 malicious images**, collectively **pulled about 5 million times**, and roughly **544.74 Monero mined — around $90,000** at the exchange rate then.

**The part that should bother you is the timeline.** The account was created in May 2017 and the first malicious images appeared around July–August 2017. Users reported them on GitHub and Twitter as early as September 2017. Sysdig published on related cryptojacking in January 2018, Fortinet published in May 2018, and Docker Hub deleted the account on **10 May 2018** — roughly a week after the Fortinet report, and about eight months after the first public complaints.

> **Confidence: high** on the figures and the broad timeline — corroborated across Kromtech's report as relayed by CyberScoop, TechCrunch, The Register, and INCIBE-CERT. **Medium** on exact dates for individual complaints, which vary slightly between retellings.

**Why it was so effective.** Kromtech's own framing is the sharpest summary of the structural problem: pulling an image from Docker Hub is, for most users, equivalent to downloading an arbitrary binary from the internet, running it, and hoping. There is no build transparency by default. You cannot see the Dockerfile. You cannot see what `RUN` steps executed. The layers are opaque tarballs, and the thing you're looking at in the web UI is a description the uploader wrote.

Worse, and specific to containers: **removing the image does not remove the compromise.** The images established reverse shells and persistence on the host. Kromtech's guidance for affected users was to wipe the systems. And note the amplification mechanism — the attacks were largely automated, scanning for misconfigured Docker and Kubernetes installations with exposed APIs, which is the Volume 7 topic.

**It was not a one-off.** In 2021, Palo Alto Unit 42 researcher **Aviv Sasson** reported finding **30 malicious images across 10 accounts** on Docker Hub, with a combined **~20 million pulls** and an estimated **~$200,000** mined — mostly Monero via XMRig, with small amounts of Grin and Aronium. Sasson's stated conclusion was that many more probably remain undiscovered. **Confidence: medium-high** — widely reported from the Unit 42 research; I'd verify current figures against the original write-up before quoting them anywhere that matters.

**What to actually do about it:**

- Prefer **Docker Official Images** and **Verified Publisher** images. Not a guarantee, but a real difference in review.
- **Read `docker history`** on anything unfamiliar, and prefer images that publish their Dockerfile and build provenance.
- **Pin by digest** in production, so an image can't be swapped under a tag you trust.
- **Scan images** — `docker scout cves`, Trivy, Grype. Volume 7 covers this properly.
- Mirror critical base images into a registry you control, so a deleted or altered upstream tag can't break or compromise your builds.

The general lesson, and it's the same one the software industry keeps relearning: **`FROM someimage` is a dependency with root-equivalent privileges over your build, and it deserves the scrutiny you'd give a dependency in your lockfile.** Most teams review the latter carefully and the former not at all.

---

## TRY THIS ON YOUR MACHINE

> All exercises use `~/docker-app` from earlier in this volume unless stated. Disk and cleanup flagged per item.

### 2.1 — Watch layer sharing pay for itself

```bash
docker pull python:3.12-slim
docker system df
docker build -t myapp:v2 ~/docker-app
docker system df
```

**Expect:** the python base is ~130 MB. After building your app on top, total disk used goes up by only a few tens of MB, not another 130.

Now build a second, unrelated app on the same base and compare:

```bash
mkdir -p /tmp/app2 && printf 'FROM python:3.12-slim\nRUN pip install --no-cache-dir requests\n' > /tmp/app2/Dockerfile
docker build -t app2:v1 /tmp/app2
docker images | grep -E "python|myapp|app2"
docker system df
```

**Expect:** `docker images` claims both apps are ~130+ MB each. `docker system df` shows total usage far below the sum. The base layer exists **once**.

**Why it's interesting:** the "size" column is the size of the full stack, not the incremental cost. Teams regularly panic about image sizes that don't actually consume the disk they appear to. **Cleanup:** `docker rmi app2:v1; rm -rf /tmp/app2`

### 2.2 — Find the secret that `RUN rm` didn't delete, and then fix it

Volume 1 showed the whiteout mechanism. Now do it properly.

```bash
mkdir -p ~/secret-demo && cd ~/secret-demo
cat > Dockerfile.leaky <<'EOF'
FROM alpine:3.20
RUN echo "AWS_SECRET=hunter2hunter2" > /creds && \
    cat /creds > /dev/null
RUN rm /creds
EOF
docker build -f Dockerfile.leaky -t leaky .
docker save leaky -o leaky.tar && mkdir -p x && tar -xf leaky.tar -C x
grep -r "hunter2" x/ 2>/dev/null | head -3
```

**Expect:** the string is found in a layer blob despite being "removed."

Now the fix — never let it be committed in the first place:

```bash
cat > Dockerfile.clean <<'EOF'
FROM alpine:3.20
RUN echo "AWS_SECRET=hunter2hunter2" > /creds && \
    cat /creds > /dev/null && \
    rm /creds
EOF
docker build -f Dockerfile.clean -t notleaky .
docker save notleaky -o notleaky.tar && mkdir -p y && tar -xf notleaky.tar -C y
grep -r "hunter2" y/ 2>/dev/null | head -3
```

**Expect:** nothing found. Same commands, different instruction boundaries.

**Why it's interesting:** the *only* difference is where the layer boundary falls. A layer is committed at the end of each `RUN`; anything that exists when the instruction ends is permanent, and anything created and destroyed *within* one instruction never existed as far as the image is concerned. This single mental model prevents most accidental image bloat and a good share of credential leaks.

**Disk:** ~30 MB. **Cleanup:** `cd ~ && rm -rf ~/secret-demo && docker rmi leaky notleaky`

### 2.3 — Race the cache

```bash
cd ~/docker-app
docker build --no-cache -t myapp:cold . 2>&1 | tail -1
time docker build --no-cache -q -t myapp:cold .
touch app.py
time docker build -q -t myapp:v2 .
time docker build -f Dockerfile.badorder -q -t myapp:badorder .
```

**Expect:** the cold build takes tens of seconds. The well-ordered rebuild after touching `app.py` takes a second or two. The badly-ordered one re-runs `pip install`.

**Why it's interesting:** you're measuring the cost of one line's position in a file. On a real project with a hundred dependencies, this is the difference between a fifteen-second inner loop and a three-minute one — and the person who structured the Dockerfile determines which one the whole team lives with.

### 2.4 — Read the whole build history of an image you didn't build

```bash
docker pull nginx:1.27
docker history nginx:1.27 --no-trunc --format "table {{.Size}}\t{{.CreatedBy}}" | head -20
docker inspect nginx:1.27 --format '{{json .Config}}' | python3 -m json.tool
```

**Expect:** the full sequence of instructions that built the official nginx image — its `ENTRYPOINT`, the `STOPSIGNAL`, the exposed ports, the env vars, and which layers cost what.

**Why it's interesting:** this is free reconnaissance on any image you're considering trusting, and it's also the best available teaching material. The official images are written by people who've thought hard about these mechanics; reading `nginx`, `postgres`, and `redis` histories teaches more about Dockerfile craft than most tutorials. Note nginx's `STOPSIGNAL SIGQUIT` — an instruction we haven't covered, chosen because that's nginx's graceful-shutdown signal rather than `SIGTERM`. **Disk:** ~70 MB. **Cleanup:** `docker rmi nginx:1.27`

### 2.5 — Prove that a tag is not a name

```bash
docker pull alpine:3.20
docker tag alpine:3.20 mybase:production
docker images | grep -E "alpine|mybase"
docker inspect --format='{{.Id}}' alpine:3.20
docker inspect --format='{{.Id}}' mybase:production
```

**Expect:** identical image IDs. Two names, one image, zero extra disk.

Now move the tag to something completely different:

```bash
docker pull busybox:1.36
docker tag busybox:1.36 mybase:production
docker run --rm mybase:production cat /etc/os-release 2>/dev/null || echo "not alpine anymore"
```

**Expect:** `mybase:production` now points at BusyBox. Nothing warned you. Nothing versioned. Any script that says `FROM mybase:production` or `docker run mybase:production` just silently changed what it runs.

**Why it's interesting:** you have just performed, locally and in five seconds, exactly the operation that makes `latest` dangerous in production — and exactly the operation an attacker performs with a compromised registry credential. A tag is a mutable pointer. Digests are the only names that can't move. **Cleanup:** `docker rmi mybase:production busybox:1.36 alpine:3.20`

### Cleaning up this volume

```bash
docker rmi myapp:naive myapp:v2 myapp:cold myapp:badorder myapp:shellform 2>/dev/null
docker system df
docker builder prune        # reclaims build cache — will prompt
```

Keep `~/docker-app`; Volume 3 uses it.

---

## Where this leaves you, and what's next

You can now open an image and name every part: layers as content-addressed tarballs, a config with the run-time metadata, a manifest tying them together. You know why the cache is a chain and can order any Dockerfile correctly from first principles rather than from a rule you memorized. You've watched a 900 MB image become 8 MB without losing a feature, seen a secret survive its own deletion and then fixed it by moving a line, and moved a tag out from under a running workflow to feel exactly how weak a tag's guarantee is.

**Volume 3: Running, Managing, and Debugging Containers.**

Images are static; next we make them move. The full lifecycle — create, start, stop, pause, kill, remove — with what happens to the underlying process at each transition (including why `docker pause` uses the cgroup freezer rather than a signal). Then `docker run` flag literacy taught by problem rather than by list, each flag introduced through the situation that demands it. Then real debugging: `logs`, `exec`, `inspect`, and entering a container's namespaces directly with the `nsenter` skills you already have. Then we make Volume 1's cgroup theory visible by watching containers get OOM-killed and throttled on purpose. Practical networking — bridges, published ports, name-based container-to-container communication — with the internals saved for Volume 5. And we close on a documented outage caused by a misunderstood restart policy interacting with missing resource limits.

Say "continue" when you're ready.
