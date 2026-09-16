## Final Project Review

Let's review the system you built. If an interviewer asks, *"Tell me about a GitOps system you designed,"* this is what you describe:

* **Repository Strategy:** I used a directory-based Kustomize approach (`base`, `overlays/staging`, `overlays/production`) on a single `main` branch to avoid branch drift and make environment promotion as simple as updating a file and committing.
* **Architecture:** I designed a Hub and Spoke architecture. Argo CD runs in a central Control Plane cluster and manages deployments to external Workload clusters (Staging and Production) securely using ServiceAccount bearer tokens.
* **Security & Isolation:** I implemented AppProjects to create security boundaries. The WebApp project strictly limits Argo CD to only pull from authorized Git repositories and only deploy to authorized namespaces in the remote clusters, preventing cross-tenant deployments.
* **Secrets Management:** I kept plaintext secrets out of Git by utilizing the External Secrets pattern, where Git only contains pointers to an external vault like AWS Secrets Manager.
* **Automation & Reliability:** I enabled Automated Sync with Prune and Self-Heal to ensure zero drift. For rollbacks, I strictly enforce `git revert` instead of UI-based rollbacks to maintain Git as the single source of truth.

---

