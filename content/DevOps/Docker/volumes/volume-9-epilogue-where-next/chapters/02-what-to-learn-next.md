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

