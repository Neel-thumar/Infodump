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

