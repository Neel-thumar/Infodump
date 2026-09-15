## The Complete Troubleshooting Method

Every volume so far has taught a piece of this. Here it is as one method, because that is how it gets used under real pressure.

### The five questions

1. **What do we know?** The reported symptom, exactly as described — not your assumption about the cause.
2. **What do we not know?** Which layer hasn't been checked yet.
3. **Which Kubernetes layer could be responsible?** Scheduling, kubelet/runtime, networking, application, or the control plane itself.
4. **What evidence would confirm or rule out each layer?** Name the command before running it.
5. **What does the evidence actually say?** Not what you expected it to say.

### The layer map, assembled from every volume

```text
Is kubectl responding at all?
        ↓ no → API server / kubeconfig / network to cluster
        ↓ yes
Does the Pod exist and what phase is it in?
        ↓ Pending → scheduler (Volume 4): describe pod, read the filter failure
        ↓ ContainerCreating → kubelet/runtime/volume/network plugin
        ↓ CrashLoopBackOff → application: logs --previous, exit code (Volume 2)
        ↓ Running, not Ready → failing readiness probe (Volume 2/3)
        ↓ Running, Ready
Does the Service have endpoints for it?
        ↓ no → selector/label mismatch (Volume 3)
        ↓ yes
Does DNS resolve the Service name?
        ↓ no → CoreDNS health, NetworkPolicy blocking port 53 (Volume 3)
        ↓ yes
Does Ingress route correctly?
        ↓ no → Ingress rules, ingressClassName, controller logs (Volume 3)
        ↓ yes
Is a NetworkPolicy blocking the path?
        ↓ yes → review policy, add explicit allow rule (Volume 3)
```

This is not new material — it is Volumes 1 through 4, ordered into one decision tree, because that is the actual shape of debugging a request that fails somewhere between a user and a Pod.

### RBAC and security-specific failures

A category not yet covered: the request never even gets processed.

| Symptom | Likely layer |
|---|---|
| `Error from server (Forbidden)` | RBAC — check with `kubectl auth can-i` |
| `Error from server (Unauthorized)` | Authentication — expired token, bad kubeconfig |
| Pod's own calls to the API fail with 403 | ServiceAccount lacks the RBAC permission its code needs |
| Admission webhook rejection message | A policy engine (Kyverno, OPA/Gatekeeper — ecosystem) is blocking the object; the message usually names the rule |

