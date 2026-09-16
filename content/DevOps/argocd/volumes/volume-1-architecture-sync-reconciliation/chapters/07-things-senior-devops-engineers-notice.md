## Things Senior DevOps Engineers Notice

1. **Self-Heal fights emergency fixes:** During a massive production outage, you might need to apply a hotfix using `kubectl` immediately to stop customer impact, while you write the Git commit. If Self-Heal is on, Argo CD will instantly undo your emergency fix. Senior engineers often temporarily disable auto-sync during P1 incidents, fix the issue, update Git, and then turn auto-sync back on.
2. **Prune is dangerous:** If someone accidentally deletes a folder in Git, Prune will immediately delete those resources in production. For critical stateful resources (like databases or PVCs), senior engineers use Kubernetes annotations (like `helm.sh/resource-policy: keep`) to protect them from Prune operations.
3. **The 3-Minute Polling Delay:** Argo CD polls Git every 3 minutes. In a fast-paced environment, waiting 3 minutes is annoying. In production, we configure GitHub Webhooks. When a developer pushes code, GitHub pings Argo CD, and the sync happens in 1 second.
4. **Controller CPU Spikes:** The Application Controller is doing a lot of work. If you have 500 Applications, comparing Git to the cluster every few seconds consumes heavy CPU. Platform teams monitor the Application Controller's performance strictly.

---

