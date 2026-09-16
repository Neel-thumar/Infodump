## The Debugging Mindset: Asking the Right Questions

When an Application misbehaves, do not immediately look at the pods. Look at the Argo CD Application status and ask yourself a sequence of questions.

**1. Is it a Git/Repository access problem?**
*Symptom:* The Application cannot even fetch the blueprint.
*Component:* Repository Server.
*Cause:* The GitHub token expired, the repository was deleted, or the network is blocking GitHub.

**2. Is it a Manifest Rendering problem?**
*Symptom:* `Manifest generation error`.
*Component:* Repository Server.
*Cause:* A typo in `values.yaml`, a missing Kustomize patch, or invalid Helm syntax. Kubernetes hasn't even been contacted yet.

**3. Is it a Sync problem?**
*Symptom:* `Sync Failed`. The status is `OutOfSync`.
*Component:* Application Controller -> Kubernetes API.
*Cause:* Argo CD rendered the YAML perfectly, but the Kubernetes API rejected it. Why? The namespace might not exist, Argo CD might lack RBAC permissions, or you tried to modify an immutable field (like a Deployment selector).

**4. Is it a Health problem?**
*Symptom:* `Synced` (Green) but `Degraded` (Red).
*Component:* Kubernetes actual state.
*Cause:* Argo CD successfully gave the YAML to Kubernetes. Kubernetes accepted it. But the application itself is failing to run (e.g., `ImagePullBackOff`, `CrashLoopBackOff`, failing readiness probes).

---

