## Production GitOps Checklist

Before deploying Argo CD to a real production environment, senior engineers verify this checklist:

* **High Availability:** Is Argo CD installed using the HA manifests? Are Redis HA and Controller Sharding enabled?
* **Disaster Recovery:** Is the Argo CD configuration itself managed by GitOps (App of Apps pattern)? If the control plane cluster burns down, can I restore Argo CD and its cluster connections in 5 minutes?
* **Access Control:** Is SSO (Okta/Azure AD) configured? Is the local `admin` user disabled or the password rotated and locked in a vault?
* **Least Privilege:** Does the Argo CD application-controller run with restricted RBAC, or does it still have dangerous `cluster-admin` rights?
* **AppProjects:** Is the `default` AppProject locked down? Does every team have their own isolated AppProject?
* **Observability:** Are Argo CD Prometheus metrics scraped? Do we have alerts for Applications stuck in `Degraded` or `OutOfSync` states?
* **Webhooks:** Is the Git repository configured to send webhooks to Argo CD, avoiding the 3-minute polling delay?

---

