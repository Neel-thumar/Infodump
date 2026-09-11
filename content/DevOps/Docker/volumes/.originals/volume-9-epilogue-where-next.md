---
id: epilogue-where-next
title: "Volume 9 — Epilogue: Where This Goes From Here"
order: 9
description: Where containers actually run today, a branching map of what to learn next, an honest career map, and a look back at what changed since Volume 0.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 9 — Epilogue: Where This Goes From Here

---

## Where containers actually run today

A grounding note before the numbers: **all of this is the most perishable material in the guide.** Volumes 1 through 5 described kernel mechanisms that have been stable for a decade and will still be accurate in 2035. This section will be stale within eighteen months. Treat the figures as a snapshot with a date on it, and re-verify against primary sources before quoting them anywhere that matters.

### The current picture

From the CNCF's Annual Cloud Native Survey for 2025, published January 2026:

- **82% of container users run Kubernetes in production**, up from 66% in the 2023 edition.
- **56% of organizations run most or all of their production applications in containers** — up from 41% in 2023 — while container *pilots* shrank from 11% to 6%.
- **66% of organizations are running generative AI workloads on Kubernetes**, which is why CNCF's own framing calls Kubernetes the operating system for AI.
- Among the most mature adopters, **79% run stateful workloads in containers in production** — the "containers are only for stateless apps" era is over.
- The average organization surveyed runs in the low thousands of containers.

> **Confidence: high** on the figures as reported; **medium** on how far they generalize. This is a self-selected survey of organizations already in the CNCF orbit. It describes committed cloud-native shops, not the median business. Enormous amounts of software still run on VMs and hand-configured servers, and much of it should.

### The four places containers live

**1. Cloud infrastructure.** Every major provider sells managed Kubernetes (EKS, GKE, AKS) and container-native compute where you hand over an image and receive a running service (Cloud Run, Fargate, Container Apps). Note what that second category means: **the OCI image has become a unit of deployment in its own right** — you can now target platforms where you never touch a container runtime at all, and your Volume 2 knowledge is still exactly what's required.

**2. CI/CD.** Almost certainly the highest-volume container use by count. Every GitHub Actions job, GitLab CI job, and Jenkins agent that specifies a `container:` is a fresh container, run for minutes, discarded. Nobody counts these. The reason it works is Volume 1's: milliseconds to start, megabytes to store.

**3. Local development.** Docker Desktop, Compose, devcontainers, Testcontainers — the "it works on my machine" problem from Volume 0, solved by making the machine part of the artifact.

**4. Edge and embedded.** The interesting frontier, and the one where the assumptions break. A container runtime on a device with 512 MB of RAM is a different proposition, which is why the layer-shedding from Volume 8 matters there: k3s instead of full Kubernetes, containerd instead of Docker, and interest in lighter runtimes generally.

### What's changing at the edges

**WebAssembly** is the most-discussed potential successor, and deserves an honest scoping rather than either dismissal or hype. The pitch is real: Wasm modules start in microseconds rather than milliseconds, run in a sandbox that doesn't depend on the shared-kernel trust model from Volume 7, and are genuinely portable across architectures. Server-side Wasm with WASI is being adopted in serverless and edge contexts, sometimes invisibly to the people using it.

The honest status: **it is not a container replacement today.** CNCF's own 2025 data showed roughly 65% of respondents reporting no WebAssembly experience at all and only about 5% reporting full deployment. The ecosystem — language support, libraries, debugging, the component model — is years behind. It is a complement in specific niches, and a thing worth watching rather than a thing to bet a migration on. **Confidence: medium-high** on the adoption figures, **low** on any prediction about where this lands.

**Sandboxed runtimes** — gVisor, Kata — are the pragmatic answer to Volume 7's honest limitation, and are already how several clouds run untrusted tenant workloads.

**eBPF** is the quieter and arguably bigger story: programmable kernel-level observability and networking, which underpins Cilium and much of modern container networking and security tooling. If you enjoyed Volume 5, this is where that thread continues.

---

## What to learn next

Four branches. Pick by which volume you found yourself re-reading, not by which sounds most impressive.

### If Volumes 6 and 8 hooked you: orchestration

**You liked:** declaring a system and having it exist; the scaling wall in exercise 6.5; the control-loop idea.

**Learn:** Kubernetes. Pods (Volume 5's shared network namespace), Deployments, Services, ConfigMaps and Secrets, then Ingress, StatefulSets, and RBAC. After that: Helm or Kustomize, then GitOps with Argo CD or Flux.

**Start here:** install **k3d** or **kind** and run a local cluster on the machine you've been using all along. Take your Volume 6 Compose application and convert it by hand — not with `kompose`, by hand, because the friction is the lesson. Then deliberately break things: delete a pod and watch it come back; that reconciliation loop is the whole conceptual shift.

**Honest warning:** Kubernetes' operational surface is large, and a substantial fraction of teams running it would be better served by a single host with Compose, backups, and monitoring. Learn it because you want to work at that layer, not because it's the default answer.

### If Volumes 1 and 5 hooked you: build your own runtime

**You liked:** `unshare`, veth pairs, `/sys/fs/cgroup`, the by-hand builds.

**Do this:** write a container runtime. It's the single best learning project available here, and a weekend gets you most of the way.

A sequence that works, each step building on a volume you've already done:

1. `clone()` with namespace flags, or shell out to `unshare` — Volume 1.
2. Set up a root filesystem and `pivot_root` into it. Get a rootfs with `docker export` on a running container.
3. Mount `/proc` inside, so `ps` works — the `--mount-proc` lesson.
4. Create a cgroup, write `memory.max` and `pids.max`, put your process in it — Volume 1's by-hand cgroup.
5. Set the hostname, drop capabilities, apply a seccomp filter — Volume 7.
6. Create a veth pair, attach to a bridge, add NAT — Volume 5, steps 1 through 6.
7. Assemble a rootfs from OCI layers with an overlay mount — Volumes 1 and 2.
8. Read the **OCI Runtime Specification** and make your tool accept a real `config.json` bundle. At this point it is a runtime, not a toy.

Go is the natural language (runc's lineage), but C, Rust, or even a careful shell script all work. Liz Rice's "containers from scratch" talks are the canonical reference for this exercise if you want a guide alongside.

**When you finish, read runc's source.** It will be legible, which is the real payoff.

### If Volume 7 hooked you: container security

**You liked:** the threat model, the socket demonstration, tracing each defence to the attack it stops.

**Learn:** the offensive side — container escape techniques and why each works — then the defensive stack: seccomp profile authoring, AppArmor/SELinux, admission control (OPA Gatekeeper, Kyverno), runtime detection (Falco, Tetragon), and supply-chain security (SBOMs, Sigstore/cosign signing, provenance attestation).

**Start here:** work through an intentionally vulnerable container lab in a disposable VM — snapshot first, and never on a machine or network you don't fully own. Then read the CVEs from this guide in their original writeups: CVE-2019-5736 (Volume 1), CVE-2022-0492, CVE-2024-21626. Reading a real escape end to end teaches more than any checklist.

**Then go earn it:** write a custom seccomp profile for a real application by recording its syscalls, and see how small you can make it without breaking anything.

### If the kernel bits hooked you: go down a layer

**You liked:** namespaces as kernel data structures, `/proc` magic symlinks, OverlayFS copy-up, conntrack.

**Learn:** Linux internals properly. Process management and scheduling, the VFS and filesystem implementation, the network stack and netfilter, memory management and the page cache. Then **eBPF**, which is where this knowledge is most employable right now.

**Start here:** *The Linux Programming Interface* (Kerrisk) is the reference; Brendan Gregg's performance work is where theory meets practice. Build something with `bpftrace` — tracing every `execve` on your system in ten lines of code is a genuinely startling first experience.

---

## An honest career map

Four paths this material opens, with what each actually requires beyond this guide.

| Path | What the job is | Beyond this guide you need | Reality check |
| --- | --- | --- | --- |
| **Platform / DevOps engineering** | Build the paved road other engineers deploy on | Kubernetes, Terraform/IaC, CI/CD design, observability, and enough cloud to be dangerous | Largest market. Also the most crowded at entry level — the differentiator is *building* platforms, not operating them |
| **SRE** | Reliability as an engineering discipline: SLOs, error budgets, capacity, incident response | Strong coding, distributed systems, monitoring theory, and the cultural practice of blameless postmortems | Usually demands real software engineering. Harder to enter directly; commonly reached from dev or ops |
| **Cloud infrastructure** | Design and run the substrate: networking, storage, identity, cost | Deep expertise in one provider, networking fundamentals, IAM, and FinOps | Certifications genuinely help here, more than elsewhere. Breadth matters |
| **Container / cloud security** | Secure the supply chain and the runtime | Everything in Volume 7 plus offensive skills, compliance frameworks, and detection engineering | Smallest, best-paid, highest bar. Needs real security fundamentals, not just container knowledge |

Some observations that apply across all four, offered as opinion rather than fact:

**What you have now is a strong foundation and not a job qualification by itself.** Understanding containers deeply is table stakes for all four paths — necessary, not sufficient. The differentiator in every case is what you've *built and operated*, not what you can explain.

**The most valuable thing you can do next is run something real.** A small service, deployed, with backups you've restored, monitoring that has paged you, and an incident you've written up. One of those is worth more in an interview than three certifications, because it produces stories with specifics in them.

**Your depth is an unusual advantage.** Most people who use Docker daily cannot explain what a namespace is. You built one by hand. In interviews, that difference shows up immediately when the questions go one layer past the surface — and the ability to say "let me show you what's actually happening in `/proc`" is rare.

**Certifications are worth roughly what the local market says they're worth.** CKA and CKAD are respected because they're hands-on. Cloud provider certs vary in signal by region and employer. None substitute for the paragraph above.

---

## TRY THIS ON YOUR MACHINE

Five final exercises. These are retrospective and consolidating rather than new material — the point is to find out what actually stuck.

### 9.1 — Explain a container without using the word "Docker"

Not a command. An exercise.

Write, in your own words, no more than 300 words, an explanation of what a container is — to a competent Linux engineer who has never used one. Constraints: you may not use the words *Docker*, *lightweight*, or *virtual machine*. You must name at least three kernel mechanisms and say what each one does.

Then check yourself against Volume 1 and see what you got wrong or vague.

**Why it's interesting:** the constraint against "lightweight VM" forces you to construct the actual explanation instead of reaching for the metaphor. If you can do this cleanly, you know the material. If you find yourself hand-waving at a particular point, that's precisely where to re-read.

### 9.2 — Audit a machine like you're being paid to

Run the full sweep against any host you're responsible for — or your own laptop.

```bash
echo "=== DAEMON EXPOSURE ==="
sudo ss -tlnp | grep -E ":2375|:2376" || echo "OK: no TCP daemon listener"
getent group docker
echo
echo "=== CONTAINERS WITH HOST-LEVEL ACCESS ==="
docker ps -q | xargs -r docker inspect --format \
  '{{.Name}} privileged={{.HostConfig.Privileged}} pid={{.HostConfig.PidMode}} net={{.HostConfig.NetworkMode}}'
docker ps -q | xargs -r docker inspect --format \
  '{{.Name}} {{range .Mounts}}{{.Source}} {{end}}' | grep -E "docker.sock|^\S+ /$" || echo "OK: no socket mounts"
echo
echo "=== UNLIMITED CONTAINERS ==="
docker ps -q | xargs -r docker inspect --format \
  '{{.Name}} mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}} user={{.Config.User}}'
echo
echo "=== PUBLIC PORT BINDINGS ==="
docker ps --format "{{.Names}} {{.Ports}}" | grep "0.0.0.0" || echo "OK: nothing bound to all interfaces"
echo
echo "=== LOG ROTATION ==="
docker info --format 'driver: {{.LoggingDriver}}'
sudo grep -A5 "log-opts" /etc/docker/daemon.json 2>/dev/null || echo "WARNING: no daemon.json — logs are unbounded (Volume 3)"
echo
echo "=== UNATTRIBUTABLE VOLUMES ==="
docker volume ls -qf dangling=true | wc -l
echo
echo "=== DISK ==="
docker system df
```

**Why it's interesting:** every check maps to a specific incident in this guide — Graboid, the UFW bypass, the restart-loop disk exhaustion, the writable-layer data loss. Save it as a script. It's a genuinely useful artifact, and it's yours.

### 9.3 — Build the smallest useful image you can

Take any program you've written and get it as small as possible, measuring at each step.

```bash
mkdir -p ~/smallest && cd ~/smallest
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "small")
	})
	http.ListenAndServe(":8080", nil)
}
EOF
printf 'module smallest\n\ngo 1.22\n' > go.mod

printf 'FROM golang:1.22\nWORKDIR /s\nCOPY . .\nRUN go build -o /app .\nCMD ["/app"]\n' > Dockerfile.1
printf 'FROM golang:1.22 AS b\nWORKDIR /s\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /app .\nFROM alpine:3.20\nCOPY --from=b /app /app\nCMD ["/app"]\n' > Dockerfile.2
printf 'FROM golang:1.22 AS b\nWORKDIR /s\nCOPY . .\nRUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app .\nFROM scratch\nCOPY --from=b /app /app\nUSER 10001\nENTRYPOINT ["/app"]\n' > Dockerfile.3

for n in 1 2 3; do docker build -qf Dockerfile.$n -t small:v$n . > /dev/null; done
docker images small --format "table {{.Tag}}\t{{.Size}}"
```

**Expect:** roughly 900 MB, then ~15 MB, then ~7 MB. Two orders of magnitude, with the final image containing exactly one file.

**Why it's interesting:** it compresses Volume 2 into one measurement you can show someone. And the last image is worth sitting with — an image with no shell, no libc, no package manager, and no OS, which nonetheless serves HTTP. That's what "a container is a process" means, taken to its conclusion. **Cleanup:** `cd ~ && rm -rf ~/smallest && docker rmi small:v1 small:v2 small:v3`

### 9.4 — Start your own runtime, tonight

Thirty minutes for a working skeleton, using only what Volume 1 taught you.

```bash
mkdir -p ~/myruntime && cd ~/myruntime

docker create --name rootfs-src alpine:3.20 > /dev/null
docker export rootfs-src -o rootfs.tar
docker rm rootfs-src > /dev/null
mkdir -p rootfs && tar -xf rootfs.tar -C rootfs

cat > mycontainer.sh <<'SCRIPT'
#!/bin/bash
set -e
ROOTFS="$(dirname "$(readlink -f "$0")")/rootfs"
CG=/sys/fs/cgroup/mycontainer

mkdir -p $CG
echo "100M" > $CG/memory.max
echo "50"   > $CG/pids.max

echo "[mycontainer] starting with namespaces + cgroup limits"
unshare --pid --fork --mount --uts --ipc --net --mount-proc="$ROOTFS/proc" \
  chroot "$ROOTFS" /bin/sh -c '
    hostname mycontainer
    echo "--- inside ---"
    hostname
    ps aux
    ip addr | head -4
    exec /bin/sh'

rmdir $CG 2>/dev/null || true
SCRIPT
chmod +x mycontainer.sh
sudo ./mycontainer.sh
```

**Expect:** a shell in its own PID, mount, UTS, IPC and network namespaces, on an Alpine root filesystem, with a memory and process cap. Exit with `exit`.

**Why it's interesting:** that's forty lines, and it is recognizably a container runtime. What it's missing is the roadmap: `pivot_root` instead of `chroot`, capability drops, a seccomp filter, an overlay root assembled from image layers, a veth pair, and an OCI `config.json` parser. Each one is a section you've already read. **Flagged:** creates a cgroup under `/sys/fs/cgroup` and removes it on exit; if the script is interrupted, clean up with `sudo rmdir /sys/fs/cgroup/mycontainer`. **Cleanup:** `cd ~ && rm -rf ~/myruntime`

### 9.5 — Delete everything, then rebuild it from memory

```bash
docker ps -aq | xargs -r docker rm -f
docker system prune -a --volumes -f
docker system df
```

**Flagged: this deletes every image, container, and volume on the machine.** That's the point — do it only if you're happy to.

Then, without looking at any previous volume, rebuild the Volume 6 stack from scratch: a service, a database with a named volume, a cache, a private network, healthchecks with proper `depends_on` conditions, non-root users, dropped capabilities, resource limits, and a loopback-bound published port.

**Why it's interesting:** recall is a different skill from recognition, and it's the one that matters at 3am. Whatever you have to look up is what you actually need to review — and you'll find it's less than you fear.

---

## What "knowing Docker" means now

Go back to Volume 0 for a moment.

You started with a stat, a story about an environment nobody could reproduce, and a claim you had no way to evaluate: that the mechanism making containers work was not invented by Docker and was sitting unused in Linux for five years before anyone made it usable.

Now you can not only evaluate that claim, you can demonstrate it. In exercise 9.4 you just did.

Here's what actually changed, and it isn't the command list.

**At the start, Docker was a tool you'd use.** Commands to memorize, flags to look up, behaviour to accept. When something went wrong the options were to search for the error message or try something else.

**Now Docker is a thin layer you can see through.** `docker run -m 256m` is a number written into `memory.max`. `docker exec` is `setns()`. `docker pause` is a write to `cgroup.freeze`. `-p 8080:80` is a DNAT rule in the `nat` table. A volume is a bind mount into a mount namespace. An image is an ordered list of tarballs and a JSON file. When something goes wrong now, you have somewhere to look, because you know what's underneath.

That's the difference between using a tool and knowing one, and it generalizes well past containers. Every abstraction you'll meet is like this: someone's convenient interface over mechanisms that are usually simpler and always more interesting than the interface suggests. The habit you've built over nine volumes — *find the layer below and look at it directly* — is more valuable than any specific thing you learned about Docker.

The incidents make the same case from the other direction. CVE-2019-5736: every namespace correct, a file descriptor crossed the boundary. `docker123321`: the registry worked exactly as designed; trust was the gap. The UFW bypass: two subsystems, both correct, both documented, an unexamined seam. Graboid: no vulnerability whatsoever — a default nobody revisited. **Failures live at boundaries and in defaults**, and you only see boundaries if you know what's on both sides.

And there's the last thing, which is the part I'd most like to stick.

Containers were assembled over thirty-four years by people fixing one leak at a time. chroot in 1979 isolated the filesystem and nothing else. Jails added hostname and process isolation in 2000. Google wrote cgroups because they had a noisy-neighbour problem in 2006. Namespaces landed one at a time across a decade. Every piece existed in mainline Linux and free for anyone to use by 2008 — and almost nobody used them, because holding them all correctly at once was too hard. Then in 2013 someone spent five minutes on a stage explaining that they'd made it easy, and the industry changed.

**The mechanism was never the hard part. Making it usable was.** That's worth remembering the next time you're deciding whether a thing you've built is finished.

---

## A closing note

You now know Docker better than most people who use it every day, and — more usefully — you know the Linux underneath it, which will still be true when the tooling above has been replaced twice.

Pick one of the four branches. Build something real with it. Break it, fix it, and write down what happened.

That's the whole method, and it's the only part of this guide you can't get from reading.
