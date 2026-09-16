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

