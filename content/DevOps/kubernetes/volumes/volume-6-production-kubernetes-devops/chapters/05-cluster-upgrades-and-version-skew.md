## Cluster Upgrades and Version Skew

Kubernetes ships a new minor version roughly every four months, and — this is the number to actually know, not a guess — the project supports the **three most recent minor releases** at any time, each for about a year of patch support. That means you are expected to upgrade a production cluster a few times a year, not once every few years.

### Version skew policy

Components are allowed to be at different versions during an upgrade, but only within specific limits:

* The API server can be **up to 2 minor versions newer** than a kubelet
* `kube-proxy` should match its node's kubelet version
* `kubectl` can be one minor version older or newer than the API server

The practical consequence: **you upgrade the control plane before the nodes**, never the other way around, and you do it one minor version at a time — you cannot jump from 1.30 straight to 1.33.

```text
Upgrade order:
etcd  →  control plane (API server, scheduler, controller manager)  →  nodes (kubelet, kube-proxy)  →  kubectl
```

### What actually goes wrong during upgrades

**API deprecations.** Kubernetes removes old API versions on a schedule. A manifest still using a removed `apiVersion` will be rejected outright after the removal — not deprecated-with-a-warning, actually rejected. Before any upgrade, check for deprecated APIs in use:

```bash
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis
```

**CRD and webhook compatibility.** Anything extending the API (Volume 5's admission webhooks, custom resources from operators) must also support the new version. This is frequently the actual blocker in upgrades, not Kubernetes itself.

**Node upgrades need the same care as any maintenance.** This is exactly where the PodDisruptionBudgets from Volume 4 matter — draining a node for a kubelet upgrade is a voluntary disruption, and a PDB stops it from taking your application down.

