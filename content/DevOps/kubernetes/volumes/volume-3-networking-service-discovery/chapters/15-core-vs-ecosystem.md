## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | Service, EndpointSlice, NetworkPolicy (the API objects), the Kubernetes networking model itself |
| **Project tooling** | CoreDNS, `kube-proxy` |
| **Ecosystem** | NGINX Ingress Controller, Traefik, Calico, Cilium — anything that actually *enforces* NetworkPolicy or *implements* Ingress/Gateway API |
| **Cloud provider** | The real load balancer behind a `LoadBalancer` Service; managed DNS |

The single most important boundary in this volume: **Kubernetes defines what NetworkPolicy and Ingress mean. It does not enforce or implement either.** That is always a separate plugin you chose and installed.

