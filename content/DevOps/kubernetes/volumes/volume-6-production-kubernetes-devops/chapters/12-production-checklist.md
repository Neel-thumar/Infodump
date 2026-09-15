## Production Checklist

Before running anything real in Kubernetes, check:

- [ ] Every container has resource requests and limits set from real measurement
- [ ] Readiness and liveness probes exist and check different things
- [ ] `automountServiceAccountToken: false` unless the Pod genuinely needs API access
- [ ] RBAC follows least privilege — no unreviewed `cluster-admin` bindings
- [ ] Secrets are not committed to Git, and encryption at rest is enabled
- [ ] A NetworkPolicy exists for the namespace, tested to confirm it does not also block DNS
- [ ] A PodDisruptionBudget protects anything user-facing
- [ ] Image tags are pinned, not `latest`
- [ ] etcd backups run on a schedule and have been test-restored at least once
- [ ] The rollback command has actually been rehearsed, not just known in theory
- [ ] Someone owns the cluster upgrade cadence and checks for deprecated APIs before each upgrade

