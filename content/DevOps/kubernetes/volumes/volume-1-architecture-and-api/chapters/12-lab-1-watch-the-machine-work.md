## LAB 1 — Watch the Machine Work

### Goal

See the components doing their individual jobs, and see labels controlling real behaviour.

### Setup

The `kind` cluster from Volume 0. If you deleted it:

```bash
kind create cluster --name devops
```

### Part A — Look at the control plane itself

```bash
kubectl get pods -n kube-system
```

**Expected result:** you will see `kube-apiserver-...`, `etcd-...`, `kube-scheduler-...`, `kube-controller-manager-...`, `kube-proxy-...` and CoreDNS.

**What to observe:** the control plane runs as Pods, inside Kubernetes. Kubernetes runs itself.

### Part B — Follow one Pod through the system

```bash
kubectl create namespace lab
kubectl create deployment web --image=nginx --replicas=2 -n lab
kubectl get pods -n lab -o wide
kubectl describe pod -n lab -l app=web | tail -25
```

**What to observe:** in the events at the bottom you can literally read the handover — the scheduler assigning the Pod to a node, then the kubelet pulling the image and starting the container. Two different components, named in the output.

### Part C — Prove that labels control ownership

```bash
kubectl get pods -n lab --show-labels
POD=$(kubectl get pods -n lab -l app=web -o name | head -1)
kubectl label $POD app=broken --overwrite -n lab
kubectl get pods -n lab --show-labels
```

**Expected result:** you now have **three** Pods. The relabelled one is still running perfectly.

**What to observe:** nothing crashed. You changed a string, so the Deployment's selector no longer matched that Pod, so it counted 1 instead of 2 and created a replacement. The old Pod is now an orphan that nothing manages.

**Why this matters:** this is how engineers pull a broken Pod out of service to investigate it — and also how a careless `kubectl label` silently removes a Pod from production traffic. Same mechanism, two very different days.

### Part D — Read the object model directly

```bash
kubectl get deployment web -n lab -o yaml | head -40
kubectl explain deployment.spec.selector
```

**What to observe:** compare the small thing you created with the large object that came back. Everything extra was added by the API server and the controllers.

### Cleanup

```bash
kubectl delete namespace lab
```

Deleting a namespace deletes everything inside it. Useful in labs. ⚠️ Dangerous in production — there is no undo.

