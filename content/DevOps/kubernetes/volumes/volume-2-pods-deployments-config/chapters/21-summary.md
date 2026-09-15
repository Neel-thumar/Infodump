## Summary

| Concept | One line |
|---|---|
| Pod | Smallest unit; containers sharing one IP, scheduled together |
| ReplicaSet | Keeps N Pods matching a label selector |
| Deployment | Manages ReplicaSets to give safe updates and rollbacks |
| Rolling update | New Pod must be Ready before an old one is removed |
| Rollback | Instant, because the old ReplicaSet still exists |
| ConfigMap | Non-secret config; env vars never update, mounted files do |
| Secret | Same idea for sensitive data; base64 only — RBAC is the real protection |
| Readiness | Controls traffic |
| Liveness | Controls restarts |
| Startup | Protects slow starters from liveness |

