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

