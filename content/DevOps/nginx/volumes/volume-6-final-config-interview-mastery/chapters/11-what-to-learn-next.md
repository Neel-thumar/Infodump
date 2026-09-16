## What to Learn Next

This guide covered nginx as a request-handling and traffic-management system in depth. To go further, these are natural next steps — each connects directly to something you already understand:

- **Kubernetes ingress-nginx** — apply everything from this guide to a Kubernetes-native context; learn how `Ingress` resources map to the `server`/`location` config you now understand deeply.
- **API gateways (Kong, or cloud-native API Gateway services)** — see how authentication, rate limiting, and transformation are layered on top of the same reverse-proxy foundation, often built on nginx itself.
- **Service meshes (Istio/Envoy, Linkerd)** — understand how internal service-to-service traffic is managed with mutual TLS and fine-grained routing, complementing nginx's role at the edge.
- **CDNs (Cloudflare, Fastly, CloudFront)** — the caching concepts from Volume 3 (keys, TTLs, invalidation, poisoning risk) apply directly, just at a different layer of the stack.
- **TLS/PKI in depth** — certificate chains, OCSP stapling, mutual TLS, and the cryptographic details this guide intentionally kept at a practical level.
- **Observability tooling (Prometheus, Grafana, ELK/Loki)** — turn the structured logs from Volume 4 into dashboards and alerts, closing the loop on the troubleshooting skills from Volume 5.

You now have a solid, production-grounded foundation. Everything on this list builds on concepts you've already internalized — none of it starts from zero.

---

