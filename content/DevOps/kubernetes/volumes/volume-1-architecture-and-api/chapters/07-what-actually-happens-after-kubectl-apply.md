## What Actually Happens After `kubectl apply`

This is one of the most common interview questions. Learn this flow properly.

```text
kubectl apply -f deployment.yaml
        ↓
kubectl reads kubeconfig, sends an HTTP request to the API server
        ↓
API SERVER
   1. Authentication  — who is this?
   2. Authorization   — is this user allowed? (RBAC)
   3. Admission       — modify or reject the object by policy
   4. Validation      — is the object schema-correct?
   5. Write to etcd
        ↓
Object now exists. The API server notifies watchers.
        ↓
Deployment controller sees a new Deployment → creates a ReplicaSet
        ↓
ReplicaSet controller sees it → creates Pod objects (no node yet)
        ↓
Scheduler sees Pods with no node → picks a node → writes it to the Pod
        ↓
kubelet on that node sees a Pod assigned to it
        ↓
kubelet → container runtime (CRI) → pull image, create container
        ↓
Network plugin (CNI) gives the Pod an IP
        ↓
Pod is Running. kubelet reports status back to the API server.
```

Notice something important: **when `kubectl apply` returns "created", nothing is running yet.** You have only written down your intent. Everything after that happens asynchronously, and every one of those steps can fail in its own way.

This one diagram explains most troubleshooting:

| Where it stops | What you see |
|---|---|
| Authorization | `Error from server (Forbidden)` |
| Admission | Request rejected with a policy message |
| Scheduler | Pod stays `Pending` |
| Image pull | `ImagePullBackOff` |
| Container start | `CrashLoopBackOff` |
| Network plugin | Pod stuck in `ContainerCreating` |

