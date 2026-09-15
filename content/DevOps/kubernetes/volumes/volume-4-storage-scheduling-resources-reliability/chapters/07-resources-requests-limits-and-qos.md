## Resources: Requests, Limits and QoS

Every container should declare what it needs.

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

**Requests** are what the scheduler uses for filtering — "does any node have at least this much free?" Requests are also a reservation: once scheduled, that amount is set aside for the Pod even if it is not using it yet.

**Limits** are the hard ceiling. For memory, going over the limit gets the container killed (`OOMKilled`, exit code 137 — from Volume 2). For CPU, going over the limit does not kill anything; the container is **throttled** — it simply gets less CPU time, and things quietly slow down instead of crashing.

This asymmetry matters and is frequently misunderstood: **memory limits are enforced by killing. CPU limits are enforced by throttling.** A CPU-starved application will not show up as a crash — it will show up as unexplained latency.

### QoS classes

Kubernetes derives a Quality of Service class from your requests and limits — you do not set it directly.

| Class | How you get it | Behaviour under node pressure |
|---|---|---|
| `Guaranteed` | requests == limits, for every container, for both CPU and memory | Last to be evicted |
| `Burstable` | requests set, but lower than limits (or limits missing on some) | Evicted before Guaranteed |
| `BestEffort` | No requests or limits set at all | First to be evicted |

```bash
kubectl get pod <name> -o jsonpath='{.status.qosClass}'
```

When a node runs low on memory, Kubernetes evicts Pods in that order — `BestEffort` first, `Burstable` next, `Guaranteed` last. This is precisely why production databases are almost always given `Guaranteed` QoS deliberately.

### ResourceQuota and LimitRange

Requests and limits are per-container. Two namespace-level objects control the aggregate and set defaults:

**ResourceQuota** caps total resource usage in a namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    pods: "20"
```

**LimitRange** sets defaults and bounds so nobody forgets to set anything, or sets something absurd:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
spec:
  limits:
    - default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "250m"
        memory: "256Mi"
      type: Container
```

Together these are how a platform team stops one careless deployment from starving every other team on a shared cluster.

