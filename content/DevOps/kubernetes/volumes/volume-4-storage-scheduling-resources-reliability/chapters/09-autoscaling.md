## Autoscaling

Three different autoscalers answer three different questions, and it is worth being precise about which is which.

### Horizontal Pod Autoscaler (HPA) — more Pods

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

This changes `replicas` on the Deployment based on observed metrics (CPU, memory, or custom metrics if you have a metrics pipeline for them). It needs the **metrics server** installed to read CPU/memory usage — a common early lab mistake is configuring HPA and wondering why it does nothing, when the real problem is that no metrics source exists yet.

Note the requirement this creates: **HPA only works well if requests are set correctly**, because "70% utilization" is measured against the requested CPU, not some absolute number.

### Vertical Pod Autoscaler (VPA) — bigger Pods

VPA adjusts a Pod's requests and limits based on observed usage, rather than adding more replicas. It is not built into Kubernetes core — it is a separate project you install. Its most disruptive mode restarts Pods to apply new values, which is why VPA and HPA are normally not pointed at the same metric on the same workload — they can fight each other.

### Cluster Autoscaler — more nodes

This is a different layer entirely. When Pods are `Pending` because **no node has room**, the cluster autoscaler adds a new node. When nodes sit mostly empty, it removes them. This is cloud-provider-integrated tooling, not something that runs meaningfully on a fixed local cluster like `kind`.

```text
Traffic increases
      ↓
HPA sees high CPU → increases replicas
      ↓
New Pods are Pending — no node has room
      ↓
Cluster Autoscaler sees Pending Pods → adds a node
      ↓
Scheduler places the new Pods on the new node
```

This is the complete picture interviewers are actually asking about when they say "how does Kubernetes scale."

