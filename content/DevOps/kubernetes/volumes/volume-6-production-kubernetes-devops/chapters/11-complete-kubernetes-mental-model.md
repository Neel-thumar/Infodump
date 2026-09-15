## Complete Kubernetes Mental Model

One picture, tying every volume together.

```text
You describe desired state (Volume 1: the API, the object model)
        ↓
Control plane reconciles it (Volume 1: scheduler, controllers)
        ↓
Workloads run as Pods (Volume 2: Deployments, config, probes)
        ↓
Traffic reaches them (Volume 3: Services, DNS, Ingress/Gateway, NetworkPolicy)
        ↓
They get the resources and placement they need (Volume 4: storage, scheduling, resources, scaling)
        ↓
Access is controlled and the system is observable (Volume 5: RBAC, security, troubleshooting)
        ↓
All of it is operated safely over time (Volume 6: upgrades, strategies, backup, ecosystem)
```

Every concept in this guide is an instance of the same underlying pattern from Volume 0: **you declare what you want, a controller compares it to what exists, and it acts to close the gap — forever, at every layer, from a single Pod's replica count to the whole cluster's version.**

