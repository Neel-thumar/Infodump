## Troubleshooting

Remember the rule from Volume 1: **`describe` tells you what Kubernetes tried to do; `logs` tells you what your application did.**

### CrashLoopBackOff

**Symptom:** the Pod restarts over and over, with increasing gaps between attempts.

**What it means:** the container starts, then exits. Kubernetes restarts it, waits longer each time (roughly 10s, 20s, 40s… capped around 5 minutes). `CrashLoopBackOff` is the *waiting* state, not the crash itself.

**Investigation:**

```bash
kubectl describe pod <name>              # exit code and restart count
kubectl logs <name>                      # current attempt
kubectl logs <name> --previous           # the attempt that actually failed ← key command
```

**Common causes:**

| Exit code / clue | Likely cause |
|---|---|
| Exit 1 with a stack trace | Application error — missing config, bad connection string |
| Exit 0 immediately | Container has no long-running process (common with base images) |
| Exit 137 | Killed — usually OOM, check `describe` for `OOMKilled` |
| Exit 127 | Command not found — wrong `command` or entrypoint |
| Crashes only after some seconds | Failing liveness probe, not a crash at all |

**Prevention:** correct probes, resource limits that match reality, and validating config before deploying.

### ImagePullBackOff / ErrImagePull

**Symptom:** the Pod never starts; status shows one of these.

**Investigation:** `kubectl describe pod <name>` and read the event — it states the actual reason.

**Common causes:** typo in the image name or tag; the tag does not exist; a private registry with no `imagePullSecret`; the node cannot reach the registry.

**Prevention:** use explicit version tags rather than `latest`, and configure registry credentials at the ServiceAccount level so every Pod inherits them.

### OOMKilled

**Symptom:** container restarts; `describe` shows `Reason: OOMKilled`, exit code 137.

**What it means:** the container exceeded its memory **limit** and the Linux kernel killed it. This is not Kubernetes being harsh — it is a cgroup limit being enforced.

**Investigation:** compare the limit against actual usage (`kubectl top pod`, if the metrics server is installed), and check whether usage grows steadily, which suggests a leak.

**Prevention:** set limits based on measurement, not guesswork. Volume 4 covers requests and limits properly.

### Pod stays Pending

Covered in Volume 1 — this is the scheduler. `kubectl describe pod` names the reason.

### The general method

1. `kubectl get pods` — what state is it in?
2. `kubectl describe pod <name>` — read the **Events** at the bottom
3. Did the container start? No → image, scheduling or volume problem. Yes → `kubectl logs --previous`
4. Is it running but not serving? → probes and Service (Volume 3)

