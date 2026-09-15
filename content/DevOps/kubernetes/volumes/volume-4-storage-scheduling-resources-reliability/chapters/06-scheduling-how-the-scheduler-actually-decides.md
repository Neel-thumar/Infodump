## Scheduling: How the Scheduler Actually Decides

Recall from Volume 1: the scheduler's whole job is picking a node for a Pod and writing that choice into the Pod object. Here is how it decides.

```text
All nodes
   ↓  FILTERING — remove nodes that cannot possibly work
Feasible nodes
   ↓  SCORING — rank the survivors
Best node
   ↓
Write nodeName into the Pod
```

**Filtering** eliminates nodes that fail hard requirements: not enough CPU/memory for the Pod's requests, a taint the Pod does not tolerate, a required label the node lacks, a port conflict, and more.

**Scoring** ranks what is left — preferring, for example, nodes with more free resources, or better spreading Pods across the cluster. This is a soft preference, not a hard rule.

If **no** node survives filtering, the Pod stays `Pending`. This is why `kubectl describe pod` on a `Pending` Pod usually shows a message like `0/3 nodes are available: 2 Insufficient memory, 1 node(s) had taint...` — it is telling you exactly which filter every node failed.

### Controlling placement

**`nodeSelector`** — the simplest, a hard requirement matching node labels:

```yaml
spec:
  nodeSelector:
    disktype: ssd
```

**Node affinity** — the same idea, more expressive, and can be a soft preference instead of a hard rule:

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: disktype
                operator: In
                values: ["ssd"]
```

The name is long on purpose and worth reading literally: **required during scheduling** (a hard rule when placing), **ignored during execution** (if the node's label changes later, the already-running Pod is not evicted).

**Pod affinity / anti-affinity** — place Pods relative to *other Pods*, not nodes:

```yaml
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: web
          topologyKey: kubernetes.io/hostname
```

This says: do not schedule this Pod on a node that already has another Pod labelled `app: web`. Used constantly for spreading replicas across nodes so one node failure cannot take out the whole application.

**Taints and tolerations** — the opposite direction. A **taint** on a node repels Pods; a **toleration** on a Pod allows it to ignore a specific taint.

```bash
kubectl taint nodes node1 dedicated=gpu:NoSchedule
```

```yaml
spec:
  tolerations:
    - key: "dedicated"
      operator: "Equal"
      value: "gpu"
      effect: "NoSchedule"
```

The distinction that trips people up: **affinity is the Pod choosing a node it wants. A taint is the node refusing Pods it does not want**, and a toleration is permission to ignore that refusal — not a request to be placed there. Taints and tolerations are commonly used to reserve nodes for specific workloads (GPU nodes, dedicated batch nodes) so ordinary Pods never land there by accident.

**Topology spread constraints** — a more direct way to spread Pods evenly across zones or nodes without the verbosity of anti-affinity:

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app: web
```

This keeps the Pod count per zone within 1 of each other — genuinely useful for surviving a zone outage, and increasingly the preferred tool over anti-affinity for this specific purpose.

