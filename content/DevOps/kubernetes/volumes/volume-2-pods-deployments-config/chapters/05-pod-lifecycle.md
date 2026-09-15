## Pod Lifecycle

A Pod has a **phase** — a simple summary of where it is.

| Phase | Meaning |
|---|---|
| `Pending` | Accepted, but not running yet — waiting for scheduling, image pull, or volumes |
| `Running` | Bound to a node, at least one container is running |
| `Succeeded` | All containers exited successfully and will not restart |
| `Failed` | All containers stopped and at least one failed |
| `Unknown` | Kubernetes lost contact with the node |

Phase is a summary. The detail is in the **container statuses**, which is what you read in `kubectl describe`: `Waiting`, `Running`, `Terminated`, with a reason like `CrashLoopBackOff` or `OOMKilled`.

### restartPolicy

This applies to containers **inside** the Pod, not to the Pod itself.

| Value | Behaviour | Used by |
|---|---|---|
| `Always` | Restart the container whenever it exits, success or not | Deployments (required) |
| `OnFailure` | Restart only on non-zero exit | Jobs |
| `Never` | Never restart | One-shot tasks |

Important: **Kubernetes never restarts a Pod.** It restarts containers inside it, or it replaces the whole Pod with a new one. A Pod object is never resurrected once destroyed.

### How a Pod shuts down

You should know this, because it explains failed deployments and dropped requests.

```text
Pod marked for deletion
      ↓
Pod removed from Service endpoints (stops receiving new traffic)
      ↓
SIGTERM sent to the container
      ↓
Grace period (terminationGracePeriodSeconds, default 30s)
      ↓
Still running? SIGKILL — forced
```

If your application ignores SIGTERM, every deployment drops in-flight requests. Handling SIGTERM and shutting down cleanly is an **application** responsibility that Kubernetes exposes.

