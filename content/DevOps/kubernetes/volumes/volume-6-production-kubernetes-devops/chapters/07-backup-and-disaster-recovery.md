## Backup and Disaster Recovery

Two different things need protecting, and teams frequently only think of one.

**etcd** — the cluster's entire configuration: every object, every Secret, every Deployment definition. Lose this with no backup and you have lost the cluster's memory entirely, even if every workload keeps running for a while on residual kubelet state.

```bash
ETCDCTL_API=3 etcdctl snapshot save backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

On managed Kubernetes, the provider typically handles etcd backups as part of the control-plane service — one of the genuine conveniences of not self-managing.

**Application data and objects** — your actual PersistentVolumes, and the Kubernetes objects themselves (Deployments, ConfigMaps, Secrets) as a separate concern from etcd's raw internal format. Tools like **Velero** back up both Kubernetes object definitions and, with the right plugin, the underlying volume data — genuinely useful for "restore this whole namespace" or "migrate this application to a different cluster" scenarios, not just disaster recovery.

**RPO and RTO**, worth knowing by name for interviews:

* **RPO (Recovery Point Objective)** — how much data you can afford to lose, measured in time. "We back up etcd every 6 hours" means an RPO of up to 6 hours.
* **RTO (Recovery Time Objective)** — how long recovery is allowed to take before it is unacceptable.

A backup you have never restored from is not a backup — it is an unverified hope. Practising a restore, on a schedule, is what actually earns the term "disaster recovery."

