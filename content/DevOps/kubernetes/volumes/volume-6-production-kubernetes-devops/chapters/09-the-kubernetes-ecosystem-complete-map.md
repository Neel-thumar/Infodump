## The Kubernetes Ecosystem — Complete Map

This is the map this whole guide has been building toward, piece by piece. Here it is together.

### Kubernetes Core

Defined and shipped by the Kubernetes project itself: the API server, etcd, scheduler, controller manager, kubelet; Pods, Deployments, Services, ConfigMaps, Secrets, RBAC, NetworkPolicy, PV/PVC, HPA, CRDs.

### Official / Common Kubernetes Tooling

Maintained by the project or expected on essentially every cluster: `kubectl`, `kubeadm`, `kube-proxy`, CoreDNS, the metrics server.

### Kubernetes Ecosystem

Built around Kubernetes, chosen independently, each replaceable by an alternative:

| Category | Tools |
|---|---|
| Packaging manifests | Helm, Kustomize |
| Continuous delivery | Argo CD, Flux |
| Networking (CNI) | Cilium, Calico, Flannel |
| Service mesh | Istio, Linkerd |
| Observability | Prometheus, Grafana, OpenTelemetry |
| Policy enforcement | Kyverno, OPA/Gatekeeper |
| Backup | Velero |
| Secrets sync | External Secrets Operator, Vault |

### Cloud Provider Technology

EKS, AKS, GKE and their specific integrations: managed load balancers, IAM-based authentication, managed disks and their CSI drivers, managed logging.

### The one-sentence test

For any tool someone mentions in a Kubernetes conversation, ask: **is this shipped and defined by the Kubernetes project, or is it something you separately chose to install on top?** If it's the latter, it's ecosystem — useful, sometimes essential, but never assume every cluster has it, and never confuse its behaviour with Kubernetes' own.

