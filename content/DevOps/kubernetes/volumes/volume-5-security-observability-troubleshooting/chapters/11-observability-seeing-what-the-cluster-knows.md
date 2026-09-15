## Observability: Seeing What the Cluster Knows

Before troubleshooting, you need visibility. Three sources, in increasing order of detail.

### Events

Already used throughout this guide via `kubectl describe`, but they deserve their own attention:

```bash
kubectl get events --sort-by=.lastTimestamp -A
```

Events are short-lived — typically kept about an hour — and they are the closest thing to a live narration of what the control plane just did: scheduled, pulled an image, failed a probe, killed a container. Look here first, always, before logs.

### Metrics

The **metrics server** (mentioned in Volume 4 for HPA) provides basic CPU and memory usage:

```bash
kubectl top nodes
kubectl top pods
```

This is not historical — it is a live snapshot, useful for "what is happening right now" but not for "what happened at 3 AM last night." For that you need a real metrics pipeline (Prometheus and similar) — ecosystem tooling, covered only briefly here because it is not Kubernetes core, though understanding *that Kubernetes exposes metrics endpoints for this to consume* is the core-relevant part.

### Logs

```bash
kubectl logs <pod>
kubectl logs <pod> -c <container>       # multi-container Pod
kubectl logs <pod> --previous           # the crashed attempt, from Volume 2
kubectl logs -l app=web --all-containers --prefix
```

Logs are application output, captured by the container runtime and exposed by the kubelet. They are **not persisted anywhere by Kubernetes** — delete the Pod, lose the logs, unless something is shipping them elsewhere. This is why production clusters run a log-shipping agent (commonly as a DaemonSet, from Volume 2) sending logs to a central store. That agent is ecosystem tooling; the fact that Kubernetes makes container output available for it to collect is core behaviour.

### The order that actually works

```text
1. Events        — what did the control plane try to do?
2. Pod status    — what state is it in right now?
3. Logs          — what did the application actually say?
4. Metrics       — is a resource constraint involved?
```

Skipping straight to logs is the single most common inefficiency in Kubernetes debugging — if the container never started, there are no logs to read, and you have wasted a step.

