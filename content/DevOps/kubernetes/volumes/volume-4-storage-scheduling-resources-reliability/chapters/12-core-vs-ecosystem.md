## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | PersistentVolume, PersistentVolumeClaim, StorageClass (the API objects), the scheduler, affinity/taints/tolerations, requests/limits, QoS, HPA, PodDisruptionBudget |
| **Project tooling** | Metrics server (commonly used, not bundled by default) |
| **Ecosystem** | CSI drivers (EBS CSI driver, Azure Disk CSI driver, etc.), Vertical Pod Autoscaler, Cluster Autoscaler |
| **Cloud provider** | The actual disks, the actual extra VMs added by cluster autoscaling |

The pattern repeats from earlier volumes: Kubernetes defines the **objects and the contract** — StorageClass, HPA, PDB — but the thing that does the physical work (attaching a real disk, launching a real VM) is always a separate, vendor-specific piece.

