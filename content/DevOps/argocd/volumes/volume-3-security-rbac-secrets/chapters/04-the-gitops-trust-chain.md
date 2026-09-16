## The GitOps Trust Chain

In traditional CI/CD, the CI server (Jenkins/GitLab) held the keys to the cluster. In GitOps, the trust model changes. 

**Git -> Argo CD -> Kubernetes**

1. **Git is the new attack surface:** If an attacker gains write access to your Git repository, they can change the desired state (e.g., adding a crypto-mining container). Argo CD will happily sync it. Therefore, branch protection rules (requiring PR approvals) in GitHub are actually a Kubernetes security boundary.
2. **Argo CD is a highly privileged agent:** Argo CD needs permissions to create Deployments, Services, and Namespaces. We must restrict *what* Argo CD is allowed to do on behalf of specific Git repositories.

---

