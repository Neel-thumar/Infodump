---
id: ecosystem-after-docker
title: Volume 8 — The Ecosystem and What Comes After Docker
order: 8
description: OCI, containerd and runc, rootless and daemonless alternatives, Kubernetes scoped honestly, and how Docker Inc. invented an era and sold its enterprise business.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 8 — The Ecosystem and What Comes After Docker

---

## The question this volume answers

A thread has been running under all seven volumes, and it's time to pull it.

In Volume 0 you installed **three** packages to get one tool: `docker-ce`, `docker-ce-cli`, and `containerd.io`. In Volume 1 the container escape was a bug in something called **runc**, not in Docker. In Volume 2 the image you took apart had an **OCI** layout. In Volumes 1, 4 and 7 I mentioned **rootless** alternatives and deferred them three times.

So: **what is actually running your containers, and what is the relationship between "Docker," "containers," and the half-dozen other names in this space?**

The answer is a genuinely good piece of engineering history. Docker created a technology, it became an industry, and Docker then deliberately dismantled its own product into standardized, donated components — which is why containers outlived Docker's commercial fortunes. That last part is this volume's closing story, and it's routinely misremembered.

---

## The Open Container Initiative

### The problem standardization solved

Picture 2014. Docker has exploded. Everyone is packaging software as Docker images. And a strategic problem is becoming obvious to everyone who isn't Docker Inc.:

**The image format is whatever Docker says it is. The runtime behaviour is whatever Docker implements. There is no specification — only a codebase owned by one venture-backed startup.**

That's a lot of industry-critical infrastructure resting on one company's roadmap and continued existence. CoreOS made the objection concrete in December 2014 by announcing a competing runtime (rkt) and a competing image format (appc), arguing that the container ecosystem needed a standard rather than a vendor.

A format war would have been bad for everyone, including Docker. What happened instead is more interesting.

### What the OCI is

In **June 2015**, at DockerCon, the **Open Container Initiative** was announced under the Linux Foundation, with broad industry backing — Docker, CoreOS, Google, AWS, Microsoft, Red Hat, IBM and others. Docker donated its container execution code (**libcontainer**, the thing that had replaced LXC in Docker 0.9) as the seed for **runc**, the OCI reference runtime implementation.

The OCI maintains three specifications:

| Specification | Defines | Answers |
| --- | --- | --- |
| **Runtime Spec** | The on-disk bundle (a root filesystem + `config.json`) and the lifecycle operations a runtime must support | "Given a filesystem and config, how do I run it?" |
| **Image Spec** | Manifest, config, and layer formats — the things you untarred in Volume 2 | "What is an image, exactly?" |
| **Distribution Spec** | The registry HTTP API — push, pull, discovery | "How do images move between machines?" |

> **Confidence: high** on the OCI's June 2015 founding at DockerCon under the Linux Foundation, and on runc originating from Docker's libcontainer. **Medium** on the exact release dates of each spec version — the Runtime and Image specs reached 1.0 in 2017 and Distribution somewhat later; check the OCI's own repositories for precise dates.

### Why it mattered more than it sounds

Standardizing had one consequence above all others: **it decoupled "Docker the company" from "containers the standard."**

Concretely, this is why you can build an image with Docker, push it to a registry written by Amazon, pull it on a machine running containerd, and execute it with crun — with nobody having coordinated. It's why Podman can run your Dockerfiles. It's why Kubernetes could later drop its Docker-specific code without breaking a single image.

And it's the reason this guide's material is durable. Everything you learned about layers, manifests, and digests is an open specification, not a vendor's implementation detail.

**Note the terminology precision this earns you.** "Docker image" is colloquial; the accurate term is **OCI image**. Docker builds them; it doesn't own them.

---

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

## Podman and the daemonless alternatives

### The architectural objection

Look back at the stack diagram and ask what's uncomfortable about it.

**`dockerd` runs as root, all the time, and everything goes through it.** Consequences, all of which you've already met:

1. **The socket is root** (Volume 7). Access to `/var/run/docker.sock` is host root, which is why the `docker` group is root-equivalent.
2. **It's a single point of failure.** Historically, daemon problems affected every container on the host; the shim architecture fixed most of this, but the daemon still owns builds, networks, and the API.
3. **Containers aren't your children.** Run `docker run` from a shell script and the container is parented by a shim, not by your script. Normal process tools — `wait`, job control, systemd supervision — don't work naturally.
4. **A persistent root daemon is a standing attack surface** whether or not you're using it.

**Podman** (Red Hat) takes the other approach: **no daemon at all.** `podman run` forks and execs `conmon` and then the OCI runtime directly, in your user session. The container is a child of your process.

```bash
# Optional — installs Podman alongside Docker. They coexist fine.
# sudo apt install -y podman
# podman run --rm alpine echo "hello from podman"
# podman run --rm alpine id
```

What that architecture buys:

- **Rootless by default.** Podman runs containers as your user via user namespaces (Volume 1's `unshare --user`). Container root maps to your unprivileged UID. A container escape lands as *you*, not as root.
- **No root daemon** to attack or to grant access to.
- **Normal process semantics.** Containers are children. `systemd --user` can supervise them directly, and `podman generate systemd` produces unit files.
- **CLI compatibility.** `alias docker=podman` genuinely works for most commands, because both drive OCI images and OCI runtimes.
- **Pods**, in the Kubernetes sense — groups of containers sharing a network namespace, exactly the primitive from Volume 5's exercise 5.5.

### The honest counter-case

This is where most write-ups turn into advocacy. The trade-offs are real:

- **Rootless networking is harder.** Without root you can't create veth pairs and manipulate the host bridge, so rootless Podman uses a userspace network stack (`slirp4netns`, or `pasta` more recently). It's slower, and some things behave differently. Privileged ports need configuration.
- **Rootless storage is slower** in some configurations, depending on which overlay mode is available to an unprivileged user.
- **The ecosystem assumes Docker.** Testcontainers, CI integrations, tutorials, and tooling target the Docker socket. Podman provides a compatible socket, which works well but is one more layer where behaviour can diverge.
- **Docker has rootless mode too.** It's less well known, but `dockerd-rootless-setuptool.sh` exists and addresses the same threat. The daemon model remains, but not as root.
- **Docker Desktop's developer experience** on macOS and Windows remains a genuine advantage for many teams.

**The honest summary:** for production Linux servers, especially where you want containers supervised by systemd and no root daemon, Podman's architecture is better on the merits. For local development in a Docker-shaped ecosystem, Docker is still the path of least resistance. They are not rivals so much as different points on a trade-off curve, and OCI standards mean you can move between them without changing your images.

### The rest of the family

| Tool | What it is | Why it exists |
| --- | --- | --- |
| **Buildah** | Builds OCI images without a daemon | Build in a container without mounting the socket (Volume 7's worst pattern) |
| **Skopeo** | Copies and inspects images between registries | Inspect a remote image without pulling it |
| **crun** | An OCI runtime in C, alternative to runc (Go) | Faster start, lower memory. Drop-in |
| **youki** | An OCI runtime in Rust | Same idea, different language |
| **gVisor** | Userspace kernel intercepting syscalls | Narrows the syscall surface from Volume 7's threat model |
| **Kata Containers** | A lightweight VM per container | Container API, VM boundary. The answer when you truly need both |
| **nerdctl** | Docker-compatible CLI for containerd | Docker UX, no dockerd |

`gVisor` and `Kata` are worth remembering specifically, because they're the honest answer to "I need to run untrusted code but I want the container workflow."

---

## Kubernetes, scoped honestly

### What Compose cannot do

Volume 6's exercise 6.5 put you against the wall deliberately. You scaled `api` to three replicas and immediately hit: you can't publish a fixed host port for multiple replicas, there's no health-aware routing, no rolling update, and no way to place replicas on different machines.

That list is a precise definition of what orchestration provides:

| Problem | Compose | Kubernetes |
| --- | --- | --- |
| Run containers on **many hosts** | No — single host | Yes, scheduling is the core function |
| **Self-healing** (reschedule after a node dies) | No | Yes |
| **Rolling updates** with rollback | No | Yes, built in |
| **Load balancing** across replicas | DNS round-robin only | Services with health-aware endpoints |
| **Health-based restarts** | No (Volume 6, exercise 6.3 — Docker only reports) | Liveness and readiness probes drive action |
| **Autoscaling** | No | Horizontal Pod Autoscaler |
| **Declarative reconciliation** | Imperative `up`/`down` | Continuous control loops toward desired state |

That last row is the conceptual leap, and it's bigger than the feature list. Compose executes commands: `up` creates things, `down` removes them. Kubernetes runs **control loops** that continuously compare actual state to declared state and act to close the gap. You don't tell it to start a container; you declare that three should exist, and a controller makes it so — now, and after a node dies at 4am, forever.

### What you already know that transfers

Encouragingly, most of it:

| You learned | In Kubernetes |
| --- | --- |
| OCI images, registries, tags/digests | Identical |
| Namespaces and cgroups | Identical — same kernel features |
| Volumes and mounts | PersistentVolumes / PVCs, same concepts |
| Healthchecks | Liveness, readiness, startup probes |
| Compose service networking | Services and cluster DNS |
| Capabilities, read-only fs, non-root | `securityContext` — same flags, YAML syntax |
| Sharing a network namespace (5.5) | **A pod.** Literally this |
| Secrets as files, not env vars | Secrets mounted as volumes |

What's new is scheduling, controllers and reconciliation, the resource model, and an operational surface that is genuinely large. **Kubernetes is not the next chapter of Docker; it's a different system with a much steeper curve.** Plenty of production systems should never adopt it. A single host with Compose, a restart policy, backups and monitoring is a completely legitimate architecture for a great many businesses, and choosing it deliberately is a sign of judgement rather than a lack of ambition.

### "Kubernetes deprecated Docker" — what actually happened

This headline caused genuine panic, and it was a misreading worth being able to correct.

Kubernetes talks to container runtimes through the **CRI** (Container Runtime Interface). Docker predates CRI and doesn't implement it, so Kubernetes carried an adapter called **dockershim**. Maintaining a special-case shim for one runtime, when containerd and CRI-O implement CRI natively — and when Docker itself sits *on top of* containerd anyway — was pure overhead.

So Kubernetes deprecated dockershim (announced late 2020) and **removed it in Kubernetes 1.24**. Managed services moved with it; Amazon EKS, for instance, ended dockershim support from 1.24.

**What did not happen:** Kubernetes did not stop supporting containers, and it did not stop supporting images built with Docker. Your images are OCI images. Nodes now talk to containerd directly — removing a layer, since Docker was calling containerd regardless. For almost every developer, the practical impact was zero.

> **Confidence: high** on the removal landing in 1.24 and on the reasoning; **medium** on the precise deprecation-announcement version, commonly cited as 1.20.

This is also the OCI's value proposition demonstrated in public: Kubernetes could drop its Docker-specific code without breaking anyone's images, **because the images were never really Docker's.**

---

## The incident: how Docker invented an era and sold the business

This one isn't an outage or a CVE. It's a commercial story, and it's the most under-taught thing in container education — partly because it's frequently misremembered.

**The single most common misremembering: "Mirantis bought Docker."** They did not. Mirantis acquired the **Docker Enterprise platform business**. Docker Inc. continued to exist, kept Docker Hub and Docker Desktop, and is still an independent company.

### The arc

**2010–2013.** dotCloud, founded by Solomon Hykes with Kamel Founadi and Sebastien Pahl out of Y Combinator's Summer 2010 batch, sells platform-as-a-service. The business isn't working. The internal container tooling is the interesting part. March 2013: the five-minute PyCon lightning talk from Volume 0; open-sourced five days later; the company renames itself Docker.

**2013–2017.** Explosive growth. Docker becomes one of the most consequential infrastructure technologies of the decade. The company raises heavily — **more than $272 million before 2019**, per Crunchbase data reported at the time — at valuations that made an IPO look plausible.

**And here is the problem, which was visible early to anyone paying attention.** Docker's core technology was:

- **Open source**, so anyone could use it for free;
- **Standardized** via the OCI, partly by Docker's own hand, so nobody was locked in;
- **Increasingly delegated** to components Docker had donated away — runc to the OCI, containerd to the CNCF;
- and the layer *above* it, where the money turned out to be, was being won by **Kubernetes**, backed by Google and then the entire cloud industry.

Docker's own orchestration answer, **Swarm**, was simpler and genuinely nicer to use. It lost anyway. The Kubernetes ecosystem had more contributors, more vendors with a stake, and by the late 2010s overwhelming momentum. Docker even shipped Kubernetes inside Docker Enterprise — shipping your competitor's product because customers demand it is not a strong position.

Meanwhile the cloud providers were selling managed Kubernetes with containerd underneath, monetizing containers at enormous scale while paying Docker nothing. Docker had created the market and standardized itself out of owning it.

**2019: three CEOs in one year.** Steve Singh stepped down in May, replaced by Rob Bearden, who was replaced in November by long-time Chief Product Officer **Scott Johnston**.

**13 November 2019.** Mirantis — a company with OpenStack roots that had pivoted toward Kubernetes — **acquired the Docker Enterprise platform business**, including roughly **750 customers**, along with Docker Enterprise employees and partnerships. **Terms were not disclosed.** Mirantis kept the Docker Enterprise brand.

The same day, Docker announced it had **raised $35 million** from existing investors **Benchmark Capital and Insight Partners**, and named Johnston CEO. Docker's own statement framed it as a return to its roots: focusing on developer workflows, and expanding the roles of **Docker Desktop and Docker Hub**.

> **Confidence: high** on the date, the parties, the ~750 customers, the undisclosed terms, the $35M from Benchmark and Insight, Johnston's appointment as the third CEO of 2019, and the $272M+ raised prior. Corroborated across TechCrunch, Axios, CIO Dive, SiliconANGLE and Mirantis's own press release. Contemporary commentary was blunt about the reading — that the deal left Docker with the assets that had historically been hardest to monetize.

### What happened next

Docker's post-2019 strategy has been to monetize the developer workflow rather than the enterprise platform — the surface people actually touch daily. Two moves defined it, and both were controversial:

- **Docker Hub pull rate limits** for anonymous and free accounts (introduced around November 2020), which broke a great many CI pipelines that had assumed unmetered pulls.
- **Docker Desktop licensing changes** (announced around August 2021) requiring a paid subscription for larger commercial organizations.

> **Confidence: medium-high** on both — I'm confident about what changed and roughly when, less so about exact dates and current thresholds. Both have been revised since; check Docker's current pricing before relying on specifics.

The reaction in both cases was a wave of "how do I replace Docker Desktop" articles — and the answer was usually Podman, Rancher Desktop, Colima, or `nerdctl`. **Which was only possible because of the OCI.** Docker's own standardization work made its product substitutable. That's the story in one sentence.

The current picture, at time of writing and worth verifying yourself: Docker Inc. is independent and by most accounts commercially healthier than in 2019, monetizing Docker Desktop, Docker Hub, and developer tooling. Mirantis still sells the Docker Enterprise lineage under the Mirantis Kubernetes Engine name. Solomon Hykes left Docker in 2018 and now runs Dagger.

### The lessons, which generalize well beyond containers

**1. Inventing a technology and capturing its value are different problems.** Docker was right about almost everything technically and still couldn't build the business its funding required. Xerox PARC, Netscape, and others are in the same category.

**2. Open source plus standards is a commons strategy, not a moat.** Every OCI donation made the ecosystem healthier and Docker's position weaker. That trade was probably correct for the world and definitely costly for the company. If you build on open standards, understand that you are choosing durability over control.

**3. The layer above tends to capture the value.** Docker owned the container. Kubernetes owned the cluster. The cloud providers owned the infrastructure. Value accrued upward and outward, away from the component that made it all possible.

**4. Ecosystem gravity beats product quality.** Swarm was, by wide agreement, easier to use than Kubernetes. It lost to an ecosystem with more contributors and more vendors with skin in the game. This pattern recurs constantly in infrastructure.

**5. And the genuinely happy ending:** containers were too important to belong to one company, and because of choices Docker itself made, they don't. Everything you learned in this guide is an open standard. If Docker Inc. disappeared tomorrow, your images would still build, still run, and still pull — on containerd, on Podman, on CRI-O, on runtimes not yet written.

That's not a sad story. It's what success looks like for infrastructure, even when it's expensive for the company that got there first.

---

## TRY THIS ON YOUR MACHINE

> Some exercises install optional packages; each is flagged with its cleanup.

### 8.1 — Watch the full delegation chain for one container

```bash
docker run -d --name chain --rm alpine sleep 300
PID=$(docker inspect -f '{{.State.Pid}}' chain)

echo "--- container process and its ancestry ---"
pstree -sp $PID 2>/dev/null || (sudo apt install -y psmisc && pstree -sp $PID)

echo "--- what containerd knows ---"
CID=$(docker inspect -f '{{.Id}}' chain)
sudo ctr --namespace moby containers info $CID 2>/dev/null | head -20

echo "--- the OCI runtime spec containerd handed to runc ---"
sudo ctr --namespace moby containers info $CID 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
spec=d.get('Spec',{})
print('namespaces:', [n['type'] for n in spec.get('linux',{}).get('namespaces',[])])
print('capabilities (bounding):', spec.get('process',{}).get('capabilities',{}).get('bounding',[])[:5], '...')
print('process args:', spec.get('process',{}).get('args'))
" 2>/dev/null

docker stop chain
```

**Expect:** the process tree showing `systemd → containerd-shim-runc-v2 → sleep` with no `dockerd` in the ancestry, and a JSON spec listing exactly the namespaces from Volume 1 and the capabilities from Volume 7.

**Why it's interesting:** that JSON *is* the OCI Runtime Spec. Every flag you've typed across eight volumes — `--cap-drop`, `-m`, `--read-only`, `--network` — is a field in that document. Docker's CLI is, functionally, a generator for it.

### 8.2 — Run a container with Docker completely uninvolved

```bash
sudo ctr images pull docker.io/library/alpine:3.20
sudo ctr run --rm docker.io/library/alpine:3.20 noDocker sh -c '
  echo "hostname: $(hostname)"
  echo "pid 1: $(ps aux | head -2 | tail -1)"
  cat /etc/os-release | head -2'

echo "--- meanwhile, what does Docker think exists? ---"
docker ps -a | head -3
sudo ctr images rm docker.io/library/alpine:3.20
```

**Expect:** a working container; `docker ps -a` knows nothing about it.

**Why it's interesting:** it separates "containers" from "Docker" experimentally rather than rhetorically. Everything you understand about namespaces, images and layers applies here, to a stack Docker isn't part of. This is what the OCI bought the industry.

### 8.3 — Prove an image is not Docker-specific

```bash
mkdir -p /tmp/oci-demo && cd /tmp/oci-demo
docker pull alpine:3.20
docker save alpine:3.20 -o alpine.tar
mkdir -p unpacked && tar -xf alpine.tar -C unpacked

echo "--- OCI layout markers ---"
ls unpacked/
cat unpacked/oci-layout 2>/dev/null
python3 -m json.tool unpacked/index.json 2>/dev/null | head -20

echo "--- mediaTypes tell you the spec in use ---"
grep -o '"mediaType":"[^"]*"' unpacked/index.json 2>/dev/null | sort -u
```

**Expect:** an `oci-layout` file, an `index.json`, and media types containing `application/vnd.oci.*` or `application/vnd.docker.*` — both standardized formats with documented specifications.

**Why it's interesting:** the directory you're looking at is defined by a public specification anyone can implement, which is why tools written by people who have never spoken to each other can all read it. Compare this to a VM disk image's format story. **Cleanup:** `cd ~ && rm -rf /tmp/oci-demo`

### 8.4 — Try a rootless container and see the UID mapping

Install Podman alongside Docker — they coexist without conflict.

```bash
sudo apt install -y podman
podman run --rm alpine echo "hello from podman, no daemon"

echo "--- who am I inside? ---"
podman run --rm alpine id

echo "--- who am I from the host's perspective? ---"
podman run -d --name rootlesstest alpine sleep 60
PID=$(podman inspect -f '{{.State.Pid}}' rootlesstest)
ps -o pid,user,cmd -p $PID
cat /proc/$PID/uid_map
podman stop rootlesstest && podman rm rootlesstest

echo "--- contrast with Docker ---"
docker run -d --name rootfultest --rm alpine sleep 60
DPID=$(docker inspect -f '{{.State.Pid}}' rootfultest)
ps -o pid,user,cmd -p $DPID
docker stop rootfultest

echo "--- and is there a podman daemon? ---"
pgrep -a podman || echo "no podman daemon — correct, it's daemonless"
```

**Expect:** inside the Podman container you are `uid=0(root)`; on the host, that same process is owned by **your user**, with a `uid_map` showing the translation. The Docker container's process is owned by **root**. And there is no podman daemon running between invocations.

**Why it's interesting:** this is Volume 1's user namespace and Volume 7's threat model made concrete in one comparison. A container escape from the Podman container lands as you, with your permissions. From the Docker one, it lands as root. That's the entire architectural argument, visible in two `ps` lines. **Disk:** ~100 MB for Podman. **Cleanup:** `sudo apt remove -y podman` if you don't want to keep it.

### 8.5 — Measure the runtime layers

```bash
echo "--- what's actually installed ---"
dpkg -l | grep -E "docker-ce|containerd" | awk '{print $2, $3}'

echo "--- what's running, and how much memory each layer costs ---"
ps -eo pid,rss,comm | grep -E "dockerd|containerd|shim" | \
  awk '{printf "%-28s %6.1f MB\n", $3, $2/1024}'

echo "--- container start time through the full stack ---"
time docker run --rm alpine true

echo "--- and through containerd alone ---"
sudo ctr images pull -q docker.io/library/alpine:3.20 > /dev/null 2>&1
time sudo ctr run --rm docker.io/library/alpine:3.20 timing true
sudo ctr images rm docker.io/library/alpine:3.20 > /dev/null
```

**Expect:** `dockerd` and `containerd` each consuming meaningful resident memory even when idle, a shim per running container, and `ctr` starting a container noticeably faster than `docker` — because it skips the CLI, the daemon's REST API, and the network and volume setup that Docker performs.

**Why it's interesting:** it quantifies what the convenience layer costs. On a laptop, irrelevant. On a node running 200 containers, or an edge device with 512 MB of RAM, this is exactly why Kubernetes talks to containerd directly rather than going through Docker — and why the dockershim removal was a simplification rather than a loss.

### Cleanup for this volume

```bash
docker ps -aq | xargs -r docker rm -f
docker system prune -f
sudo ctr --namespace moby containers list | head -3
```

---

## Where this leaves you, and what's next

You can now name every layer between your keyboard and the kernel, and you've run a container through each of them independently — Docker's full stack, containerd alone, and Podman with no daemon at all. You know which parts are open standards (the image, the runtime spec, the registry API), which are donated infrastructure (runc, containerd), and which are one company's product (the Docker CLI, Desktop, Hub).

And you know why that division exists: because in 2015 the industry was heading for a format war, and the resolution was Docker giving away the parts everyone needed to agree on. That decision made containers durable and made Docker Inc. substitutable, and both halves of that sentence are true at once.

You've also just seen the shape of the next thing. Kubernetes is not more Docker; it's a different system solving scheduling and reconciliation, on top of exactly the primitives you now understand. Your images, your `securityContext` flags, your volumes and probes — all of it transfers. What doesn't transfer is the operational model, and that's a real curve.

**Volume 9: Epilogue — Where This Goes From Here.**

Short, and about you rather than about Docker. Where containers actually run today, grounded in current sources and flagged as worth re-verifying. Then a branching map of what to learn next, depending on which parts of this guide you found yourself reading twice: Kubernetes and orchestration, container security and red-teaming, writing your own minimal container runtime from namespaces and cgroups by hand, or going down into Linux kernel internals. An honest career map — platform engineering, SRE, cloud infrastructure, security — with what each actually requires beyond this guide. And a closing reflection on what "knowing Docker" means now compared to Volume 0, when a container was still a lightweight VM.

Say "continue" when you're ready.
