## Interview Questions

### Level 1 — Fundamentals

**Q: What is TLS termination?**

TLS termination means nginx handles the HTTPS encryption/decryption. Clients connect to nginx via HTTPS. nginx decrypts the request, forwards it to the backend as plain HTTP, receives the response, encrypts it, and sends it back to the client. The backend never deals with TLS.

**Q: Why is caching useful at the reverse proxy level?**

It reduces load on the backend. If 1,000 users request the same resource within the cache lifetime, the backend handles it once. nginx serves the other 999 from cache. This improves response time and reduces backend resource consumption.

**Q: What does rate limiting protect against?**

Abuse: brute-force attacks, aggressive scrapers, buggy clients in retry loops, and simple denial-of-service attempts. It limits how many requests one client can send in a given time window.

### Level 2 — Practical

**Q: How would you configure HTTPS on nginx?**

Add `listen 443 ssl` to the server block, provide `ssl_certificate` and `ssl_certificate_key` paths, and create a separate server block on port 80 that redirects to HTTPS with `return 301 https://...`. Use certificates from a trusted CA (Let's Encrypt in most cases).

**Q: How does nginx's rate limiting work internally?**

nginx uses a leaky bucket algorithm. Each client (keyed by IP or another variable) has a virtual bucket that leaks at the configured rate (e.g., 10 requests/second). Requests fill the bucket. If the bucket overflows (burst exceeded), excess requests are rejected. The `burst` parameter sets the bucket size; `nodelay` processes burst requests immediately instead of queuing them.

**Q: What is the `add_header` inheritance gotcha?**

If any `add_header` directive appears in a child block (location), all `add_header` directives from parent blocks (server, http) are NOT inherited. You must repeat every header you want in the child block. This commonly causes security headers to disappear from specific locations.

### Level 3 — Scenario Based

**Q: Static assets are showing the wrong content — users see an old version of the CSS. What would you check?**

How to think:

1. Check browser cache — hard refresh or test with `curl` to bypass browser caching.
2. Check nginx proxy cache — look at the `X-Cache-Status` header. Is it `HIT`? If so, the cache is serving stale content.
3. Check the cache TTL (`proxy_cache_valid`). Is it too long?
4. Check if the static files use fingerprinted filenames. If not, cache-busting is harder.
5. Clear the nginx cache (remove files from `proxy_cache_path` and reload) as immediate fix.
6. Long-term: use versioned filenames for assets and appropriate cache headers.

**Q: Your API returns user-specific data, and a user reports seeing another user's data. Caching is enabled. What happened?**

How to think: the proxy cache key likely doesn't include user identity. Two different users requested the same URI (`/api/profile`), and the default cache key (scheme + host + URI) treated them as the same request. nginx cached User A's response and served it to User B. Fix: add `proxy_no_cache` and `proxy_cache_bypass` for authenticated endpoints, or include a user-identity variable in `proxy_cache_key`.

### Level 4 — Senior Thinking

**Q: What is the tradeoff of plaintext traffic between nginx and the backend?**

After TLS termination, nginx forwards unencrypted HTTP to backends. On a private network (same machine, same VPC, same Kubernetes cluster), this is standard practice — the network is trusted. On an untrusted or shared network, an attacker could sniff the internal traffic. Mitigations: encrypt the internal leg with TLS to backends, use a service mesh with mutual TLS, or ensure network-level encryption (VPN, encrypted overlay).

**Q: Why is cache invalidation hard, and how would you design around it?**

Caches store copies of responses with a TTL. When the source data changes, the cache doesn't know until the TTL expires. You can't reliably notify every cache (nginx, CDN, browser) simultaneously. Design around it with short TTLs for dynamic data (accept brief staleness), fingerprinted URLs for static assets (new content = new URL = no stale cache), and purge APIs for critical updates. Accept that some staleness window is a fundamental tradeoff of caching.

---

