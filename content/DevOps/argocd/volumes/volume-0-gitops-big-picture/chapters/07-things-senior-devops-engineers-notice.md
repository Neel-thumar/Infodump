## Things Senior DevOps Engineers Notice

1. **Git is not a backup, it is the driver:** Beginners think GitOps is just storing YAML in Git as a backup. Senior engineers know GitOps is an active control loop. The repo *drives* the cluster state.
2. **Kubernetes becomes ephemeral compute:** Because everything about the cluster is defined in Git, if a node crashes or a cluster dies, you don't panic. You spin up a new cluster, point Argo CD at the same Git repo, and within minutes, the exact same environment is recreated.
3. **CI and CD are separated:** The build tool (GitHub Actions) only tests code and pushes a new image tag to Git. The delivery tool (Argo CD) only watches Git and updates Kubernetes. Separation of concerns prevents a compromised CI server from destroying production.
4. **The App of Apps pattern:** You noticed we ran `kubectl apply` to create the Argo CD Application itself. In advanced setups, even the Argo CD Application manifests are managed by Argo CD (an Application that syncs other Applications). We will get there later.
5. **No direct cluster access:** In a mature GitOps team, developers do not have `kubectl write` access to production. They only have Git access. This drastically simplifies security audits.

---

