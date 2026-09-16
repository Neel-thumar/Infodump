## Rate Limiting — Protecting Against Abuse

### The Problem

Without rate limiting, a single client can send thousands of requests per second to your API. This could be:

- A bug in a client application (infinite retry loop).
- An attacker trying to brute-force authentication.
- A scraper aggressively downloading data.
- A denial-of-service attempt.

Rate limiting tells nginx: "Allow at most N requests per second from each client. If they exceed that, slow them down or reject them."

### How `limit_req` Works — The Leaky Bucket

nginx uses a **leaky bucket** algorithm. Think of a bucket that leaks water at a fixed rate:

- Requests are water poured into the bucket.
- The bucket "leaks" (processes requests) at the configured rate.
- If requests arrive faster than the leak rate, the bucket fills up.
- Once the bucket is full, additional requests are rejected (or delayed).

```text
Requests arriving:  ████████████ (burst)
                    │
                    ▼
              ┌──────────┐
              │  bucket   │  ← fills up during bursts
              │  (burst   │
              │   size)   │
              └────┬─────┘
                   │ leaks at fixed rate (e.g., 10 req/sec)
                   ▼
              Processed requests
```

### Configuration

Two steps: define a zone (the bucket), then apply it to a location.

**Step 1: Define the rate limit zone**

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    ...
}
```

- **`$binary_remote_addr`** — The key. Each unique client IP gets its own bucket. `$binary_remote_addr` is the IP in binary form (uses less memory than string form).
- **`zone=api_limit:10m`** — Named zone with 10 MB of shared memory. Stores the state for approximately 160,000 IP addresses.
- **`rate=10r/s`** — The leak rate: 10 requests per second per IP.

**Step 2: Apply the limit**

```nginx
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    ...
}
```

- **`zone=api_limit`** — Use the zone defined above.
- **`burst=20`** — The bucket size. Allow up to 20 requests to queue before rejecting. Without `burst`, any request that arrives when the bucket is being processed is immediately rejected — too aggressive for real traffic.
- **`nodelay`** — Process burst requests immediately instead of spacing them out. Without `nodelay`, burst requests are delayed to enforce the rate. With `nodelay`, they're processed instantly, but once the burst is consumed, excess requests are rejected.

### What the Client Sees

- Within the rate: normal responses.
- Burst used up, excess request arrives: **`429 Too Many Requests`** (if configured) or **`503 Service Temporarily Unavailable`** (default).

To return 429 instead of 503:

```nginx
limit_req_status 429;
```

### `limit_conn` — Connection Limiting

While `limit_req` limits the request rate, `limit_conn` limits the number of **simultaneous connections** from one client:

```nginx
http {
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    server {
        location /api/ {
            limit_conn conn_limit 10;
        }
    }
}
```

This allows at most 10 simultaneous connections per IP to `/api/`. Useful for preventing a single client from monopolizing backend connections.

### Rate Limiting Gotchas

**Behind a NAT or load balancer:** If many users share one IP (corporate network, mobile carrier), `$binary_remote_addr` limits all of them together. Legitimate users get rate-limited because of each other. In this case, you might key on a different variable (an API key header, for example) or use more generous limits.

**The rate is per-worker in terms of enforcement timing, but the zone is shared.** The shared memory zone means all workers see the same rate-limit counters. This works correctly.

**Rate limiting is not a substitute for authentication or a WAF.** It slows down abuse but doesn't stop a sophisticated attacker. A distributed attack from many IPs bypasses per-IP limits. nginx rate limiting is a first line of defense, not the only one.

---

