## LAB 1 — See a Version Deprecation and Practice a Restore Concept

### Goal

Directly observe deprecated API usage, and understand a restore path without needing a multi-node cluster to prove it.

### Setup

Your `kind` cluster.

### Part A — Deprecated API detection

```bash
kubectl api-versions | grep networking
kubectl get --raw /metrics 2>/dev/null | grep apiserver_requested_deprecated_apis || echo "none found in this short-lived cluster"
```

**What to observe:** in a long-running production cluster, this metric fills up with real evidence of exactly which old manifests need updating before the next upgrade — this is the actual command teams run before scheduling an upgrade window.

### Part B — Object backup and restore, conceptually

```bash
kubectl create namespace restore-demo
kubectl create deployment demo --image=nginx:1.27 --replicas=2 -n restore-demo
kubectl get all -n restore-demo -o yaml > backup.yaml
kubectl delete namespace restore-demo
kubectl apply -f backup.yaml
kubectl get all -n restore-demo
```

**What to observe:** everything comes back, because you captured the object definitions before deleting them. This is a simplified version of exactly what Velero automates properly at scale, including volume snapshots — but the core idea is the same: **object definitions are data, and losing them without a backup is losing the ability to recreate anything.**

**Why this matters:** most engineers understand backing up a database instinctively but forget that the Kubernetes objects describing their entire application are equally irreplaceable without a backup.

### Cleanup

```bash
kubectl delete namespace restore-demo
rm backup.yaml
```

