## Production Architecture: High Availability (HA)

When Argo CD manages 50 clusters, it becomes critical infrastructure. If Argo CD goes down, you cannot deploy. To make Argo CD Highly Available (HA), platform engineers deploy the `argocd-ha` installation manifests.

Here is what changes in a production HA setup:

1. **API Server & UI:** Scaled to multiple replicas behind an Ingress controller.
2. **Repository Server:** Scaled to multiple replicas. This is usually the bottleneck because cloning Git and running `helm template` is CPU and memory-intensive.
3. **Application Controller:** This cannot just be scaled randomly, because two controllers might try to sync the same Application at the same time (a race condition). In HA, we enable **Sharding**. Controller 1 handles clusters A-M, and Controller 2 handles clusters N-Z.
4. **Redis:** Replaced with Redis HA (Redis Sentinel) so the cache survives a node failure.

---

