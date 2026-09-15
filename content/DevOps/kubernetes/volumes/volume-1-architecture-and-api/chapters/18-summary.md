## Summary

| Concept | One line |
|---|---|
| Control plane | Decides what should happen |
| Node components | Make it happen |
| API server | The only door; everything goes through it |
| etcd | The cluster's memory; back it up |
| Scheduler | Chooses a node, nothing more |
| Controllers | Continuously fix the difference between spec and status |
| kubelet | Watches for its own work and runs it |
| Object model | `apiVersion`, `kind`, `metadata`, `spec`, `status` |
| Labels | How Kubernetes connects objects to each other |
| Namespaces | Organisation and access control — not network isolation |

