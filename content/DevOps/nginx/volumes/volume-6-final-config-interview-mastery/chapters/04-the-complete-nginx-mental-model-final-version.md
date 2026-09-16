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

