## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is the difference between the Repository Server and the Application Controller in Argo CD?**
A: The Repository Server is responsible for communicating with Git, cloning repositories, and rendering manifests. The Application Controller is responsible for communicating with the Kubernetes API, comparing the rendered manifests against the live cluster state, and executing the sync.

**Q: What does Prune do in Argo CD?**
A: Prune allows Argo CD to delete resources in the Kubernetes cluster if their corresponding definitions are removed from the Git repository.

#### Level 2 — Practical

**Q: How does Automated Sync differ from Self-Heal?**
A: Automated Sync triggers a deployment when it detects a new commit in the Git repository. Self-Heal triggers a sync when it detects that the actual state in the Kubernetes cluster has drifted away from the desired state, even if Git has not changed.

**Q: If I want Argo CD to automatically apply Git changes but NOT delete resources if they are removed from Git, what should my configuration look like?**
A: You would enable Automated Sync but ensure `prune` is set to `false` (which is the default behavior if not explicitly enabled).

#### Level 3 — Scenario Based

**Q: "An engineer reports that they are trying to apply a temporary network policy using `kubectl apply` to block a malicious IP, but the policy keeps disappearing after a few seconds. What is happening?"**
**How I should think:** What mechanism undoes manual changes?
**Answer:** The namespace is likely managed by an Argo CD Application with `selfHeal: true` enabled. Argo CD sees a new network policy in the cluster that does not exist in Git, identifies it as drift, and prunes it to match the Git repository. The engineer must either commit the policy to Git or temporarily disable self-heal.

#### Level 4 — Senior Thinking

**Q: "We have 10,000 developers and 50 Kubernetes clusters. Our Argo CD Repository Server is constantly running out of memory. How would you investigate and fix this?"**
**How I should think:** The Repo Server caches Git. High memory means too much Git parsing or huge repos.
**Answer:** The Repository Server caches Git repositories and renders manifests. If memory is exhausted, we likely have monolithic repositories (mono-repos) that are too large, or we are running heavy Kustomize/Helm builds without enough caching. I would first scale the Repository Server replicas horizontally. Then, I would investigate splitting massive Git repositories into smaller, application-specific repositories to reduce the clone size, and ensure Redis is properly sized to handle the manifest caching.

---

*This concludes Volume 1. You now have a fully automated, self-healing GitOps pipeline. In Volume 2, we will move away from raw YAML and learn how to use Helm and Kustomize to manage multiple environments (Staging and Production) from the same Git repository.*