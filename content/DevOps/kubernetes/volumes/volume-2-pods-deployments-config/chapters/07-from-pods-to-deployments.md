## From Pods to Deployments

Bare Pods have three problems:

1. If the Pod dies, nothing replaces it
2. If you want 5 copies, you write 5 Pods with 5 names
3. Updating means deleting and recreating — downtime

Kubernetes solves this in two layers.

```text
Deployment    → manages versions and rollouts
     ↓
ReplicaSet    → keeps N identical Pods running
     ↓
Pod           → runs your containers
```

**ReplicaSet** has one job: keep exactly N Pods matching a label selector. That is the reconciliation loop from Volume 0.

**Deployment** manages ReplicaSets. When you change the image, it creates a *new* ReplicaSet and gradually shifts Pods from old to new. The old ReplicaSet stays around with zero Pods — which is exactly how rollback works.

You almost never create a ReplicaSet yourself. You create a Deployment and let it manage them.

In the analogy: the **Deployment is the building manager**. You say "keep 3 rooms occupied with this type of tenant". If a room becomes unusable, the manager arranges another. When you change the requirement, the manager moves tenants gradually rather than emptying the building.

### A Deployment, explained

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web              # which Pods this Deployment owns
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # how many extra Pods during an update
      maxUnavailable: 0     # how many may be missing during an update
  template:                 # ← this is a Pod definition
    metadata:
      labels:
        app: web            # MUST match the selector above
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
```

Fields that matter:

* **`replicas`** — how many Pods you want
* **`selector.matchLabels`** — ownership, by label, never by name
* **`template`** — the blueprint; everything under `template.spec` is Pod configuration
* **`strategy`** — how updates happen

The defaults for `maxSurge` and `maxUnavailable` are both 25%. Setting `maxUnavailable: 0` means capacity never drops during a rollout — a good default for user-facing services, at the cost of needing room for one extra Pod.

⚠️ `selector` is **immutable** after creation. If you get it wrong, you delete and recreate the Deployment.

