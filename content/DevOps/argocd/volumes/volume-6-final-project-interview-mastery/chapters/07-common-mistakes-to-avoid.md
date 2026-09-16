## Common Mistakes to Avoid

1. **Mixing CI and CD:** Never put `kubectl apply` or `helm upgrade` in your GitHub Actions pipeline if you are using Argo CD. You will create a split-brain scenario where CI and Argo CD fight each other.
2. **The "UI Rollback" Trap:** Do not use the Argo CD UI to rollback. It pauses auto-sync. Always rollback via a Git revert.
3. **Huge Monorepos:** Do not put 500 microservices into one single Git repository. The Repository Server will crash trying to clone it. Split repositories logically by team or domain.
4. **Ignoring AppProjects:** Leaving everything in the `default` project in production is a massive security risk. 
5. **Panic-disabling Argo CD:** During an incident, junior engineers sometimes delete the Argo CD Application to stop it from syncing. This will trigger a Prune and delete the entire application from production. Pause the sync or disable Auto-Sync instead.

---

