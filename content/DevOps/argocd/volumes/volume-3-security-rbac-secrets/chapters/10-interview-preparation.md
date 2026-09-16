## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is the purpose of an AppProject in Argo CD?**
A: An AppProject provides logical grouping and security restrictions for Applications. It defines which Git repositories can be used, which target clusters and namespaces can be deployed to, and which Kubernetes resources are allowed or denied.

**Q: Why shouldn't we store Kubernetes Secrets directly in a GitOps repository?**
A: Standard Kubernetes Secrets are only base64 encoded, not encrypted. Anyone with read access to the Git repository can decode the secrets and compromise the infrastructure.

#### Level 2 — Practical

**Q: How do you handle secrets in a GitOps workflow?**
A: We use external secret management systems. A common approach is the External Secrets Operator. We commit an `ExternalSecret` manifest to Git, which acts as a pointer. Argo CD syncs the pointer to the cluster, and the operator securely fetches the actual secret value from a provider like AWS Secrets Manager or HashiCorp Vault to create the native Kubernetes Secret.

#### Level 3 — Scenario Based

**Q: "A new developer joined Team A. They created an Argo CD Application for a new microservice, but the Argo CD UI says 'Sync Failed: destination namespace is not permitted'. What is the problem and how do you fix it?"**
**How I should think:** The Application Controller is enforcing a boundary. Check the AppProject.
**Answer:** The Application is assigned to an AppProject that has a restricted list of allowed destination namespaces, and the developer's target namespace is not on that list. To fix it, a platform engineer must update the `AppProject` manifest in Git to add the new namespace to the `destinations` list, and then sync the AppProject.

#### Level 4 — Senior Thinking

**Q: "If someone gains admin access to your Argo CD UI, what is the worst they can do, and how would you mitigate this architecturally?"**
**How I should think:** UI admin means they can create any Application, bypassing Git branch protections.
**Answer:** An attacker with Argo CD admin access could create a rogue Application pointing to their own malicious Git repository and deploy privileged pods to take over the cluster. To mitigate this, we enforce strict AppProjects that only allow company-owned Git repositories, deny cluster-scoped resource creation (like ClusterRoles), and implement SSO with strict RBAC so nobody shares the local 'admin' account. Additionally, we restrict Argo CD's own Kubernetes Service Account so it cannot modify critical system namespaces like `kube-system`.

---

*This concludes Volume 3. You have now secured your GitOps pipeline with Projects and learned how to handle secrets declaratively. In Volume 4, things get serious as we introduce multi-cluster architecture and deploy our application across different Kubernetes clusters from a single Argo CD control plane.*