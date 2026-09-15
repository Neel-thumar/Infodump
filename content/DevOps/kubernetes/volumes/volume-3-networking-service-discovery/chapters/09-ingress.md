## Ingress

A Service only gives you internal or fairly raw external access. For real HTTP routing — multiple domains, paths, TLS — you use **Ingress**.

```text
User
  ↓ (DNS points at the Ingress controller's load balancer)
Ingress Controller  ← reads Ingress objects and configures itself
  ↓ (routes by host/path)
Service
  ↓
Pod
```

Important distinction: **Ingress the object is just a set of routing rules. Nothing acts on it without an Ingress Controller** — a separate piece of software (NGINX Ingress Controller, Traefik, and others) that you must install. This is a case where Kubernetes defines the API but does not ship the implementation, same pattern as CNI in Volume 1.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
spec:
  ingressClassName: nginx
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

`ingressClassName` matters once you have more than one controller installed — it says which one should handle this Ingress. Annotations are how you configure controller-specific behaviour (TLS redirect, rewrite rules, rate limits), and **annotations are ecosystem-specific** — the same annotation key means nothing to a different controller.

