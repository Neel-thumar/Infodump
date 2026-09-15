## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | RBAC objects (Role, RoleBinding, ClusterRole, ClusterRoleBinding), ServiceAccount, Secret, SecurityContext, Pod Security Admission, Events, the metrics API that `kubectl top` reads |
| **Project tooling** | Metrics server |
| **Ecosystem** | Prometheus, Grafana, log-shipping agents (Fluent Bit, Fluentd), Vault and External Secrets Operator, image scanners (Trivy), policy engines (Kyverno, OPA/Gatekeeper) |
| **Cloud provider** | Managed identity/OIDC integration, managed logging and monitoring services |

The recurring theme of this whole guide shows up clearly here: Kubernetes gives you the **primitives** — RBAC, SecurityContext, an events API, a logs API — and the ecosystem builds the **operational systems** on top of them. Knowing this boundary is what lets you evaluate a new tool quickly: does it replace a Kubernetes primitive, or does it consume one?

