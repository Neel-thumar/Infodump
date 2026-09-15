## The Two Halves of a Cluster

Every Kubernetes cluster has two parts.

```text
┌─────────────────── CONTROL PLANE ───────────────────┐
│  kube-apiserver   etcd   kube-scheduler             │
│  kube-controller-manager   (cloud-controller-mgr)   │
└─────────────────────────────────────────────────────┘
                         ▲
                         │  (nodes talk to the API server)
                         ▼
┌──────── NODE ────────┐  ┌──────── NODE ────────┐
│ kubelet              │  │ kubelet              │
│ kube-proxy           │  │ kube-proxy           │
│ container runtime    │  │ container runtime    │
│   → your Pods        │  │   → your Pods        │
└──────────────────────┘  └──────────────────────┘
```

In our apartment analogy: the **control plane is the management office**, and the **nodes are the buildings** where people actually live.

One thing surprises everybody: **the components do not talk to each other.** The scheduler does not call the kubelet. The controller manager does not call the scheduler. They all read from and write to the API server, and that is the only conversation happening.

