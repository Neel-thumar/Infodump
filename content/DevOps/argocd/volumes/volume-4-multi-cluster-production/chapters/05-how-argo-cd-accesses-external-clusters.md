## How Argo CD Accesses External Clusters

This is a common interview question: *"How does Argo CD talk to a cluster it is not running in?"*

1. When you register a new cluster, Argo CD creates a `ServiceAccount` (usually named `argocd-manager`) inside the **remote** cluster.
2. It binds a `ClusterRole` to this ServiceAccount, giving it admin permissions over that remote cluster.
3. It generates a long-lived authentication token for that ServiceAccount.
4. It brings that token back to the **Control Plane** cluster and saves it in a Kubernetes `Secret` inside the `argocd` namespace.
5. When the Application Controller needs to sync the remote cluster, it reads the Secret, extracts the token, and makes a secure HTTPS call to the remote cluster's API server.

---

