## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is GitOps?**
A: GitOps is a methodology where a Git repository is the single source of truth for declarative infrastructure and applications. A software agent continuously ensures the actual state of the cluster matches the desired state stored in Git.

**Q: What is the difference between Desired State and Actual State?**
A: Desired state is the configuration written in Git (how the system *should* be). Actual state is what is currently running in the Kubernetes cluster (how the system *is*).

**Q: What is Reconciliation?**
A: Reconciliation is the continuous loop where a tool like Argo CD checks the desired state against the actual state, and applies changes to the cluster to eliminate any differences.

#### Level 2 — Practical

**Q: What is an Argo CD Application?**
A: It is a Kubernetes Custom Resource defined by Argo CD. It acts as the mapping between a Git repository (the source) and a Kubernetes namespace (the destination).

**Q: How does Argo CD differ from a Jenkins deployment pipeline?**
A: Jenkins uses a push-based model. It runs a script when triggered, pushes YAML to the cluster, and stops. Argo CD uses a pull-based model. It lives inside the cluster, continuously monitors Git, pulls the configuration, and constantly guards against manual drift.

#### Level 3 — Scenario Based

**Q: "An engineer says they updated the image version in a Deployment, but Argo CD says it is OutOfSync. What likely happened?"**
**How I should think:** How was the change made? If it's OutOfSync, the cluster doesn't match Git.
**Answer:** The engineer likely used `kubectl set image` or `kubectl edit` directly on the cluster instead of updating the Git repository. Argo CD detected that the actual cluster state has drifted away from the approved desired state in Git, causing the OutOfSync warning.
**Why:** GitOps mandates that all changes go through Git. Manual cluster changes cause drift.

#### Level 4 — Senior Thinking

**Q: "Why is a pull-based GitOps model considered more secure than traditional CI/CD?"**
**How I should think:** Focus on network boundaries, credential storage, and blast radius.
**Answer:** In a traditional CI/CD push model, the external CI server needs high-privilege credentials to access the production Kubernetes API. If the CI server is compromised, the attacker has cluster admin access. In a pull-based GitOps model, the cluster reaches out to fetch changes. The CI server does not need cluster credentials, and the cluster's ingress API doesn't need to be exposed to external build tools. The trust boundary is contained within the cluster itself.