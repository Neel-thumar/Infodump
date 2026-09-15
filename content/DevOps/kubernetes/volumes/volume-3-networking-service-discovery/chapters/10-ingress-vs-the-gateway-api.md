## Ingress vs the Gateway API

This is a genuinely current 2026 topic, so here is where things actually stand, checked against the project's own release notes.

Ingress has real limitations: one generic object trying to serve every use case, vendor behaviour hidden inside annotations, and no clean way to express things like traffic splitting or protocols beyond HTTP without non-standard extensions.

The **Gateway API** was built to replace this with a proper role-oriented model — `GatewayClass`, `Gateway`, and protocol-specific route objects like `HTTPRoute` and `GRPCRoute`. `GatewayClass`, `Gateway`, `HTTPRoute` and `GRPCRoute` reached GA (`v1`) status; more recently `TCPRoute` also graduated to GA, and the project's most recent major release moved a further batch of previously experimental features to stable. It is now the direction the ecosystem is actively moving, and it is designed to cover both external (north-south) traffic and service-mesh (east-west) traffic with the same model.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "shop.example.com"
  rules:
    - backendRefs:
        - name: web
          port: 80
```

**Practical guidance for 2026:** Ingress is not deprecated and still works everywhere; it remains extremely common in existing clusters. New clusters and new controllers increasingly default to the Gateway API, and it is worth learning if you are picking a design for a new platform. Because this area moves quickly and depends entirely on which controller you install, always check that specific controller's own documentation for its current conformance level rather than assuming — the Gateway API is a specification implemented separately by each vendor, exactly like CNI.

| | Kubernetes API defines | Who implements it |
|---|---|---|
| Ingress | The `Ingress` object shape | NGINX Ingress Controller, Traefik, cloud-native controllers, etc. |
| Gateway API | `GatewayClass`, `Gateway`, `HTTPRoute`, etc. | Same controllers, increasingly, plus service meshes |

