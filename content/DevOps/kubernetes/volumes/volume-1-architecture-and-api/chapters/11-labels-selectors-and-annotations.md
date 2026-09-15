## Labels, Selectors and Annotations

### Labels

Key-value pairs you attach to objects so you can find them later.

```yaml
metadata:
  labels:
    app: web
    env: production
    team: payments
```

Labels are not decoration. **They are how Kubernetes connects objects.** A Service finds its Pods by label. A Deployment finds its Pods by label. Nothing uses names for this.

### Selectors

A query over labels.

```bash
kubectl get pods -l app=web
kubectl get pods -l 'env in (staging,production)'
kubectl get pods -l app=web,env=production      # AND
kubectl get pods -l '!canary'                   # label not present
```

### Annotations

Also key-value pairs, but for **information**, not selection. You cannot query by annotation.

Use labels for things you want to find. Use annotations for things you want to record — a git commit, a contact email, configuration for an Ingress controller.

```yaml
metadata:
  annotations:
    contact: payments-team@example.com
    git-commit: 4f2a9c1
```

### The habit good teams build

Agree on a standard label set from day one and apply it everywhere:

```yaml
labels:
  app: checkout
  env: production
  team: payments
  version: "2.3.1"
```

Six months later, when someone asks "what is the payments team running in production?", you have an answer in one command instead of an afternoon.

