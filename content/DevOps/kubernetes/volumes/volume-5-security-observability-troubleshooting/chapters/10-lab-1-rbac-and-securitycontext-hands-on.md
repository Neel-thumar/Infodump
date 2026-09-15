## LAB 1 — RBAC and SecurityContext, Hands-On

### Goal

Grant a narrow, real permission, prove the boundary with `auth can-i`, and lock a Pod down properly.

### Setup

```bash
kubectl create namespace sec-lab
kubectl config set-context --current --namespace=sec-lab
```

### Commands

```bash
kubectl create serviceaccount viewer
kubectl auth can-i list pods --as=system:serviceaccount:sec-lab:viewer
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-viewer
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: viewer-binding
subjects:
  - kind: ServiceAccount
    name: viewer
    namespace: sec-lab
roleRef:
  kind: Role
  name: pod-viewer
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f role.yaml
kubectl auth can-i list pods --as=system:serviceaccount:sec-lab:viewer
kubectl auth can-i delete pods --as=system:serviceaccount:sec-lab:viewer
```

### Expected result

The first check fails — no permission yet. After applying the Role and RoleBinding, `list pods` succeeds and `delete pods` still fails.

### What to observe

You granted exactly two verbs. Nothing else became available — RBAC does not infer adjacent permissions.

### Part B — a locked-down Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: locked
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
  containers:
    - name: app
      image: nginx:1.27
      securityContext:
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

```bash
kubectl apply -f locked.yaml
kubectl get pod locked
kubectl describe pod locked | tail -15
```

### Expected result

The Pod actually fails to become `Ready` — nginx tries to write to its default paths and cannot, because of `readOnlyRootFilesystem`. This is deliberate: it shows you that real security settings have real consequences, and images often need small adjustments (writable volumes for specific paths) to run correctly under them.

### Why this matters

This is the honest version of Pod security — not just "add these settings and it works", but the actual friction a team meets when tightening a workload for the first time, and how to reason about it instead of reflexively loosening the settings back to defaults.

### Cleanup

```bash
kubectl delete namespace sec-lab
```

