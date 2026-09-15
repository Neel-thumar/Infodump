## Namespaces — Dividing the Complex

A namespace is a separate area inside one cluster. In our analogy, the cluster is the apartment complex and a namespace is one apartment — your team's own space.

```bash
kubectl get namespaces
```

Every new cluster has these:

| Namespace | Purpose |
|---|---|
| `default` | Where things go if you do not say otherwise |
| `kube-system` | Kubernetes' own components — do not put your apps here |
| `kube-public` | Readable by everyone, rarely used |
| `kube-node-lease` | Internal node heartbeats |

Namespaces give you:

* **Organisation** — `dev`, `staging`, `team-payments`
* **Name reuse** — every team can have a Deployment called `api`
* **Access control** — RBAC rules can be limited to one namespace
* **Resource limits** — quotas can be applied per namespace

What namespaces do **not** give you: network isolation. By default a Pod in `dev` can reach a Pod in `prod` over the network. Namespaces are not a security boundary on their own — you need NetworkPolicy for that, which we cover in Volume 3. This misunderstanding causes real incidents.

Also note: some things are **cluster-scoped** and live outside namespaces entirely — Nodes, Namespaces themselves, PersistentVolumes, ClusterRoles.

```bash
kubectl api-resources --namespaced=false
```

