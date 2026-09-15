## LAB 2 — Full Investigation From a Cold Start

### Goal

Practice the method on a problem you have not been told the cause of.

### Setup

```bash
kubectl create namespace debug-lab
kubectl config set-context --current --namespace=debug-lab
```

Deploy something deliberately broken across two layers at once, without reading the manifest closely first:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken
spec:
  replicas: 2
  selector:
    matchLabels:
      app: broken
  template:
    metadata:
      labels:
        app: broken-typo
    spec:
      containers:
        - name: web
          image: nginx:1.27
          readinessProbe:
            httpGet:
              path: /
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: broken
spec:
  selector:
    app: broken
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f broken.yaml
```

### Investigation

Follow the method. Do not read the YAML above again — work from evidence:

```bash
kubectl get deployment broken
kubectl get pods -l app=broken
kubectl get pods --show-labels
```

**What to observe:** `kubectl get deployment` shows 0/2 ready but 2 Pods reported by the ReplicaSet controller as "existing" — and yet filtering by `app=broken` shows nothing. That mismatch is itself a clue: check `--show-labels` and you will find the real label is `broken-typo`, not `broken`. This is the selector/template mismatch from Volume 1, appearing here as an actual bug to find rather than a demonstration.

Fix the label, then continue:

```bash
kubectl describe pod -l app=broken | tail -15
```

**What to observe:** the Pod is `Running` but the readiness probe targets port 8080, while nginx listens on 80. Events show repeated probe failures. The Pod never becomes Ready, so the Service never gets endpoints.

### Why this matters

Two independent, realistic mistakes, stacked — exactly like a real incident, where the first thing you find is not always the only thing wrong. The method (evidence, one layer at a time) finds both; guessing usually fixes one and declares victory too early.

### Cleanup

```bash
kubectl delete namespace debug-lab
```

