## The Four Quadrants of GitOps Status

You must memorize the difference between Sync Status and Health Status.

| Sync Status | Health Status | What it means |
| :--- | :--- | :--- |
| **Synced** | **Healthy** | Perfect. The building matches the blueprint, and it is fully operational. |
| **Synced** | **Degraded** | **Health Failure:** Kubernetes accepted the YAML, but the Pods are crashing (e.g., bad code, missing database). |
| **OutOfSync** | **Healthy** | **Drift / Paused:** Someone changed the cluster manually, or you turned off Auto-Sync and pushed to Git. |
| **OutOfSync**| **Degraded** | **Total Failure:** The sync failed, and the currently running application is also broken. |

---

