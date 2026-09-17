## What to learn next

**Immediately useful:**
- **Kubernetes** — if you deploy there, deployment strategies become concrete objects rather than concepts.
- **Infrastructure as Code** (Terraform/OpenTofu) — environments become reproducible; the same pipeline discipline applies to infrastructure.
- **Observability** — metrics, logs, traces, SLOs. Verification and canary are only as good as your signal.

**To deepen delivery engineering:**
- **GitOps** — the desired state lives in Git, and an agent reconciles the cluster toward it. Changes deployment's shape: the pipeline updates a manifest rather than pushing to production directly.
- **Progressive delivery and feature flags** — decoupling deploy from release.
- **Supply-chain security** — SBOMs, artifact signing, provenance attestations, SLSA levels.
- **Advanced GitLab** — CI/CD components and the catalog, merge trains, dynamic child pipelines, parent-child architectures for monorepos.

**The discipline underneath:** DORA metrics, *Accelerate*, and *Continuous Delivery* by Humble and Farley — which is where most of this volume's reasoning originally comes from.

---

