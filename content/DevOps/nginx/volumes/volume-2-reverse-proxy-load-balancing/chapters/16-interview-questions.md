## Interview Questions

### Level 1 — Fundamentals

**Q: What is a reverse proxy?**

A reverse proxy sits in front of application servers and forwards client requests to them. The client only knows about the proxy, not the backend servers. nginx is one of the most common reverse proxies.

**Q: What is the difference between a forward proxy and a reverse proxy?**

A forward proxy acts on behalf of the client — the server doesn't know the real client. A reverse proxy acts on behalf of the server — the client doesn't know the real backend. Corporate web proxies are forward proxies. nginx in front of your app is a reverse proxy.

**Q: Why put a reverse proxy in front of application servers?**

Connection management (handling thousands of slow clients efficiently), static file serving, TLS termination, load balancing, failover, caching, and security (rate limiting, hiding backend details).

### Level 2 — Practical

**Q: How does the trailing slash on `proxy_pass` change behavior?**

Without a URI component (no trailing slash): nginx forwards the full original request URI. With a URI component (even just `/`): nginx replaces the matched `location` prefix with the `proxy_pass` URI. This can silently strip path prefixes from the forwarded request, causing 404s on the backend.

**Q: What proxy headers should you set and why?**

`Host` (original hostname so the backend can generate correct URLs), `X-Real-IP` (client's actual IP), `X-Forwarded-For` (the proxy chain including client IP), and `X-Forwarded-Proto` (whether the original connection was HTTP or HTTPS). Without these, the backend sees nginx's IP and the upstream hostname instead of the real client information.

**Q: How would you set up load balancing for three backend servers?**

Define an `upstream` block with three `server` entries, then point `proxy_pass` to that upstream name. Choose a load-balancing method based on the traffic pattern — round-robin for uniform requests, `least_conn` for varying response times.

### Level 3 — Scenario Based

**Q: Users are getting intermittent 502 errors. How would you investigate?**

How to think:

1. Check the nginx error log — 502 means nginx can't reach a backend.
2. Look for "connection refused" or "no live upstreams" messages.
3. Check if one specific backend is down (`docker compose logs backend1`).
4. If intermittent, the backend may be crashing and restarting. Check backend logs.
5. Check `max_fails` settings — is nginx marking a backend unavailable too aggressively?
6. Is `proxy_next_upstream` configured? If so, a single backend failure should be retried on another, making the error invisible to the user. If users are seeing 502s, multiple backends might be failing.

**Q: API requests work for small payloads but fail with large file uploads. What would you check?**

How to think:

1. Check `client_max_body_size` — nginx rejects request bodies larger than this (default 1MB). Increase it for the upload endpoint.
2. Check `proxy_send_timeout` — large uploads take longer to transmit to the backend.
3. Check `proxy_request_buffering` — by default, nginx buffers the entire request body before forwarding. For very large uploads, the client might time out waiting. You can disable request buffering for the upload endpoint.
4. Check the backend's own upload size limits.

**Q: You notice all traffic going to one backend even though two are configured. What happened?**

How to think:

1. Has one backend been marked unavailable? Check the error log for connection failures.
2. Is `ip_hash` configured? If you're testing from one IP, all requests go to the same backend by design.
3. Is one backend configured with a much higher `weight`?
4. Was one backend removed from the upstream by a recent config change?

### Level 4 — Senior Thinking

**Q: What are the risks of using `proxy_next_upstream` with non-idempotent requests?**

If a POST request is sent to backend-1, the backend starts processing it, then the connection times out, nginx will retry on backend-2. Now both backends might have processed the request — creating duplicate records, double charges, etc. For non-idempotent endpoints, either disable `proxy_next_upstream`, restrict it to connection errors only (not timeouts after data is sent), or design the backend with idempotency keys.

**Q: Why is passive health checking a limitation in open-source nginx, and how would you work around it?**

Passive health checking means nginx only discovers a backend is down when a real request fails. The first request after a crash fails (or gets retried). Active health checking (nginx Plus, or external tools like Consul, HAProxy) probes backends continuously and removes them before any user request fails. Workarounds: set aggressive `max_fails` and low `fail_timeout`, use `proxy_next_upstream` for automatic retry, or add an external health-check sidecar that updates nginx configuration when a backend is unhealthy.

**Q: How do you handle DNS changes for backends in a dynamic environment (containers, cloud)?**

nginx resolves DNS for upstream servers at config load time and caches the result. If the backend's IP changes (container restarted with a new IP), nginx still sends traffic to the old IP. Solutions: use the `resolver` directive with a variable in `proxy_pass` so nginx re-resolves on each request, use Docker Compose or Kubernetes where the DNS layer handles this, or reload nginx when backends change.

---

