## Deployment Strategies

Volume 2 covered the mechanics of a rolling update. Here is where that fits among the broader set of strategies a real team chooses from.

### Rolling update — the Kubernetes default

Already covered in depth. New Pods start, old Pods are removed once new ones are Ready, controlled by `maxSurge` and `maxUnavailable`. Good default for most stateless services; the risk is that both old and new versions serve traffic simultaneously during the rollout, which matters if the two versions are not compatible with each other (e.g. a database schema change).

### Blue/green

Two full environments exist side by side — "blue" (current) and "green" (new). Traffic is switched all at once, usually by updating a Service selector or an Ingress/Gateway rule, once green is fully verified.

```text
Service → (selector: version=blue)   ← switch this to version=green
```

**Advantage:** instant rollback — just switch the selector back. No mixed-version traffic ever.

**Cost:** you need double the resources running at once, at least briefly, and stateful components (databases) need a real migration strategy, not just a traffic switch.

### Canary

A small percentage of traffic goes to the new version first, and is increased gradually as confidence grows.

```text
95% of traffic → v1 (stable)
 5% of traffic → v2 (canary)
```

With plain Kubernetes, this is usually approximated with two Deployments behind one Service, using replica counts as a rough percentage (2 canary Pods out of 40 total ≈ 5%). Genuine traffic-percentage-based splitting needs a service mesh or a Gateway API implementation supporting weighted routing — which is exactly the kind of feature the Gateway API (Volume 3) was designed to express properly, instead of approximating with replica counts.

**Advantage:** real production traffic tests the new version on a small, bounded blast radius before full rollout.

**Cost:** more operational complexity, and you need solid metrics to actually judge whether the canary is healthy before expanding it.

### Choosing between them

| Situation | Reasonable choice |
|---|---|
| Routine, low-risk stateless update | Rolling update |
| High-risk change, need instant full rollback | Blue/green |
| Want to validate against real traffic before full exposure | Canary |
| Incompatible schema/data change between versions | Blue/green with careful data migration, not a rolling update |

