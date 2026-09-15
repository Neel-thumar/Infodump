## The Object Model — How to Read Any YAML

Every Kubernetes object, without exception, has the same four top-level parts.

```yaml
apiVersion: apps/v1        # which API group and version
kind: Deployment           # what type of object
metadata:                  # name, namespace, labels, annotations
  name: web
spec:                      # WHAT YOU WANT
  replicas: 3
status:                    # WHAT ACTUALLY EXISTS (Kubernetes writes this)
```

### apiVersion

Which part of the Kubernetes API this object belongs to.

* `v1` — the original core group (Pod, Service, ConfigMap, Secret, Namespace)
* `apps/v1` — workloads (Deployment, StatefulSet, DaemonSet, ReplicaSet)
* `batch/v1` — Job, CronJob
* `networking.k8s.io/v1` — Ingress, NetworkPolicy

Never guess this. Ask the cluster:

```bash
kubectl api-resources
```

### kind

The type of object. Always capitalised: `Pod`, `Deployment`, `Service`.

### metadata

Identity and organisation: `name`, `namespace`, `labels`, `annotations`.

A name must be unique **for that kind, in that namespace**. You can have a Pod named `web` and a Service named `web` in the same namespace — no conflict.

### spec vs status — the most important distinction

**You write `spec`. Kubernetes writes `status`.**

`spec` is your desired state. `status` is observed reality. Controllers exist to make status match spec.

```bash
kubectl get pod <name> -o yaml
```

Look at the output — you will see your small `spec` and a much bigger `status` full of things you never typed: the Pod IP, the node name, conditions, container states. All of that was written by Kubernetes, not by you.

This is why editing `status` by hand is pointless. A controller will overwrite it within seconds.

### A realistic example, field by field

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # which Pods this Deployment owns
  template:             # the Pod blueprint
    metadata:
      labels:
        app: web        # must match the selector above
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
```

Two fields deserve attention because they confuse everybody:

**`selector.matchLabels`** — how the Deployment finds the Pods it owns. Not by name. By label.

**`template`** — this is a Pod definition inside a Deployment. Everything under `template.spec` is Pod configuration. This is why Pod knowledge is never wasted; it appears inside every workload type.

And the rule that trips up beginners: **the labels in `template.metadata.labels` must match `selector.matchLabels`.** If they do not, the Deployment creates Pods and then cannot see them, so it creates more, forever.

