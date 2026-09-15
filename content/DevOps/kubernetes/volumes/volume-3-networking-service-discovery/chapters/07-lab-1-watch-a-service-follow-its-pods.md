## LAB 1 — Watch a Service Follow Its Pods

### Goal

See the EndpointSlice update live, and prove that readiness controls traffic.

### Setup

```bash
kubectl create namespace net
kubectl config set-context --current --namespace=net
```

### Commands

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          readinessProbe:
            httpGet:
              path: /
              port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f web.yaml
kubectl get endpointslices -l kubernetes.io/service-name=web
```

Now break readiness on one Pod by making it fail its probe — swap in a broken path:

```bash
POD=$(kubectl get pods -l app=web -o name | head -1)
kubectl exec $POD -- sh -c "rm -f /usr/share/nginx/html/index.html"
sleep 10
kubectl get endpointslices -l kubernetes.io/service-name=web -o jsonpath='{.items[0].endpoints[*].conditions.ready}{"\n"}'
kubectl get pods
```

### Expected result

Before: three addresses in the EndpointSlice. After breaking the file, `nginx` starts returning errors on `/`, the readiness probe fails, and that Pod's `ready` condition flips to `false` — it disappears from active endpoints, while `kubectl get pods` still shows it as `Running` (just `0/1` ready, not restarted).

### What to observe

Liveness did not fire — the container is not broken, just not serving correctly — so nothing restarted. Only readiness reacted, and only the traffic layer changed. This is the readiness/liveness split from Volume 2, now seen from the Service side.

### Why this matters

This is exactly the shape of a real incident: "the Pod is Running, but users get errors." The Pod status alone told you nothing. The EndpointSlice told you the truth.

### Cleanup

```bash
kubectl delete -f web.yaml
```

