## LAB 1 — A Bare Pod

### Goal

See a Pod directly, before any controller is involved.

### Setup

Your `kind` cluster from Volume 1.

```bash
kind create cluster --name devops   # only if you deleted it
kubectl create namespace apps
kubectl config set-context --current --namespace=apps
```

That last line saves you typing `-n apps` on every command.

### Commands

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: solo
  labels:
    app: solo
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
```

Save as `pod.yaml`, then:

```bash
kubectl apply -f pod.yaml
kubectl get pod solo -o wide
kubectl describe pod solo | tail -20
```

Now delete it and see what happens:

```bash
kubectl delete pod solo
kubectl get pods
```

### Expected result

The Pod runs, gets an IP and a node. After deletion, it is **gone**. Nothing brings it back.

### What to observe

Compare this with Volume 0, where deleting a Pod produced a replacement. The difference is that this Pod had no controller managing it. A bare Pod is a one-time instruction, not a desired state.

### Why this matters

You will almost never create bare Pods in real work, except for debugging. This lab exists so you understand what Deployments are actually adding.

### Cleanup

Already deleted.

