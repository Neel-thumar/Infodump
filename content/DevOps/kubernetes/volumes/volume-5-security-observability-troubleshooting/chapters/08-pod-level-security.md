## Pod-Level Security

Even with correct RBAC, a container can still do damage if it runs with more privilege on its host than it needs. **SecurityContext** controls this, at both the Pod and the container level.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
  containers:
    - name: app
      image: myapp:1.0
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
```

Key fields:

* **`runAsNonRoot` / `runAsUser`** — refuses to run as UID 0. Many container images default to root unless told otherwise; this is worth checking explicitly, not assuming.
* **`allowPrivilegeEscalation: false`** — stops a process from gaining more privileges than its parent had, closing off a common container-escape technique.
* **`readOnlyRootFilesystem: true`** — the container cannot write to its own filesystem at all, except explicitly mounted volumes. This alone blocks a large category of attacks that rely on writing a malicious file to disk.
* **`capabilities.drop: ["ALL"]`** — removes Linux capabilities the container almost certainly does not need (raw networking, kernel module loading, and so on), then you add back only the specific ones actually required.

### Pod Security Standards

Rather than hand-writing SecurityContext rules from scratch every time, Kubernetes defines three named levels, enforced cluster-wide (or per-namespace) through **Pod Security Admission**:

| Level | Meaning |
|---|---|
| `Privileged` | No restrictions — effectively opt-out |
| `Baseline` | Blocks known privilege-escalation paths, allows most normal workloads |
| `Restricted` | Heavily locked down — non-root required, no added capabilities, and more |

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: apps
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
```

This is a genuinely current, actively used feature — it replaced the older PodSecurityPolicy mechanism, which was removed from Kubernetes entirely. If you encounter PodSecurityPolicy in older material, know that it no longer exists in any currently supported Kubernetes version; Pod Security Standards is its replacement.

