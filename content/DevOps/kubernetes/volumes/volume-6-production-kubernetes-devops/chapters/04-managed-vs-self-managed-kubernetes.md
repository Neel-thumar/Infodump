## Managed vs Self-Managed Kubernetes

Recall from Volume 1: the control plane is the API server, etcd, scheduler and controller manager. Someone has to run that. The question is who.

| | Self-managed | Managed (EKS, AKS, GKE) |
|---|---|---|
| Control plane | You install, upgrade, and secure it | The cloud provider runs it |
| etcd backups | Your responsibility entirely | Usually handled by the provider |
| Node upgrades | Fully your responsibility | Often assisted or automated |
| Cost | Infrastructure only, more engineering time | Control-plane fee, less operational burden |
| Flexibility | Full control over every component and version | Bound to what the provider supports |
| Typical choice | Regulated environments, on-prem, specific compliance needs | The large majority of teams |

Most companies in 2026 run managed Kubernetes, precisely because control-plane operations — the hardest and least differentiated part — get handled by someone whose whole job is exactly that. Self-managed clusters remain common where data must stay on-premises, where a specific compliance regime demands it, or inside platform teams building Kubernetes distributions for others.

**`kubeadm`** is the standard tool for bootstrapping a self-managed cluster — initialising the control plane, generating certificates, and joining worker nodes. Knowing it exists and roughly what it does is useful for interviews even if you never run it directly; most working engineers interact with Kubernetes exclusively through a managed control plane.

