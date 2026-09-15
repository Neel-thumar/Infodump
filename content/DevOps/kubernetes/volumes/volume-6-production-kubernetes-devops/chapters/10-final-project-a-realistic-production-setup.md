## Final Project: A Realistic Production Setup

This project pulls together the whole guide. Talk through it in an interview the way it's written here — decisions and reasoning, not just a YAML dump.

### Scenario

A small e-commerce checkout service needs to run reliably on Kubernetes: a stateless API, a Postgres database, internal-only in one environment, public-facing in another.

### Architecture decisions, with reasoning

**Workload type:** Deployment for the API (stateless, interchangeable Pods — Volume 2). StatefulSet for Postgres, because it needs stable identity and its own persistent storage (Volume 2 and Volume 4) — though in practice, many teams use a managed database service instead and avoid running stateful storage in Kubernetes at all; that trade-off is worth naming explicitly.

**Configuration:** non-secret settings in a ConfigMap, mounted as a volume so changes are visible without a rebuild (Volume 2). Database credentials in a Secret, mounted as a file rather than an environment variable, with RBAC restricting which ServiceAccounts can read it (Volume 5).

**Networking:** a `ClusterIP` Service in front of the API Pods, an Ingress (or Gateway API `HTTPRoute`, depending on what the platform already runs) exposing it externally with TLS, and a NetworkPolicy default-denying traffic into the `checkout` namespace except explicitly from the Ingress controller and explicitly allowing egress to CoreDNS (Volume 3).

**Resources and scheduling:** requests and limits set from measured usage, `Guaranteed` QoS deliberately chosen for the Postgres Pod, pod anti-affinity spreading API replicas across nodes, and an HPA scaling the API on CPU utilization within a sensible min/max (Volume 4).

**Reliability:** a PodDisruptionBudget on the API Deployment so node maintenance never drops below 2 available replicas (Volume 4).

**Security:** SecurityContext dropping all capabilities and requiring non-root on the API containers, Pod Security Standards set to `restricted` on the namespace, and `automountServiceAccountToken: false` on every Pod that never calls the Kubernetes API — which, here, is all of them (Volume 5).

**Deployment strategy:** rolling update for routine API changes; blue/green considered specifically for any release that changes the database schema, because a rolling update would otherwise run two schema-incompatible versions simultaneously (this volume).

**Observability and recovery:** logs shipped centrally rather than relying on `kubectl logs`, metrics feeding the HPA and a real monitoring pipeline, and etcd/object backups scheduled and periodically test-restored (Volume 5 and this volume).

### What this demonstrates in an interview

Not that you memorised YAML — that you can justify each decision against a real constraint (availability, security, cost, complexity) and that you know which parts are Kubernetes primitives versus ecosystem choices layered on top.

