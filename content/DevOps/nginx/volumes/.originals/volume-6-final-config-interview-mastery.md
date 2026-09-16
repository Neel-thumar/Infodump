---
id: nginx-vol-6-final-config-interview-mastery
title: "Volume 6 — Final Production Config + Interview Mastery"
order: 6
description: "The complete production nginx config fully explained, nginx's role in 2026 infrastructure, a production readiness checklist, and full interview revision."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 6 — Final Production Config + Interview Mastery

This is the last volume. Everything from Volume 0 through Volume 5 comes together here: the complete configuration we've built stage by stage, explained line by line, followed by where nginx fits into 2026 infrastructure, a checklist for production readiness, and a full interview revision section.

By the end of this volume, you should be able to look at the final config and explain every line — not just what it does, but why it's there and what would happen if it were removed or misconfigured.

## Why This Matters

An engineer who can write nginx config is useful. An engineer who can explain *why* the config is shaped the way it is — and defend those decisions in a design discussion or interview — is significantly more valuable. This volume is about consolidating everything into that level of understanding.

## What You Will Be Able to Do After This Volume

- Read and explain a complete production nginx configuration end to end.
- Explain nginx's place in a 2026 infrastructure stack, including Kubernetes ingress-nginx.
- Run through a production readiness checklist before trusting any config.
- Answer nginx interview questions at every level, from fundamentals to system design.
- Approach an nginx design question with a structured, engineering-reasoning process.
- Know what to learn next to keep going deeper.

---

## The Complete Production Configuration

This is the full config, evolved across all six volumes. Every section is annotated with which volume introduced it and why it's there.

```nginx
# ============================================================
# GLOBAL SETTINGS (main context)
# ============================================================

worker_processes auto;              # Volume 1: one worker per CPU core
worker_rlimit_nofile 4096;          # Volume 4: file descriptor limit for workers

events {
    worker_connections 2048;        # Volume 1/4: max connections per worker
}

http {
    # --- Core serving settings ---
    include       /etc/nginx/mime.types;   # Volume 1: correct Content-Type per file extension
    default_type  application/octet-stream;

    server_tokens off;              # Volume 3: hide nginx version from responses

    # --- Static file / network performance ---
    sendfile    on;                 # Volume 4: kernel-level file transfer
    tcp_nopush  on;                 # Volume 4: full packets for sendfile data
    tcp_nodelay on;                 # Volume 4: no delay for small/interactive data

    keepalive_timeout  65s;         # Volume 4: client-side keepalive duration
    keepalive_requests 1000;        # Volume 4: requests per keepalive connection

    # --- Compression ---
    gzip on;                                                              # Volume 4
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;

    # --- Client request limits ---
    client_body_buffer_size     16k;    # Volume 4
    client_max_body_size        10m;    # Volume 4: reject bodies over 10MB (413)
    large_client_header_buffers 4 16k;  # Volume 4: handle larger cookies/headers

    # --- Logging ---
    log_format main                                         /* Volume 4 */
        '$remote_addr - $remote_user [$time_local] '
        '"$request" $status $body_bytes_sent '
        '"$http_referer" "$http_user_agent" '
        'rt=$request_time '
        'urt=$upstream_response_time '
        'us=$upstream_status '
        'ua=$upstream_addr '
        'cs=$upstream_cache_status';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    # --- Rate limiting zone ---
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;  # Volume 3
    limit_req_status 429;

    # --- Proxy cache path ---
    proxy_cache_path /var/cache/nginx/api        /* Volume 3 */
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    # --- Upstream backend group ---
    upstream api_backends {                       # Volume 2
        server backend1:3001 max_fails=3 fail_timeout=30s;
        server backend2:3001 max_fails=3 fail_timeout=30s;
        keepalive 32;                              # Volume 4: reuse connections
    }

    # ============================================================
    # SERVER: HTTP → HTTPS REDIRECT
    # ============================================================
    server {                                        # Volume 3
        listen 80;
        server_name myapp.example.com;
        return 301 https://$host$request_uri;
    }

    # ============================================================
    # SERVER: MAIN HTTPS SERVER
    # ============================================================
    server {
        listen 443 ssl;
        server_name myapp.example.com;

        # --- TLS ---
        ssl_certificate     /etc/letsencrypt/live/myapp.example.com/fullchain.pem;  # Volume 3
        ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;

        # --- Security headers ---
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;  # Volume 3
        add_header X-Frame-Options        "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection       "0" always;
        add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;

        # --- Slow-client protection ---
        client_body_timeout   10s;       # Volume 3
        client_header_timeout 10s;

        # --- Health check (no logging noise) ---
        location = /health {              # Volume 4
            access_log off;
            return 200 "ok\n";
            default_type text/plain;
        }

        # --- Static frontend ---
        root /var/www/static;             # Volume 1
        index index.html;

        location / {
            try_files $uri $uri/ =404;

            # Long-lived cache for fingerprinted static assets
            location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {  # Volume 3
                expires 30d;
                add_header Cache-Control "public, immutable" always;
                # add_header does not inherit — repeat security headers here
                add_header X-Frame-Options        "SAMEORIGIN" always;
                add_header X-Content-Type-Options "nosniff" always;
            }
        }

        # --- API reverse proxy with load balancing, caching, rate limiting ---
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;   # Volume 3

            proxy_pass http://api_backends;                # Volume 2
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;                        # Volume 4: enable upstream keepalive
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;                       # Volume 2
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;              # Volume 2: retry on failure
            proxy_next_upstream_tries 2;

            proxy_cache api_cache;                          # Volume 3
            proxy_cache_valid 200 30s;
            proxy_cache_valid 404 10s;
            add_header X-Cache-Status $upstream_cache_status always;
        }

        # --- Larger upload allowance for a specific endpoint ---
        location /api/upload/ {                             # Volume 4
            client_max_body_size 50m;
            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;
        }
    }
}
```

```text
# /etc/nginx/proxy_params  (Volume 2)
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

This is a complete, defensible production configuration. Every directive traces back to a real problem it solves, which you now understand.

---

## The Complete nginx Mental Model — Final Version

Here is the full request journey, now with every piece filled in.

```text
Client sends HTTPS request to myapp.example.com
        │
        ▼
nginx Master Process (already running, config loaded at startup/reload)
        │
        ▼
Worker Process picks up the connection (event loop — one of thousands
handled concurrently by this worker)
        │
        ▼
TLS handshake: certificate presented, cipher negotiated, connection decrypted
        │
        ▼
Match server_name (myapp.example.com) + listen (443) → this server block
        │
        ▼
Match location against request URI:
        │
        ├──> location = /health          → return "ok" directly, no logging
        │
        ├──> location /                  → try_files: serve static file from disk
        │         │                         (sendfile, gzip, browser cache headers applied)
        │         └──> nested regex location for .css/.js/images → long cache headers
        │
        ├──> location /api/               → rate limit check (limit_req)
        │         │                          │
        │         │                          ├─ over limit → 429 Too Many Requests
        │         │                          └─ within limit → continue
        │         │
        │         ├──> check proxy cache (proxy_cache)
        │         │         ├─ HIT → serve cached response, done
        │         │         └─ MISS/EXPIRED → continue to backend
        │         │
        │         ├──> proxy_pass to upstream "api_backends"
        │         │         │
        │         │         ├─ load balancing method picks a backend
        │         │         ├─ proxy headers set (Host, X-Real-IP, X-Forwarded-*)
        │         │         ├─ connection reused via keepalive if available
        │         │         │
        │         │         ▼
        │         │    Backend Application processes the request
        │         │         │
        │         │         ▼
        │         │    Response returns to nginx
        │         │         │
        │         │    (if backend failed/timed out: proxy_next_upstream retries
        │         │     on another backend, up to configured limit)
        │         │
        │         └──> response buffered, cached (if cacheable), returned
        │
        └──> location /api/upload/        → same as /api/ but larger body size allowed
        │
        ▼
nginx applies: security headers, compression (gzip), logging
        │
        ▼
Response sent to Client over the encrypted TLS connection
        │
        ▼
Access log line written: client IP, request, status, timing, cache status,
                          which backend served it
```

Every arrow in this diagram is something you configured, tested, broke, and fixed across six volumes.

---

## Production Readiness Checklist

Before trusting any nginx configuration in production, verify:

### Configuration Safety

- [ ] Config is in version control.
- [ ] `nginx -t` passes with zero warnings.
- [ ] Config has been tested in a staging environment identical to production.
- [ ] Deploy process uses `nginx -s reload`, never a blind restart, for routine changes.

### TLS

- [ ] Certificate is from a trusted CA (not self-signed) for public-facing services.
- [ ] Certificate auto-renewal is configured and tested.
- [ ] Certificate expiry monitoring/alerting is in place.
- [ ] `ssl_protocols` excludes TLS 1.0/1.1.
- [ ] HTTP → HTTPS redirect is in place.
- [ ] HSTS is enabled (after confirming HTTPS is stable).

### Reverse Proxy / Load Balancing

- [ ] Proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) are set on every proxied location.
- [ ] Trailing-slash behavior on every `proxy_pass` has been deliberately checked.
- [ ] Timeouts (`proxy_connect_timeout`, `proxy_read_timeout`) are set to realistic, endpoint-appropriate values.
- [ ] `upstream` has more than one backend, or a documented reason why not.
- [ ] `proxy_next_upstream` is configured appropriately for the endpoint's idempotency.
- [ ] `max_fails`/`fail_timeout` are tuned for your traffic patterns.

### Caching

- [ ] No authenticated/user-specific endpoint is cached without `proxy_no_cache`/`proxy_cache_bypass`.
- [ ] Cache TTLs match how frequently the underlying data changes.
- [ ] `X-Cache-Status` header is available for debugging (at least in non-production, ideally gated in production).
- [ ] There's a documented process for emergency cache clearing.

### Security

- [ ] `server_tokens off` is set.
- [ ] Rate limiting is configured on public API endpoints.
- [ ] Security headers are present on all responses, including error responses (`always`).
- [ ] `client_max_body_size` matches actual expected upload sizes (not left at the tiny default, not left unbounded).
- [ ] Admin/internal endpoints have `allow`/`deny` or authentication.
- [ ] You understand that nginx is not a WAF and have separate input validation/authentication in the application layer.

### Performance

- [ ] `worker_processes auto` and `worker_connections` sized for expected load.
- [ ] `worker_rlimit_nofile` matches or exceeds connection capacity needs.
- [ ] `sendfile`, `tcp_nopush`, `tcp_nodelay` are enabled.
- [ ] gzip is enabled for compressible content types at a reasonable level (4–6).
- [ ] Upstream `keepalive` is configured to reduce backend connection churn.

### Logging and Observability

- [ ] Access log format includes upstream timing and cache status, not just the default format.
- [ ] Log rotation is configured (logrotate or container log driver).
- [ ] Health check endpoints have `access_log off` to reduce noise.
- [ ] `stub_status` (or equivalent) is enabled and monitored, restricted to internal access.
- [ ] Alerting exists for error rate spikes, not just manual log review.

### High Availability

- [ ] nginx itself is not a single point of failure (multiple instances, HA setup, or orchestrated by Kubernetes/cloud LB).
- [ ] There's a tested rollback process for bad config deploys.
- [ ] Backend deploys use rolling updates, not simultaneous full replacement.

This checklist won't catch everything, but working through it deliberately before a production launch catches the vast majority of real-world nginx incidents.

---

## nginx in 2026 — Extended Context

We touched on this in Volume 0. Now that you understand the full configuration surface, let's connect nginx to the broader ecosystem it operates in.

### Kubernetes ingress-nginx

The **ingress-nginx** controller is a Kubernetes controller that watches `Ingress` resources (Kubernetes objects describing how HTTP traffic should be routed) and generates an `nginx.conf` from them automatically. Every concept you learned in this guide is directly applicable:

- A Kubernetes `Ingress` rule with a `host` and `path` becomes a `server` and `location` block.
- Kubernetes `Service` endpoints become `upstream` servers.
- TLS secrets referenced in the `Ingress` become `ssl_certificate`/`ssl_certificate_key`.
- Annotations on the `Ingress` resource often map directly to nginx directives (rate limiting, timeouts, buffering) under the hood.

If ingress-nginx behaves unexpectedly, you debug it exactly the way you debug standalone nginx: check the generated config (`kubectl exec` into the ingress pod and view `/etc/nginx/nginx.conf`), check `nginx -t`-equivalent validation, and read the same error log format you've been reading throughout this guide.

### API Gateways

Tools like Kong (built on nginx internally) and other API gateways add features like authentication plugins, request/response transformation, and API key management on top of the same reverse-proxy foundation. Understanding nginx gives you a head start on understanding what these gateways are doing structurally, even when the configuration interface looks different.

### Service Meshes

In microservice architectures, tools like Istio (using Envoy) or Linkerd handle service-to-service traffic inside a cluster, with features like mutual TLS, fine-grained traffic splitting, and observability built in at the network layer. nginx typically remains at the *edge* (the entry point from the internet into the cluster), while the service mesh handles internal traffic. They solve overlapping problems (routing, load balancing, TLS) but at different points in the architecture.

### CDNs

Content Delivery Networks (Cloudflare, Fastly, CloudFront) cache content at edge locations geographically close to users, reducing latency and offloading traffic before it ever reaches your infrastructure. A CDN often sits *in front of* nginx: the CDN handles global caching and DDoS mitigation, and nginx handles origin-level proxying, load balancing, and any content the CDN doesn't cache. The caching concepts you learned in Volume 3 (cache keys, TTLs, invalidation, the cache-poisoning risk) apply directly to CDN configuration too — they're the same problem at a different layer.

### Where nginx Fits — the Honest Summary

nginx is not going away, and understanding it deeply is not "legacy knowledge." It remains one of the most common tools for:

- Direct reverse-proxy and load-balancing on traditional servers and VMs.
- The engine inside Kubernetes' most popular ingress controller.
- The foundation of several commercial API gateway products.
- The edge layer in front of more specialized internal networking tools (service meshes).

Learning nginx directly, as this guide has done, gives you transferable understanding that applies whether you're SSHing into a VM or debugging a Kubernetes ingress controller's generated config.

---

## nginx Design Question — Worked Example

A common system-design-style interview question:

> **"Design an nginx setup in front of three backend microservices, with TLS and caching."**

### How to Approach This

Don't jump straight to writing config. Walk through the reasoning out loud, the way you'd do it on the job.

**Step 1: Clarify the requirements.**

- What are the three services? (e.g., a user service, a product service, an orders service)
- Do they share a domain, or do they each need a different hostname/path?
- What are the traffic patterns — read-heavy, write-heavy, mixed?
- Any specific caching requirements (which endpoints are cacheable)?
- Any specific security requirements beyond standard TLS?

**Step 2: Decide the routing structure.**

A common approach: path-based routing under one domain.

```text
https://api.example.com/users/*    → user service
https://api.example.com/products/* → product service
https://api.example.com/orders/*   → order service
```

**Step 3: Sketch the architecture.**

```text
Client
   │
   ▼
nginx (TLS termination, routing, caching, rate limiting)
   │
   ├──> location /users/    → upstream user_service (2+ instances, load balanced)
   ├──> location /products/ → upstream product_service (2+ instances, cached — read-heavy)
   └──> location /orders/   → upstream order_service (2+ instances, NOT cached — writes/user-specific)
```

**Step 4: Reasoning behind key decisions.**

- **TLS terminates once, at nginx**, so none of the three backend services need their own certificate management.
- **Product listings are cached** (`proxy_cache`) because they're read-heavy and not user-specific — good caching candidates. **Orders are not cached** because they're user-specific and mutate frequently — caching them risks serving one user's order data to another, or serving stale order status.
- **Each service gets its own `upstream` block** so they can be scaled and load-balanced independently.
- **Rate limiting is applied per-path**, potentially with different limits — the products endpoint (likely hit by more traffic, including anonymous browsing) might have a higher limit than the orders endpoint (authenticated, lower volume, higher sensitivity).
- **Proxy headers are set consistently** across all three so every backend gets accurate client IP and hostname information regardless of which service handles the request.

**Step 5: Call out tradeoffs.**

- Path-based routing on one domain is simpler to operate than separate subdomains per service, but couples all three services' availability to one nginx layer (mitigated by the HA patterns from Volume 5).
- Caching product data improves read performance but introduces the invalidation problem from Volume 3 — the interviewer may probe this; be ready to discuss short TTLs vs purge mechanisms.

This is the structure of a strong answer: clarify → design → justify each decision → acknowledge tradeoffs. Interviewers are evaluating your reasoning process, not just whether you can recite `proxy_pass` syntax.

---

## What I Must Remember — The Essentials

If you remember nothing else from this guide, remember these:

1. nginx uses an **event-driven, non-blocking architecture** — one worker handles thousands of connections by never waiting idle on any single one.
2. **`location` matching**: longest prefix wins, unless a regex matches first (checked top-to-bottom) — except `=` (exact) and `^~` (preferential prefix) skip regex checking entirely.
3. **The trailing slash on `proxy_pass`** determines whether the matched location prefix is stripped from the forwarded request.
4. **Always set proxy headers** (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) on every proxied location.
5. **Reload, don't restart**, for routine config changes — reload drains old connections gracefully; restart drops them.
6. **Always run `nginx -t` before reloading** — every time, no exceptions.
7. **Caching user-specific data without proper cache keys leaks data** between users. Never cache authenticated endpoints without `proxy_no_cache`/`proxy_cache_bypass`.
8. **Health checks in open-source nginx are passive** — nginx only learns a backend is down when a real request fails.
9. **502 means nginx couldn't connect to the backend; 504 means it connected but the backend was too slow.**
10. **`add_header` in a child block drops all parent `add_header` directives** — repeat what you need.

---

## Common Mistakes to Actively Avoid

- Forgetting the trailing slash consideration on `proxy_pass`, causing silent path-stripping.
- Leaving `client_max_body_size` at the tiny default and being confused when uploads fail.
- Caching authenticated/user-specific responses without proper safeguards.
- Setting rate limits without a `burst` allowance, breaking normal browser page loads.
- Restarting nginx instead of reloading for routine config changes.
- Skipping `nginx -t` before a reload.
- Manually tracking TLS certificate expiry instead of automating renewal.
- Assuming `nginx -t` passing means the site actually works.
- Believing security headers protect the server — they protect the browser/user, not your backend.
- Forgetting that regex locations are order-dependent while prefix locations are not.

---

## Interview Revision — Complete Set

### Fundamentals

- **What is nginx and why is it used?** A high-performance web server, reverse proxy, and load balancer built on an event-driven architecture, used to handle static content, proxy requests to application servers, distribute load, terminate TLS, and add caching/security in front of backend applications.
- **Forward proxy vs reverse proxy?** Forward proxy acts for the client (server doesn't see the real client); reverse proxy acts for the server (client doesn't see the real backend).
- **What is load balancing?** Distributing incoming requests across multiple backend instances to improve reliability and handle more traffic than a single instance could.

### Practical

- **How would you configure nginx to reverse-proxy to a backend?** `location` block with `proxy_pass` pointing to the backend address, plus proxy headers via `proxy_set_header` (or an included `proxy_params` file).
- **How do `location` blocks get matched?** Longest prefix match wins unless it's `=` (exact) or `^~` (preferential, skips regex). Otherwise, regex locations are checked top-to-bottom and the first match wins; if none match, fall back to the longest prefix.
- **How would you set up load balancing across two servers?** Define an `upstream` block with both `server` entries, point `proxy_pass` at the upstream name, choose a method (round-robin default, `least_conn`, `ip_hash`, or `weight=`).
- **How would you configure TLS termination?** `listen 443 ssl`, `ssl_certificate`/`ssl_certificate_key`, plus an HTTP server block that redirects to HTTPS.

### Scenario Based

- **"Users are getting 502 errors intermittently. How would you investigate?"** Check error log for connection failures, verify backend health directly, check `max_fails`/`fail_timeout`, check if `proxy_next_upstream` is masking single-backend failures or if multiple backends are failing.
- **"Static assets are being served with the wrong content, seemingly cached. What would you check?"** `X-Cache-Status` header, `proxy_cache_valid` TTL, whether it's a stale-content issue or a cross-user cache-key issue (the latter is a security bug).

### Senior Thinking

- Architecture: event-driven model, master/worker separation, why reload is safe but restart isn't.
- Reliability: passive vs active health checks, `proxy_next_upstream` risks with non-idempotent requests, HA patterns for nginx itself.
- Security: what nginx can and can't protect against, cache poisoning risk, the `add_header` inheritance gotcha.
- Performance: what to measure before tuning, the difference between nginx-side and backend-side latency (`$request_time` vs `$upstream_response_time`).
- Trade-offs: sticky sessions (`ip_hash`) vs horizontal scalability, cache freshness vs backend load, aggressive rate limiting vs legitimate burst traffic.

### Practical Interview Skills — Handling Open-Ended Prompts

- **"Design an nginx setup in front of three backend services with TLS and caching."** → Clarify requirements, sketch path-based or domain-based routing, decide what's cacheable and what isn't, justify each decision, acknowledge tradeoffs. (See the worked example above.)
- **"How would you deploy an nginx config change without downtime?"** → Version control, `nginx -t` validation, staged rollout, `nginx -s reload` (never restart), monitoring immediately after.
- **"How would you debug an nginx server that stops responding under load?"** → `stub_status` for connection counts, error log for resource-limit messages, check `worker_connections`/`worker_rlimit_nofile`, distinguish nginx-side saturation from backend-side slowness.
- **"How would you protect an API behind nginx from abuse?"** → `limit_req` (leaky bucket) with sensible burst, `limit_conn` for connection limits, security headers, and clear acknowledgment that nginx-level protection is a first layer, not a substitute for application-level authentication and input validation.

---

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

## Closing

Across six volumes, you went from "what is nginx" to a complete, defensible production configuration that handles static content, reverse proxying, load balancing, TLS, caching, rate limiting, security hardening, performance tuning, and structured logging — and you can troubleshoot it systematically when it breaks.

That is not a small achievement. Most engineers who "know nginx" have copied configs without understanding half of what's in them. You now know why every line is there, what happens when it's removed, and how to explain it in an interview or a production incident review.

Good luck with the interviews, and with the production traffic.
