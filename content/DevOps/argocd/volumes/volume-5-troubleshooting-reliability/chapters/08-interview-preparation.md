## Interview Preparation

#### Level 1 — Fundamentals

**Q: If an Argo CD Application shows "Synced" but "Degraded", what does this mean?**
A: It means the desired state from Git was successfully applied and accepted by the Kubernetes API (Synced), but the resources themselves are failing to run correctly in the cluster, such as a Pod crashing in an ImagePullBackOff (Degraded).

**Q: What is the correct way to perform a rollback in a GitOps environment?**
A: The correct way is to revert the commit in the Git repository (e.g., using `git revert`) and push it. Argo CD will detect the reverted state in Git and automatically sync the cluster back to the previous known-good state.

#### Level 2 — Practical

**Q: An Application is failing to sync with a "Manifest generation error". Which Argo CD component is likely failing, and why?**
A: The Repository Server is failing. This usually happens because there is a syntax error in the source manifests (like a bad Helm template or missing Kustomize file). The failure happens in memory before Kubernetes is even contacted.

**Q: You see an Application is "OutOfSync" but "Healthy". Auto-sync is enabled. What is a likely cause?**
A: Someone made a manual change to the cluster using `kubectl` (creating drift), but `selfHeal` is not enabled in the Argo CD sync policy, so Argo CD is reporting the drift without fixing it. The application itself is still running fine (Healthy).

#### Level 3 — Scenario Based

**Q: "Production is down. A bad commit was merged. You click 'Rollback' in the Argo CD UI to restore the previous version. Production is fixed. Two hours later, a developer merges a typo fix to the README. Suddenly, production crashes again with the same error. What happened?"**
**How I should think:** How does the UI Rollback affect Auto-Sync and the Git source of truth?
**Answer:** When you use the Argo CD UI Rollback button, it pauses Auto-Sync. The bad code was still sitting in the `main` branch of Git. When the developer merged the README fix, they created a new commit. The team likely re-enabled Auto-Sync or manually synced the new commit, which pulled in the README fix *along with the bad code that was still in the branch*. In GitOps, you must fix the code in Git via `git revert`.

#### Level 4 — Senior Thinking

**Q: "You are designing an alerting system for a multi-cluster Argo CD setup. What specific Argo CD metrics or events would you alert on to prevent silent deployment failures?"**
**How I should think:** Don't just alert on Pods crashing. Alert on the GitOps machinery breaking.
**Answer:** I would not rely solely on Kubernetes pod metrics. I would alert on Argo CD specific metrics exported to Prometheus:

1. Applications stuck in `OutOfSync` for more than 15 minutes (indicating a failing sync).
2. Applications in a `Degraded` health state.
3. High error rates from the `argocd-repo-server` (indicating Git authentication failures or widespread rendering issues).
4. `argocd-application-controller` work queue depth; if the controller is overwhelmed and falling behind on reconciling, developers will experience silent deployment delays.

---

*This concludes Volume 5. You now possess a solid troubleshooting framework to debug and recover failing GitOps deployments. In our final volume, Volume 6, we will tie everything together into a complete Production GitOps review, checklist, and advanced system design interview mastery.*