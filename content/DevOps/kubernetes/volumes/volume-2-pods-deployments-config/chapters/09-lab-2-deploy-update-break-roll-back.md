## LAB 2 — Deploy, Update, Break, Roll Back

### Goal

Perform a real zero-downtime update and recover from a bad release.

### Commands

```bash
kubectl create deployment web --image=nginx:1.26 --replicas=3
kubectl rollout status deployment/web
kubectl get rs
```

Update to a new version:

```bash
kubectl set image deployment/web nginx=nginx:1.27
kubectl rollout status deployment/web
kubectl get rs
```

Now deploy something broken:

```bash
kubectl set image deployment/web nginx=nginx:does-not-exist
kubectl get pods -w
```

Press Ctrl-C after ten seconds, then:

```bash
kubectl rollout status deployment/web --timeout=20s
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl get pods
```

### Expected result

After the first update, `kubectl get rs` shows two ReplicaSets — the old one at 0 Pods, the new one at 3.

With the broken image, you see a new Pod in `ImagePullBackOff` while **the three old Pods keep running and serving traffic**. `rollout status` times out instead of succeeding.

After `undo`, everything is healthy again within seconds.

### What to observe

The broken deployment did not cause an outage. The rollout stalled because the new Pod never became ready, so no old Pod was removed. This is the safety property of a rolling update, and it only works if `maxUnavailable` allows it and your readiness signal is honest.

Also notice: rollback was instant, because the old ReplicaSet still existed with the full old Pod template. Kubernetes did not need to look anything up.

### Why this matters

"How do you roll back a bad release?" is a guaranteed interview question, and the answer is one command — but you must be able to explain *why* it is instant.

### Cleanup

```bash
kubectl delete deployment web
```

