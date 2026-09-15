## Rolling Updates and Rollbacks

When you change the Pod template, the Deployment starts a rollout:

```text
Old ReplicaSet: 3 Pods        New ReplicaSet: 0 Pods
        ↓                              ↓
Old: 3                        New: 1   (start one new Pod)
Old: 2                        New: 1   (new Pod ready → remove one old)
Old: 2                        New: 2
...
Old: 0                        New: 3   (rollout complete)
```

The key sentence: **a new Pod must become Ready before an old one is removed.** Readiness is decided by your readiness probe. If you have no readiness probe, Kubernetes assumes a started container is ready — which is how teams ship broken releases with a green rollout.

Commands you will use constantly:

```bash
kubectl rollout status deployment/web      # wait and watch
kubectl rollout history deployment/web     # list revisions
kubectl rollout undo deployment/web        # back to previous revision
kubectl rollout undo deployment/web --to-revision=2
kubectl rollout restart deployment/web     # recreate all Pods (e.g. to pick up new config)
```

`kubectl rollout restart` is genuinely useful — it does a normal rolling restart without changing anything in the spec.

