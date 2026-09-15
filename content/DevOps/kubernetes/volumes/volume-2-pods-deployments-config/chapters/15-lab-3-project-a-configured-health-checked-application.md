## LAB 3 — Project: A Configured, Health-Checked Application

### Goal

Build something close to real: a Deployment with configuration, a secret, and correct probes.

### Commands

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: site-config
data:
  index.html: |
    <h1>Shop API</h1>
    <p>environment: production</p>
---
apiVersion: v1
kind: Secret
metadata:
  name: api-creds
type: Opaque
stringData:
  API_TOKEN: "demo-token-not-real"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
  labels:
    app: shop
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shop
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: shop
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          env:
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: api-creds
                  key: API_TOKEN
          volumeMounts:
            - name: site
              mountPath: /usr/share/nginx/html
          readinessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 10
            failureThreshold: 3
      volumes:
        - name: site
          configMap:
            name: site-config
```

Save as `shop.yaml`.

```bash
kubectl apply -f shop.yaml
kubectl rollout status deployment/shop
kubectl exec deploy/shop -- cat /usr/share/nginx/html/index.html
kubectl exec deploy/shop -- printenv API_TOKEN
```

Now change the config and observe the two behaviours:

```bash
kubectl edit configmap site-config     # change the text, save
sleep 70
kubectl exec deploy/shop -- cat /usr/share/nginx/html/index.html
```

### Expected result

The mounted file shows your new text without any Pod restart. The environment variable would **not** have changed this way — it needs a restart:

```bash
kubectl rollout restart deployment/shop
```

### What to observe

You just saw the core difference between mounted config and environment config, on a live application. This single behaviour is behind a lot of "I changed the config and nothing happened" confusion.

### Why this matters

This is the shape of nearly every real workload: a Deployment, config from a ConfigMap, credentials from a Secret, probes for health. Everything we add in later volumes attaches to this.

### Cleanup

```bash
kubectl delete -f shop.yaml
```

