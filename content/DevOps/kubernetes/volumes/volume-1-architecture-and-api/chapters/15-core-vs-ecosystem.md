## Core vs Ecosystem

| Category | Examples from this volume |
|---|---|
| **Kubernetes core** | API server, etcd, scheduler, controller manager, kubelet, the object model, namespaces, labels |
| **Kubernetes project tooling** | `kubectl`, `kube-proxy`, `kubeadm`, CoreDNS |
| **Ecosystem** | containerd, CRI-O, `kind`, `minikube`, Helm, Argo CD |
| **Cloud provider** | EKS, AKS, GKE and their load balancers and IAM integrations |

`kubectl` is a client, not the system. containerd is a runtime Kubernetes *uses*, not a part of it. Getting these boundaries right saves you from debugging the wrong thing.

