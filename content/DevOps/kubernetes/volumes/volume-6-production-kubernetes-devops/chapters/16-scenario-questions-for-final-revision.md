## Scenario Questions for Final Revision

**"Users report intermittent 502s only during deployments."** Investigate SIGTERM handling and `preStop` hooks, and whether `maxUnavailable` allows capacity to drop too far during the rollout (Volume 2/6).

**"A Pod can't reach a Service that clearly has healthy endpoints."** Check DNS resolution next, then NetworkPolicy — in that order, because DNS is more often the actual gap (Volume 3).

**"The cluster upgrade is blocked."** Look for CRDs or webhooks that don't yet support the new API version — this is the most common real blocker, not Kubernetes core itself (this volume).

**"A namespace's Pods keep getting evicted under load, but not other namespaces'."** Check QoS class — likely `BestEffort` or `Burstable` without adequate requests, evicted before better-provisioned workloads elsewhere on the same node (Volume 4).

