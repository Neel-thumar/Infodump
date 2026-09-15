## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| RBAC | Often `cluster-admin` for convenience | Least privilege per team/namespace, reviewed periodically |
| ServiceAccount tokens | Default, auto-mounted everywhere | `automountServiceAccountToken: false` unless genuinely needed |
| Secrets | Plain `kubectl create secret` | Encryption at rest enabled, often synced from an external manager |
| Pod security | Rarely configured in labs | Enforced via Pod Security Standards at the namespace level |
| Logs | Read with `kubectl logs`, then gone | Shipped centrally; retained independently of Pod lifecycle |
| Metrics | `kubectl top`, a live snapshot only | A real time-series pipeline with alerting and history |
| Incident response | Manual investigation | Runbooks built around the same layer-by-layer method |

