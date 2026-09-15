## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | Pod, ReplicaSet, Deployment, StatefulSet, DaemonSet, Job, CronJob, ConfigMap, Secret, probes, init and sidecar containers |
| **Project tooling** | `kubectl` and its `rollout`, `set image`, `create secret` helpers |
| **Ecosystem** | Helm and Kustomize (templating manifests), Argo CD and Flux (delivering them), External Secrets Operator, Vault |
| **Cloud provider** | Managed registries (ECR, ACR, Artifact Registry), cloud secret managers |

A Deployment is Kubernetes. A Helm chart that produces a Deployment is not. When something is wrong, always debug the object in the cluster, not the template that generated it.

