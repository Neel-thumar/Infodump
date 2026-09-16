## Things Senior DevOps Engineers Notice

1. **Helm vs. Kustomize in GitOps:** Helm was built as a package manager (like `apt` or `yum`). Kustomize was built as a configuration overlay tool. GitOps teams often combine them: they use a third-party Helm chart (like Prometheus) as a `base`, and use Kustomize to patch the Helm output for different environments. Argo CD supports this natively.
2. **Promoting Code vs. Configuration:** In GitOps, you build your Docker image *once* in CI. To promote from Staging to Production, you do not rebuild the image. You simply update the `imageTag` in the `overlays/production` folder and commit. The Git commit *is* the promotion.
3. **The Danger of Non-Deterministic Templates:** If your Helm chart uses random string generators (like generating a random password on the fly inside the template), Argo CD will break. Every time Argo CD polls Git and renders the template, the password will change. Argo CD will see this as Drift and constantly sync in an infinite loop. Templates must be 100% deterministic (reproducible).

---

