## Interview Revision

#### Level 1 — Fundamentals
**Q: What is Drift?**
A: Drift occurs when the actual state of the resources running in the Kubernetes cluster deviates from the desired state defined in the Git repository.

#### Level 2 — Practical
**Q: How do you prevent Argo CD from deleting a critical production database if the YAML is accidentally removed from Git?**
A: I would ensure that the specific resource has the annotation `argocd.argoproj.io/sync-options: Prune=false` or `helm.sh/resource-policy: keep`. This instructs Argo CD to leave the resource in the cluster even if it is removed from Git and Prune is enabled.

#### Level 3 — Scenario Based
**Q: "We have an incident. A developer accidentally merged a commit that deletes the production namespace. Prune is enabled. What happens, and how do we prevent this?"**
**How I should think:** How do we protect critical infrastructure from automated GitOps deletions?
**Answer:** Because Prune is enabled, Argo CD will execute the deletion and destroy the namespace and all its resources. To prevent this architecturally, we must use AppProjects. The AppProject should have a `clusterResourceBlacklist` that explicitly denies Argo CD the ability to delete Namespaces. We should also enforce branch protections in Git so destructive PRs require two senior approvals.

#### Level 4 — Senior Thinking
**Q: "Your company wants to implement Canary deployments (sending 10% of traffic to a new version, then 50%, then 100%). Can Argo CD do this natively? How would you design it?"**
**How I should think:** Argo CD just applies YAML. Progressive delivery requires an ecosystem tool.
**Answer:** Argo CD natively only does basic Kubernetes rolling updates. It applies the YAML and Kubernetes handles the rollout. To do true Canary traffic shifting, Argo CD is not enough on its own. I would introduce **Argo Rollouts** (or a tool like Flagger) alongside an Ingress controller or Service Mesh. Argo CD will still sync the YAML from Git, but the YAML will define a `Rollout` custom resource instead of a standard `Deployment`. The Argo Rollouts controller in the cluster will handle the mathematical traffic shifting and pause for health analysis, while Argo CD continues to ensure the configuration matches Git.

---

