## nginx vs Other Tools — Brief Comparison

Other tools solve similar problems. You should know they exist and what they're good at, but this guide teaches nginx.

| Tool | What it's known for | How it relates to nginx |
|---|---|---|
| **Apache (httpd)** | Traditional web server with a rich module ecosystem | nginx and Apache both serve static files and reverse-proxy; nginx is generally preferred for high-concurrency scenarios and reverse-proxy/load-balancer roles |
| **HAProxy** | Dedicated, highly capable load balancer and proxy | HAProxy focuses purely on proxying and load balancing with very advanced health checks and routing; nginx covers that plus static file serving |
| **Envoy** | Modern proxy designed for service meshes and microservices | Envoy is common in service-mesh architectures (Istio); nginx is common as an edge proxy and ingress |
| **Caddy** | Web server with automatic HTTPS and simple config | Caddy is simpler to configure for basic setups; nginx gives more control at the cost of more config |
| **Traefik** | Dynamic proxy with native container/orchestration integration | Traefik auto-discovers backends in Docker/Kubernetes; nginx requires more explicit configuration but is more predictable |

These are not enemies — in a real infrastructure, you might use nginx as the edge proxy and Envoy inside a service mesh. What matters is understanding the *concepts* (reverse proxy, load balancing, TLS termination), which are the same regardless of the tool.

This guide uses **open-source nginx** for all practical exercises. nginx Plus (the commercial version) adds features like active health checks and a dashboard — we will note where it differs, but never require it.

---

