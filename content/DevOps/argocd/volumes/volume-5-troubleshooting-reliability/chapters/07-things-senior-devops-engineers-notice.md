## Things Senior DevOps Engineers Notice

1. **The UI Rollback Trap:** Argo CD has a "History and Rollback" button in the UI. If you click it, Argo CD will roll back the cluster, but it will **disable Auto-Sync**. This leaves your cluster and your Git repository permanently out of sync until a human intervenes. Senior engineers rarely use this button. They use `git revert` so the Git history accurately reflects the rollback, and Auto-Sync remains active.
2. **"Synced" tells you nothing about correctness:** A green "Synced" badge only means the blueprint was successfully handed to the builder. It does not mean the application is actually working, connected to the database, or serving traffic. Rely on the "Health" status and external observability tools (like Prometheus/Grafana) for correctness.
3. **Drift is a process failure:** If you are constantly relying on Argo CD's Self-Heal to revert manual `kubectl` changes, your problem is not technical; it is a human process problem. Engineers are bypassing Git because the GitOps pipeline is too slow, too strict, or they lack the knowledge to use it. Fix the pipeline speed, don't just rely on Self-Heal.
4. **Stuck in Pending:** If you deploy a StatefulSet and the persistent volume cannot be provisioned (e.g., AWS EBS limit reached), Argo CD will remain in a `Progressing` state indefinitely. You must configure timeouts or set up alerts for applications stuck in `Progressing` for more than 10 minutes.

---

