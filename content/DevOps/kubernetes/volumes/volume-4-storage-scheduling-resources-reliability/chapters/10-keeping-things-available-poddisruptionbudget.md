## Keeping Things Available: PodDisruptionBudget

Two very different kinds of disruption exist, and the distinction matters:

* **Involuntary** — a node crashes, hardware fails. Nothing can be scheduled in advance for this.
* **Voluntary** — a human or a system deliberately removes a Pod: node drain for maintenance, a cluster upgrade, the cluster autoscaler scaling down. This *can* be controlled.

**PodDisruptionBudget (PDB)** protects against voluntary disruption by telling Kubernetes the minimum number of Pods that must stay available during operations like drain:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web
```

With this in place, `kubectl drain` on a node will refuse to evict a Pod if doing so would drop `web` below 2 available replicas — it waits, or fails, instead of taking your application down for the sake of finishing maintenance quickly.

```bash
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data
```

`--ignore-daemonsets` is needed because DaemonSet Pods (Volume 2) are meant to run on every node and are not meant to be drained away in the usual sense.

