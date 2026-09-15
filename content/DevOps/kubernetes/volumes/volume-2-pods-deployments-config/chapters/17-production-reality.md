## Production Reality

| Topic | Learning setup | Production |
|---|---|---|
| Image tags | `nginx:latest` | Explicit versions or image digests |
| Applying changes | `kubectl apply` by hand | Git + a CD tool (Argo CD, Flux) — ecosystem, not core |
| Replicas | 1 | At least 2, spread across nodes and zones |
| Probes | Often skipped | Always present, with separate readiness and liveness endpoints |
| Resources | Not set | Requests and limits always set |
| Secrets | `kubectl create secret` | External secret manager synced in |
| Config changes | Edit and hope | Change in Git, then `rollout restart` |
| Rollback plan | "We'll figure it out" | `rollout undo` rehearsed, plus a revision history policy |

One production note on `revisionHistoryLimit`: a Deployment keeps old ReplicaSets so you can roll back, defaulting to 10. That is fine, but it means `kubectl get rs` gets noisy. Do not delete old ReplicaSets manually to tidy up — you are deleting your rollback path.

