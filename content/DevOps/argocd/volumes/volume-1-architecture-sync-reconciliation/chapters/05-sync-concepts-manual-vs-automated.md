## Sync Concepts: Manual vs Automated

In GitOps, there are strict definitions for how the building is updated to match the blueprint.

**Manual Sync**
Argo CD detects drift but does nothing. It waits for a human to click "Sync" or run an Argo CD CLI command. We used this in Volume 0.

**Automated Sync**
When a developer pushes a new commit to Git, Argo CD automatically applies the new YAML to the cluster. 

**Self-Heal**
What if nobody touched Git, but someone manually deleted a Pod or changed a Service port using `kubectl`? Automated Sync only triggers on Git changes. **Self-Heal** tells Argo CD to also trigger a sync if the *cluster* changes and drifts away from Git. It reverts manual changes.

**Prune**
If you delete `service.yaml` from your Git repository, what should Argo CD do? By default, Argo CD will leave the Service running in the cluster (to prevent accidental deletions). If you enable **Prune**, Argo CD will actively delete resources in the cluster that no longer exist in Git.

---

