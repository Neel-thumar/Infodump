## LAB 2 — Full Path: Ingress and a Deny Rule

### Goal

Build the complete path from a user to a Pod, then deliberately restrict it.

### Setup

For Ingress locally, install a controller (kind has a documented pattern for this):

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

⚠️ SYSTEM CHANGE: this installs a Deployment and Service into your `kind` cluster. It is contained entirely inside the cluster and removed when the cluster is deleted.

### Commands

Reuse the `web.yaml` Deployment and Service from Lab 1, then add:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

```bash
kubectl apply -f web.yaml -f ingress.yaml
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
```

In another terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/
```

### Expected result

`200`. You have gone all the way from a curl on your laptop, through the Ingress controller, through the Service, to a Pod.

Now add a default-deny NetworkPolicy in the `net` namespace and repeat the curl.

### What to observe

Once the policy is applied (and if your local CNI actually enforces NetworkPolicy — `kind`'s default CNI does), the request starts failing, because the Ingress controller's traffic to the Pod is now blocked too. This is the trap from above: a deny-all rule blocks *everything*, including the traffic path you actually want, unless you write an explicit allow rule for it.

### Why this matters

This exact mistake — deploying default-deny without the matching allow rules — has caused real production outages. Now you have seen it happen safely.

### Cleanup

```bash
kubectl delete -f web.yaml -f ingress.yaml
kubectl delete -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

