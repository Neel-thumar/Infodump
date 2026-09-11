---
id: security-hardening
title: Volume 7 — Security and Production Hardening
order: 7
description: An honest container threat model, each defence introduced by the attack it stops, secrets done properly, and the worms that hunt exposed Docker daemons.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 7 — Security and Production Hardening

---

## The question this volume answers

Six volumes in, you have built a real application. It has a plaintext password in a committed YAML file, a database running as root, a writable root filesystem, every default Linux capability granted, and base images nobody has looked at.

That is not unusual. It's roughly the median state of containerized software.

But before we fix any of it, there's a prior question that most security guidance skips, and skipping it is why so much container security advice is either paranoid theatre or dangerous overconfidence:

**What does a container actually protect against, and what does it not?**

You have the background to answer this properly now. You know a container is a process with restricted views (Volume 1), sharing the host kernel, with a budget, on an overlay mount. Everything below follows from that, including the limits.

---

## The honest threat model

### The one-sentence version

**A container is a strong boundary against accident and a moderate boundary against attack. It is not a VM, and pretending otherwise is how people get hurt.**

### What containers genuinely protect against

| Threat | Protected? | Mechanism |
| --- | --- | --- |
| App A reads App B's files | **Yes** | Mount namespace — different filesystem views |
| App A kills App B's processes | **Yes** | PID namespace — B isn't in A's number space |
| App A eats all RAM and takes down the host | **Yes** | cgroups — a hard budget |
| App A binds a port App B needs | **Yes** | Network namespace — separate port spaces |
| Dependency hell between apps | **Yes** | Separate root filesystems |
| App A sniffs App B's traffic | **Mostly** | Separate network namespaces; a shared bridge weakens this |

That's a real list, and it's why containers were worth adopting. Most production incidents are accidents, and containers prevent a large class of them structurally.

### What containers do NOT protect against

| Threat | Protected? | Why not |
| --- | --- | --- |
| **Kernel exploit** | **No** | One kernel, shared. A `CAP_SYS_ADMIN`-reachable kernel bug is reachable from every container |
| **Root in container = root on host** | **No, by default** | No user namespace by default (Volume 1). UID 0 inside is UID 0 to the kernel |
| **Docker socket access** | **Absolutely not** | Equivalent to root. Demonstrated below |
| **`--privileged` containers** | **No** | Deliberately disables nearly every boundary |
| **Malicious image content** | **No** | You ran it. That was the decision (Volume 2's `docker123321`) |
| **Application-level flaws** | **No** | SQL injection is SQL injection regardless of packaging |
| **Secrets in env vars or layers** | **No** | Visible to anyone with the image or `docker inspect` |
| **Side-channel attacks** | **Weakly** | Shared CPU caches, shared kernel structures |

The comparison from Volume 1, restated now that it matters: **a VM's guest-to-host interface is a narrow hypervisor boundary. A container's is the entire Linux syscall surface** — hundreds of calls plus `ioctl`s, `/proc`, `/sys`, and filesystem semantics, implemented in millions of lines of privileged C. More interface means more bugs. That is the whole argument, and it is correct.

### Prove the socket claim right now

Do this once. It changes how you think about `docker run`.

```bash
docker run --rm -v /:/host:ro alpine cat /host/etc/shadow | head -3
```

**Expect:** the contents of your host's shadow file, from inside a container, with a one-line command.

Nothing was exploited. No vulnerability was used. **The ability to run `docker run` is the ability to mount any part of the host filesystem into a container you control.** Which means:

- Membership in the `docker` group is **root-equivalent**. Not "close to root." Equivalent. Docker documents this.
- A container with `-v /var/run/docker.sock:/var/run/docker.sock` can start any other container, including one that mounts `/`. Every "let the container manage containers" pattern — CI runners, watchtower-style updaters, monitoring agents — carries this.
- If an attacker gets code execution in a container that has the socket mounted, they have the host. There is no second step.

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock docker:cli version 2>/dev/null | head -6
```

**Expect:** a container successfully talking to your daemon.

If you take one rule from this volume: **never mount the Docker socket into a container unless you have accepted that the container is now root on the host.** Where you must, look at socket proxies that filter the API to a read-only subset.

---

## Defences, each by the attack it stops

Every hardening flag below is introduced by a specific thing it prevents. Skip the ones that don't apply to your threat model — but know what you're skipping.

### Attack: a web shell writes a backdoor into the app directory

**Defence: `--read-only` plus tmpfs for what must be writable.**

```bash
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid --tmpfs /run alpine sh -c '
  touch /tmp/scratch && echo "tmp: writable"
  touch /usr/bin/backdoor 2>&1 || echo "root fs: immutable"
  cp /bin/busybox /tmp/x && chmod +x /tmp/x && /tmp/x true 2>&1 || echo "tmp: noexec enforced"
'
```

**Expect:** `/tmp` writable, root filesystem refused, and execution from `/tmp` blocked by `noexec`.

That combination defeats a large fraction of real post-exploitation tooling, which assumes it can drop a file somewhere and run it. Cheap, and it forces you to know what your app actually writes — which is useful information anyway.

### Attack: an RCE in a root-running service becomes host root

**Defence: run as a non-root user.**

```bash
docker run --rm alpine id
docker run --rm -u 10001:10001 alpine id
```

Better in the image (Volume 2), so it's not something an operator must remember:

```dockerfile
RUN useradd --create-home --uid 10001 appuser
USER appuser
```

Then enforce it at runtime as well — defence in depth costs nothing here:

```yaml
    user: "10001:10001"
```

### Attack: a compromised process uses a privilege it never needed

**Defence: drop capabilities.**

Linux split root into ~40 **capabilities**. Docker grants a subset by default and drops the rest. Check what you get:

```bash
docker run --rm alpine sh -c 'apk add -q libcap; capsh --print 2>/dev/null | head -3'
```

Most applications need **none** of them:

```bash
docker run --rm --cap-drop ALL nginx:1.27 nginx -t 2>&1 | tail -2
docker run --rm --cap-drop ALL --cap-add NET_BIND_SERVICE nginx:1.27 nginx -t 2>&1 | tail -2
```

The ones worth knowing by name:

| Capability | Grants | Notes |
| --- | --- | --- |
| `CAP_SYS_ADMIN` | Mount, namespace ops, and a grab-bag of others | **The dangerous one.** Frequently called "the new root" — many escapes require it |
| `CAP_NET_RAW` | Raw sockets | Granted by default. Enables ARP/DNS spoofing against neighbours on the bridge |
| `CAP_NET_BIND_SERVICE` | Bind ports below 1024 | The legitimate reason people run web servers as root |
| `CAP_SETUID`/`CAP_SETGID` | Change UID/GID | Needed by servers that drop privileges themselves |
| `CAP_DAC_OVERRIDE` | Bypass file permission checks | Granted by default; rarely needed |

**The pattern: `--cap-drop ALL`, then add back only what breaks.** `CAP_NET_RAW` being on by default is worth a moment's thought — it means a compromised container can, by default, spoof traffic to its neighbours on the same Docker network.

### Attack: a SUID binary inside the container escalates privileges

**Defence: `--security-opt no-new-privileges`.**

```bash
docker run --rm --security-opt no-new-privileges -u 10001 alpine sh -c '
  ls -l /bin/busybox
  echo "no_new_privs prevents any SUID/setcap escalation from here"'
```

This sets the kernel's `no_new_privs` bit, which makes it impossible for the process or any child to gain privileges via `execve` — SUID bits and file capabilities simply stop working. It is a one-flag mitigation for an entire escalation class, and it breaks almost nothing. Turn it on everywhere.

### Attack: exploiting an obscure syscall to reach a kernel bug

**Defence: seccomp.**

Seccomp filters which syscalls a process may make. **Docker applies a default seccomp profile to every container**, blocking a set of syscalls (commonly cited as roughly 40–50) that no normal application needs but that have historically been useful for escapes.

```bash
docker info --format '{{json .SecurityOptions}}'
```

**Expect:** entries for `seccomp` (with the default profile), `apparmor` on Debian, and possibly `cgroupns`.

See it enforce something:

```bash
docker run --rm alpine sh -c 'mount -t tmpfs none /mnt 2>&1' || echo "blocked by default policy"
docker run --rm --cap-add SYS_ADMIN alpine sh -c 'mount -t tmpfs none /mnt && echo "mount succeeded with SYS_ADMIN"'
```

And observe what running *without* it looks like — note this is the wrong direction, shown so you recognize it in someone else's Compose file:

```bash
docker run --rm --security-opt seccomp=unconfined alpine sh -c 'echo "running with NO syscall filtering"'
```

Custom profiles are possible (`--security-opt seccomp=./profile.json`) and are how you'd lock a known workload down to the syscalls it actually uses. Tooling exists to record a profile from a running container. Worth it for high-value services; overkill for most.

> **Confidence: high** that Docker applies a default seccomp profile and that it blocks a meaningful set of syscalls. **Medium** on the exact count, which has changed across versions — check the current profile in Docker's docs rather than quoting a number.

### Attack: a container reads or writes host paths through `/proc` and `/sys`

**Defence: AppArmor (Debian/Ubuntu) or SELinux (RHEL family).**

Docker applies a `docker-default` AppArmor profile automatically on Debian. It restricts writes to `/proc` and `/sys` paths and blocks mount operations, independently of capabilities.

```bash
docker run -d --name aa --rm alpine sleep 60
PID=$(docker inspect -f '{{.State.Pid}}' aa)
sudo cat /proc/$PID/attr/current 2>/dev/null
docker stop aa
```

**Expect:** `docker-default (enforce)` or similar. Note the callback to Volume 1: **the default AppArmor profile did *not* block CVE-2019-5736**, while correctly-configured SELinux did. Neither is a complete answer; both are layers.

### Attack: everything at once — `--privileged`

**Defence: never use it, and know what it actually does.**

`--privileged` is not "a bit more access." It grants **all capabilities**, disables seccomp and AppArmor, and gives the container access to all host devices with `/sys` writable. It is approximately "run this as root on the host, with a different filesystem."

```bash
docker run --rm --privileged alpine sh -c 'ls /dev | head -20; echo "---"; cat /proc/self/status | grep CapEff'
docker run --rm alpine sh -c 'ls /dev; echo "---"; cat /proc/self/status | grep CapEff'
```

**Expect:** the privileged container sees your host's disks (`sda`, `nvme0n1`) and has a full capability mask; the normal one sees a handful of pseudo-devices and a restricted mask.

A privileged container can mount your host's root filesystem. It can load kernel modules. The well-documented **cgroup `release_agent` escape** (assigned **CVE-2022-0492**, affecting cgroups v1) worked by writing a host-path helper into a cgroup file — reachable when a container had `CAP_SYS_ADMIN` or ran privileged. **Confidence: medium-high** on the CVE identifier and the mechanism class; verify the current details before citing specifics.

If you need one device, pass one device: `--device /dev/ttyUSB0`. If you need one capability, add one capability. `--privileged` in a Compose file should be treated as a review blocker.

---

## Images: reducing what's there to attack

### Scan what you run

```bash
cd ~/compose-app
docker compose build > /dev/null 2>&1
docker scout quickview compose-app-api 2>/dev/null || echo "docker scout not available — see alternatives below"
docker scout cves compose-app-api 2>/dev/null | head -30
```

If `docker scout` isn't present, **Trivy** is the standard open alternative and runs as a container:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL python:3.12-slim | head -30
```

> Note the irony, and take it seriously: that command mounts the Docker socket, which you just learned is root-equivalent. It's a reasonable trade on your own laptop and a considered decision on a build server. Trivy can also scan a tarball from `docker save` with no socket access.

Compare base images to see what you're buying:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image \
  --severity HIGH,CRITICAL --quiet debian:bookworm 2>/dev/null | tail -5
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image \
  --severity HIGH,CRITICAL --quiet alpine:3.20 2>/dev/null | tail -5
```

**Expect:** meaningfully different counts. The mechanism is simple — fewer packages means fewer CVEs, because most findings are in OS packages you never call.

### Minimal and distroless

Volume 2's table, now with the security argument attached:

| Base | Shell? | Package manager? | Attack surface |
| --- | --- | --- | --- |
| `debian:bookworm` | yes | yes | Full OS: curl, wget, apt, compilers available to an attacker |
| `*-slim` | yes | yes | Reduced, still a usable environment |
| `alpine` | yes (busybox) | yes (apk) | Small, still scriptable |
| `distroless` | **no** | **no** | Runtime + libs only. An attacker with RCE has no shell to spawn |
| `scratch` | no | no | Only your static binary |

The distroless argument is specific: most post-exploitation tooling assumes `/bin/sh`, `curl` to fetch stage two, and a package manager to install what's missing. Remove all three and a working RCE becomes substantially harder to turn into persistence. The cost is debugging, which you already solved in Volume 3 — attach a `netshoot` sidecar sharing the target's namespaces.

```bash
docker pull gcr.io/distroless/python3-debian12 2>/dev/null && \
  docker run --rm gcr.io/distroless/python3-debian12 -c "print('runs')" && \
  docker run --rm --entrypoint sh gcr.io/distroless/python3-debian12 -c "echo hi" 2>&1 | tail -1
```

**Expect:** Python works; there is no shell to run.

---

## Secrets, properly

### Why the usual approaches fail

**Baked into the image** — you proved this in Volume 2's exercise 2.2. The layer keeps it forever, whiteouts don't delete it, and anyone who pulls the image can `grep` it out.

**Build args** — recorded in image metadata:

```bash
mkdir -p /tmp/secret-demo && cd /tmp/secret-demo
printf 'FROM alpine\nARG API_KEY\nRUN echo "building with key" > /dev/null\n' > Dockerfile
docker build --build-arg API_KEY=supersecret123 -t argleak . > /dev/null
docker history --no-trunc argleak | grep -o "API_KEY=[a-z0-9]*" | head -2
```

**Expect:** the secret, printed out of the image history.

**Environment variables** — the most common approach and still weak:

```bash
docker run -d --name envleak --rm -e DB_PASSWORD=hunter2 alpine sleep 60
docker inspect envleak --format '{{json .Config.Env}}'
PID=$(docker inspect -f '{{.State.Pid}}' envleak)
sudo tr '\0' '\n' < /proc/$PID/environ | grep DB_
docker stop envleak
```

**Expect:** the password from `docker inspect`, and again from the host's `/proc`. It also leaks into child processes, crash dumps, error-reporting tools that helpfully attach the environment, and `docker compose config` output.

That said — honesty matters more than purity here — **environment variables are the de facto standard** and are acceptable when the values are injected at runtime by a secret manager rather than written in a file you commit. The unacceptable part is `POSTGRES_PASSWORD: localdev` sitting in git.

### What actually works

**Build-time: BuildKit secret mounts.** The secret is mounted into a single `RUN` and never becomes part of any layer:

```bash
cd /tmp/secret-demo
echo "supersecret123" > mysecret.txt
cat > Dockerfile.secret <<'EOF'
FROM alpine
RUN --mount=type=secret,id=apikey \
    cat /run/secrets/apikey > /dev/null && echo "used the secret at build time"
EOF
DOCKER_BUILDKIT=1 docker build -f Dockerfile.secret --secret id=apikey,src=mysecret.txt -t noleak . 2>&1 | tail -3
docker save noleak -o noleak.tar && mkdir -p x && tar -xf noleak.tar -C x
grep -r "supersecret123" x/ 2>/dev/null | head -2 || echo "secret NOT present in image — correct"
```

**Expect:** the build used the secret, and it is nowhere in the image.

**Run-time: file-based secrets.** Compose supports a `secrets` block that mounts files into `/run/secrets/` rather than setting environment variables:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

Many official images support a `*_FILE` convention exactly for this — postgres, mysql, and others read the file rather than the variable. This keeps the value out of `docker inspect` and out of `/proc/PID/environ`.

**Run-time: tmpfs.** Volume 4's point — a decrypted credential written to tmpfs never touches a disk and can't end up in a backup or a forensic image.

**Beyond a single host:** HashiCorp Vault, AWS Secrets Manager, and equivalents, where the application fetches short-lived credentials at startup. The real prize there isn't secrecy but **rotation** — a credential that expires in an hour is worth more than one that's merely well-hidden.

```bash
cd ~ && rm -rf /tmp/secret-demo && docker rmi argleak noleak 2>/dev/null
```

---

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

## The incident: the worms that hunt exposed daemons

This is the best-documented category of real-world container attack, and you now have exactly the background to understand it end to end.

### Graboid, October 2019

Unit 42 researchers at Palo Alto Networks identified a cryptojacking worm they named **Graboid** — after the sandworms in the 1990 film *Tremors*, because it moves in short bursts and is, in their own assessment, relatively inept. It spread to **more than 2,000 unsecured Docker hosts**. Unit 42 described it as the first cryptojacking worm seen spreading via containers in the Docker Engine (Community Edition).

**The entry point was not a vulnerability.** A Shodan search at the time showed more than 2,000 Docker engines exposed to the internet with no authentication or authorization, allowing full control of the engine and the host. Unit 42's Jen Miller-Osborn put it plainly: the problem was a lack of updating any of the initial security settings — the entry point existed because none of the defaults were changed.

**How it worked**, and every step should now be transparent to you:

1. Scan for Docker API endpoints reachable without authentication (the daemon's TCP port, conventionally 2375 unencrypted).
2. Use that unauthenticated API to pull and run a malicious image from Docker Hub. The images involved were named to blend in — `pocosow/centos` and `gakeaws/nginx` — and had been downloaded more than 10,000 and 6,500 times respectively.
3. The container downloads scripts and a list of vulnerable hosts from command-and-control servers.
4. Each iteration randomly picks three targets: install the worm on one, stop the miner on another, start the miner on a third. That deliberately odd behaviour is why infection looks intermittent — Unit 42 measured each miner as active about 63% of the time, in periods of around 250 seconds.
5. Monero mining, with the capacity to fetch new scripts — meaning it could be repurposed to ransomware or anything else at the operator's discretion.

Unit 42 simulated the spread and estimated that, assuming 70% host availability, it would take **under 60 minutes to infect 1,400 vulnerable hosts**. Over half the vulnerable hosts were in China, about 14% in the US. The Docker team worked with Unit 42 to remove the malicious images.

> **Confidence: high.** Sourced from Unit 42's own published research and corroborated across Threatpost, Dark Reading, Help Net Security and others.

### It escalated: TeamTNT and Cetus

Graboid was the opening act. Unit 42 later set up a **Docker daemon honeypot** and found **Cetus**, a more capable cryptojacking worm, created by **TeamTNT** — a group known for attacking AWS and Docker daemons. The trajectory across this family of campaigns is the important part: from "mine some Monero" to **stealing cloud credentials** found on compromised hosts, which converts a single exposed daemon into access to an entire cloud account.

> **Confidence: high** on Unit 42's Cetus research and its attribution to TeamTNT; **medium** on the broader campaign details, which are reported across many vendor writeups of varying rigour.

### Why it keeps working

Four reasons, each of which you can now explain from mechanism:

1. **The Docker API is root.** You proved it at the top of this volume. An unauthenticated daemon is an unauthenticated root shell — it isn't an escalation path, it's the destination.
2. **The daemon is exposed by accident.** Nobody decides to publish port 2375. It happens when someone follows a tutorial for remote Docker access, configures `-H tcp://0.0.0.0:2375` for a CI integration, or runs a cloud VM whose firewall doesn't cover what Docker does to iptables — which is exactly Volume 5's incident.
3. **Container activity is invisible to traditional tooling.** Unit 42 made this point directly: most endpoint protection doesn't inspect data and activity inside containers. A miner running in a container can be entirely invisible to host-level security software.
4. **It's fully automated.** Scanning the entire IPv4 space for a given port takes hours. There is no "too small to be a target."

### The defences, in order

**1. Never expose the Docker API over TCP.** The default on Debian is a Unix socket at `/var/run/docker.sock` with root ownership, which is right. Check yours:

```bash
sudo ss -tlnp | grep -E "2375|2376" || echo "daemon not listening on TCP — correct"
ps aux | grep "[d]ockerd" | head -1
sudo cat /etc/docker/daemon.json 2>/dev/null || echo "(no daemon.json — defaults in use)"
```

**Expect:** nothing on 2375/2376, and no `-H tcp://` in the dockerd command line.

**2. For genuine remote access, use SSH.** `DOCKER_HOST=ssh://user@host docker ps` gives you remote Docker over an authenticated, encrypted channel with no new listening port. This is the correct answer and it's easy:

```bash
# from your laptop, against a server you control
# DOCKER_HOST=ssh://you@server.example.com docker ps
```

If you truly need TCP, it's mTLS (port 2376 with `--tlsverify`, client certificates required) — never plain 2375.

**3. Treat `docker` group membership as root.** Audit it:

```bash
getent group docker
```

Everyone on that list has root on the machine. On a shared server, that's an access-control decision, not a convenience.

**4. Monitor what your containers do.** A miner is loud in exactly one way: sustained 100% CPU. `docker stats`, cgroup CPU accounting, and alerts on unexpected outbound connections catch this category cheaply.

**5. Scan and pin your images.** The malicious images were on Docker Hub with plausible names — Volume 2's lesson, arriving here as the second stage of the attack.

**6. Run rootless where you can.** Volume 8 covers it; it removes the "daemon runs as root" premise entirely.

### The lesson

Every incident in this guide has had the same shape.

**CVE-2019-5736**: namespaces worked, a file descriptor crossed the boundary.
**docker123321**: the registry worked, trust was the gap.
**UFW bypass**: both subsystems worked, the seam didn't.
**Graboid**: no vulnerability at all — a default nobody changed.

**Security failures cluster at the boundaries between correctly-functioning components, and at defaults nobody revisited.** Docker's defaults optimize for "it works in thirty seconds," which is exactly the right choice for adoption and exactly the wrong configuration for production. Nothing in this volume defends against a novel kernel exploit. What it does is remove the easy paths — and the overwhelming majority of real attacks take easy paths, because they're automated and there is always an easier target.

---

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

## Where this leaves you, and what's next

You can state honestly what a container protects against and what it doesn't, without overselling either way. You demonstrated in one command that Docker API access is root access. You introduced each hardening control by the attack it stops, watched capabilities and `noexec` and `no_new_privs` block specific actions, recovered three kinds of secret from an image you built, and hardened a real application with a table of justifications rather than a list of settings copied from a blog post.

And you understand why the most successful container attacks in the wild exploited no vulnerability at all.

One thread has been quietly running under all seven volumes. You keep encountering names that aren't Docker. `runc` in Volume 1's CVE. `containerd.io` installed alongside the daemon in Volume 0. The **OCI** image format in Volume 2. Rootless alternatives, mentioned three times now and deferred each time.

**Volume 8: The Ecosystem and What Comes After Docker.**

What the Open Container Initiative is and what standardizing image, runtime, and distribution formats actually solved — the decoupling of "Docker the company" from "containers the standard." What Docker really delegates to containerd and runc, why that layered architecture exists, and the history of those donations to the CNCF. Podman and daemonless, rootless alternatives: the specific architectural problem they address, argued honestly rather than as advocacy. Kubernetes, scoped precisely — what orchestration solves that Compose cannot, framed as the next thing to learn rather than taught here. And we close on a genuinely underappreciated story: how Docker Inc. invented the defining infrastructure technology of its decade and still had to sell its enterprise business to Mirantis in 2019 — a case study in the gap between inventing a technology and capturing value from it, and one that is very often misremembered, so I'll be careful with the details.

Say "continue" when you're ready.
