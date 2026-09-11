## The runtime stack: what Docker actually delegates

### The layers

```text
  docker CLI              ← what you type (docker-ce-cli)
      │  REST over /var/run/docker.sock
      ▼
  dockerd                 ← the daemon: builds, networks, volumes, API (docker-ce)
      │  gRPC
      ▼
  containerd              ← image pull/store, container lifecycle, snapshots (containerd.io)
      │  spawns one shim per container
      ▼
  containerd-shim-runc-v2 ← keeps the container alive independently of the daemons
      │  exec
      ▼
  runc                    ← creates the process: namespaces, cgroups, pivot_root, then exits
      │  syscalls
      ▼
  Linux kernel            ← Volume 1: namespaces, cgroups, overlayfs
```

The division of labour, stated plainly:

- **runc** is a **low-level runtime**. It takes an OCI bundle, makes the syscalls from Volume 1, execs your process, and **exits**. It does not stay running. It knows nothing about images, registries, or networks.
- **containerd** is a **high-level runtime**. Images, snapshots, container lifecycle, and a stable API. It's what Kubernetes talks to directly.
- **dockerd** is a **platform**: builds, Dockerfiles, Compose integration, volume and network management, the friendly UX.

### See it on your own machine

```bash
docker run -d --name stackdemo --rm alpine sleep 300

echo "--- the process tree ---"
PID=$(docker inspect -f '{{.State.Pid}}' stackdemo)
ps -o pid,ppid,cmd --forest -p $PID --ppid $(ps -o ppid= -p $PID | tr -d ' ') 2>/dev/null
pstree -sp $PID 2>/dev/null | head -3 || sudo apt install -y psmisc

echo "--- is runc still running? ---"
pgrep -a runc || echo "no runc process — it exited after creating the container (as designed)"

echo "--- the shims ---"
pgrep -a containerd-shim | head -3
```

**Expect:** your container's process is parented by a **`containerd-shim-runc-v2`**, not by `dockerd` and not by `runc`. And **there is no runc process at all** — it did its job and exited.

That's the detail most people get wrong. runc is not "the thing running your container." It's the thing that *started* your container and then left.

### Why the shim exists

The shim is the answer to a real question: if `dockerd` is the parent of every container, what happens when you upgrade Docker?

Without a shim, restarting the daemon orphans or kills every container on the host. With a per-container shim, the shim holds the container's stdio and exit status, so **daemons can restart while containers keep running**. Prove it:

```bash
docker inspect -f '{{.State.StartedAt}}' stackdemo
sudo systemctl restart docker
sleep 3
docker ps --filter name=stackdemo --format "{{.Names}} {{.Status}}"
```

**Expect:** the container is still running with its original start time, despite the daemon having been restarted underneath it. (Note this depends on configuration — `live-restore` and the shim architecture together — and results vary by setup; if your container did stop, that's a configuration difference worth knowing about, not a failed experiment.)

### Talk to containerd directly

`containerd.io` ships its own CLI, `ctr` — deliberately unfriendly, since it's a debugging tool rather than a product:

```bash
sudo ctr --namespace moby containers list | head -5
sudo ctr namespaces list
```

**Expect:** your Docker containers listed under the `moby` namespace. Docker's containers are *containerd's* containers; Docker is a client.

Now run something through containerd with Docker not involved at all:

```bash
sudo ctr images pull docker.io/library/alpine:latest
sudo ctr run --rm docker.io/library/alpine:latest ctrdemo echo "hello from containerd, no docker involved"
sudo ctr images list | head -3
```

**Expect:** it works. You pulled an OCI image from a registry and ran a container with `dockerd` playing no part.

```bash
docker stop stackdemo
sudo ctr images rm docker.io/library/alpine:latest
```

### The donations, and why Docker did it

- **2015**: Docker's libcontainer becomes **runc**, donated as the OCI reference implementation.
- **March 2017**: Docker donates **containerd** to the CNCF, accepted at incubating maturity. containerd's first commit dates to November 2015; it was born at Docker as a lower-layer runtime manager for the engine.
- **28 February 2019**: containerd **graduates** within the CNCF — the fifth project to do so, after Kubernetes, Prometheus, Envoy and CoreDNS.

> **Confidence: high.** These dates come from CNCF's own announcements and project journey report, and Docker's own writeups.

Why give away your core? Partly pressure — the format war was real. But mostly because **a standard that everyone trusts is worth more than a proprietary implementation nobody else will build on.** Docker won the architecture argument completely: containerd is now the default runtime in essentially every managed Kubernetes service.

It is also, precisely, why Docker Inc. found the commercial position so hard. Hold that thought.

---

