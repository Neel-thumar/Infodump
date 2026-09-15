## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| Control plane | One node, no redundancy | 3 API servers and 3 etcd members across failure zones |
| Who runs it | You | Usually a managed service (EKS, AKS, GKE) or a platform team |
| etcd backup | None | Scheduled snapshots, tested restores |
| Namespaces | Ad hoc | Per team or per environment, with quotas and RBAC |
| Access | `cluster-admin` | Least privilege, per namespace |
| `kubectl apply` by hand | Normal | Rare — changes come through Git and a CD tool |

On managed clusters you do not see the control-plane Pods at all, because the provider runs them for you. The architecture is identical; you just have no access to that half.

