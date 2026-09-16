---
id: nginx-vol-3-tls-caching-security
title: "Volume 3 — TLS, Caching, and Security"
order: 3
description: "TLS termination, proxy caching, rate limiting, security headers, and hardening nginx for production traffic."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 3 — TLS, Caching, and Security

After Volume 2, nginx receives requests, serves static files, proxies to backends, and balances load. But the connection is plain HTTP — anyone on the network can read the traffic. There's no caching — every request hits the backend even if the answer hasn't changed. And there's no protection — anyone can flood the API with requests.

This volume adds three layers that every production nginx needs: **TLS** to encrypt traffic, **caching** to avoid unnecessary backend work, and **security hardening** to limit abuse.

These three belong together because they all answer the same question: how does nginx protect and optimize the traffic flowing through it?

## Why This Matters

Serving plain HTTP in production is not acceptable for anything with user data. Missing caching means your backend does redundant work and costs more under load. Missing rate limiting means a single script can overwhelm your API. Missing security headers means browsers can't protect your users from common attacks.

These aren't advanced features you add later. They're baseline production requirements.

## What You Will Be Able to Do After This Volume

- Configure TLS termination with HTTPS on nginx.
- Set up HTTP → HTTPS redirection.
- Understand the plaintext-internal-network tradeoff.
- Configure proxy caching and understand cache keys.
- Reason about cache invalidation and misconfiguration risks.
- Configure `limit_req` (leaky bucket rate limiting) and `limit_conn`.
- Add security headers and understand what each protects against.
- Hide the nginx version with `server_tokens off`.
- Use `allow`/`deny` for IP-based access control.
- Know what nginx can and cannot protect.
- Have the continuous project at Stages 4, 5, and 6.

---

## TLS Termination — HTTPS at the Front Door

### What Is TLS Termination?

TLS (Transport Layer Security, the successor to SSL) encrypts the connection between the client and the server. **TLS termination** means nginx handles the encryption — it decrypts incoming HTTPS requests and sends plain HTTP to the backend.

```text
Client ──HTTPS (encrypted)──> nginx ──HTTP (plain)──> Backend
```

Back to the analogy: the receptionist at the front desk checks the visitor's ID and handles the security protocol. Once inside the building, the visitor moves around without showing ID at every door. The back-office staff trust that the front desk already verified the visitor.

### Why Terminate TLS at nginx?

| Reason | Explanation |
|---|---|
| Centralised certificate management | One place to install and renew certificates, not every backend |
| Backend simplicity | Backends don't need TLS libraries, certificate files, or renewal logic |
| Performance | nginx handles TLS handshakes efficiently; backends focus on application logic |
| Consistent HTTPS for all backends | Even backends written in different languages/frameworks get HTTPS for free |

### The Tradeoff: Plaintext Internal Traffic

Between nginx and the backend, traffic is unencrypted. On a trusted internal network (same machine, same private network, same Kubernetes cluster), this is generally acceptable and standard practice. If the internal network is untrusted (traffic crosses public networks, shared infrastructure), you should encrypt the internal leg too — either with TLS to the backend or with a network-level solution like a VPN or service mesh mTLS.

For our lab and most single-machine or same-network deployments, plaintext between nginx and the backend is fine.

---

## Lab: Add TLS to the Project (Stage 4)

### Goal

Configure nginx to serve HTTPS with a self-signed certificate and redirect HTTP to HTTPS.

### Step 1: Generate a Self-Signed Certificate

For local development, a self-signed certificate is sufficient. In production, you'd use Let's Encrypt (certbot) or your organization's certificate authority.

```bash
cd ~/nginx-guide

mkdir -p certs

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/selfsigned.key \
  -out certs/selfsigned.crt \
  -subj "/CN=localhost"
```

This creates:

- `certs/selfsigned.key` — the private key.
- `certs/selfsigned.crt` — the certificate.

### Step 2: Update docker-compose.yml

Add the HTTPS port and certificate volume:

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:1.27
    ports:
      - "8080:80"
      - "8443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./proxy_params:/etc/nginx/proxy_params:ro
      - ./static:/var/www/static:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - backend1
      - backend2

  backend1:
    image: python:3.12-slim
    working_dir: /app
    volumes:
      - ./backend.py:/app/backend.py:ro
    command: python backend.py
    environment:
      - PORT=3001
      - INSTANCE=backend-1

  backend2:
    image: python:3.12-slim
    working_dir: /app
    volumes:
      - ./backend.py:/app/backend.py:ro
    command: python backend.py
    environment:
      - PORT=3001
      - INSTANCE=backend-2
```

### Step 3: Update nginx.conf

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
        keepalive 32;
    }

    # Redirect all HTTP to HTTPS
    server {
        listen 80;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name localhost;

        ssl_certificate     /etc/nginx/certs/selfsigned.crt;
        ssl_certificate_key /etc/nginx/certs/selfsigned.key;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Proxy API requests
        location /api/ {
            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;
        }
    }
}
```

Let's understand the new pieces.

### The HTTP → HTTPS Redirect Server

```nginx
server {
    listen 80;
    server_name localhost;
    return 301 https://$host:8443$request_uri;
}
```

This is a separate `server` block that listens on port 80. It doesn't serve anything — it immediately redirects every request to the HTTPS version using a 301 (permanent redirect).

- `$host` — the hostname from the request (preserves whatever the client used).
- `$request_uri` — the full original URI including query string.
- `:8443` — we use port 8443 because our Docker container maps 8443 to 443. In production on standard ports, this would just be `https://$host$request_uri`.

### The HTTPS Server

```nginx
server {
    listen 443 ssl;
    server_name localhost;

    ssl_certificate     /etc/nginx/certs/selfsigned.crt;
    ssl_certificate_key /etc/nginx/certs/selfsigned.key;
    ...
}
```

- `listen 443 ssl` — listen on port 443 with TLS enabled.
- `ssl_certificate` — path to the certificate file (public).
- `ssl_certificate_key` — path to the private key.

That's the minimum for TLS. nginx handles the entire TLS handshake — cipher negotiation, certificate presentation, encryption/decryption — without the backend knowing anything about it.

### Step 4: Restart and Test

```bash
docker compose down
docker compose up -d
```

Test the HTTP redirect:

```bash
curl -v http://localhost:8080/ 2>&1 | grep -E "< HTTP|< Location"
```

Expected:

```text
< HTTP/1.1 301 Moved Permanently
< Location: https://localhost:8443/
```

Test HTTPS (use `-k` because our certificate is self-signed):

```bash
curl -k https://localhost:8443/
```

Expected: your HTML frontend.

Test the API over HTTPS:

```bash
curl -k https://localhost:8443/api/test
```

Expected: JSON response from one of the backends.

### Step 5: Inspect the TLS connection

```bash
curl -kv https://localhost:8443/ 2>&1 | grep -E "SSL|subject|issuer|TLS"
```

You'll see output like:

```text
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* Server certificate:
*  subject: CN=localhost
*  issuer: CN=localhost
```

This confirms nginx is terminating TLS with our self-signed certificate.

> **Note:** Browsers will show a security warning for self-signed certificates. This is expected. In production, you'd use a certificate from a trusted CA (Let's Encrypt is free and automated).

Stage 4 is complete.

---

## TLS in Production — What Changes

Our lab uses a self-signed certificate and minimal settings. Production TLS involves a few more considerations.

### Certificate from a Trusted CA

In production, you use a certificate signed by a certificate authority (CA) that browsers trust. **Let's Encrypt** with **certbot** is the standard free option. The process:

1. certbot proves you control the domain.
2. Let's Encrypt issues a certificate (valid for 90 days).
3. certbot installs it and sets up automatic renewal.
4. nginx uses the renewed certificate after a reload.

The nginx config looks the same — just different file paths:

```nginx
ssl_certificate     /etc/letsencrypt/live/myapp.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;
```

### TLS Protocol and Cipher Settings

Modern TLS best practice (as of 2026) is to use TLS 1.2 and 1.3 only:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```

TLS 1.0 and 1.1 are deprecated and considered insecure. Most modern clients support 1.2 and 1.3.

For cipher suites, nginx's defaults are reasonable for current versions. If you need explicit control:

```nginx
ssl_prefer_server_ciphers on;
```

This tells nginx to prefer its own cipher order over the client's, which lets you enforce stronger ciphers.

> **Senior insight:** Don't copy cipher suite strings from old blog posts. Cipher recommendations change as vulnerabilities are found. Use the defaults from a current nginx version or check Mozilla's SSL Configuration Generator, which produces up-to-date settings.

### SSL Session Caching

TLS handshakes are expensive. Session caching lets clients reconnect without a full handshake:

```nginx
ssl_session_cache   shared:SSL:10m;
ssl_session_timeout 1d;
```

`shared:SSL:10m` creates a 10 MB shared cache (shared across all workers). 1 MB stores roughly 4,000 sessions. `ssl_session_timeout 1d` keeps sessions valid for one day.

### HSTS — HTTP Strict Transport Security

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

This header tells browsers: "For the next 2 years, always use HTTPS for this domain. Never try HTTP." After the first HTTPS visit, the browser won't even attempt HTTP — it upgrades to HTTPS automatically before making the request.

**Be careful:** Once you set HSTS, you can't easily go back to HTTP. If your HTTPS setup breaks, users can't fall back. Only enable it when you're confident HTTPS is permanent and correctly configured.

We'll add HSTS in the security section below, along with other headers.

---

## Caching — Avoiding Unnecessary Backend Work

### The Problem

Your API returns a product list. 1,000 users request it within 10 seconds. Without caching, your backend processes the same query 1,000 times, returning the same result. With caching, nginx stores the first response and serves it to the next 999 users without touching the backend.

### Two Kinds of Caching

| Kind | Where it happens | What it does |
|---|---|---|
| **Proxy cache** (nginx stores responses) | At nginx, on disk or in memory | nginx saves backend responses and serves them for subsequent identical requests |
| **Browser cache** (client stores responses) | At the client browser | The browser stores the response and reuses it without contacting the server at all |

nginx can do both: it can cache responses itself (proxy cache) and it can set headers that tell browsers to cache responses (`Cache-Control`, `Expires`).

### Proxy Cache Setup

```nginx
http {
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    server {
        ...

        location /api/ {
            proxy_pass http://api_backends;
            proxy_cache api_cache;
            proxy_cache_valid 200 5m;
            proxy_cache_valid 404 1m;

            add_header X-Cache-Status $upstream_cache_status;
        }
    }
}
```

Let's understand each part.

### `proxy_cache_path`

```nginx
proxy_cache_path /var/cache/nginx/api
                 levels=1:2
                 keys_zone=api_cache:10m
                 max_size=100m
                 inactive=10m;
```

- **`/var/cache/nginx/api`** — Directory on disk where cached responses are stored.
- **`levels=1:2`** — Subdirectory structure for cache files (avoids putting millions of files in one directory).
- **`keys_zone=api_cache:10m`** — A named shared memory zone (10 MB) for storing cache keys and metadata. The name `api_cache` is what you reference in `proxy_cache`.
- **`max_size=100m`** — Total disk space for cached data. When exceeded, nginx removes the least recently used entries.
- **`inactive=10m`** — Remove entries not accessed within 10 minutes, regardless of their validity.

This directive goes in the `http` context, outside of any `server` block.

### `proxy_cache` and `proxy_cache_valid`

```nginx
proxy_cache api_cache;
proxy_cache_valid 200 5m;
proxy_cache_valid 404 1m;
```

- **`proxy_cache api_cache`** — Enable caching for this location, using the zone defined above.
- **`proxy_cache_valid 200 5m`** — Cache HTTP 200 responses for 5 minutes.
- **`proxy_cache_valid 404 1m`** — Cache 404 responses for 1 minute (so nginx doesn't keep asking the backend for a resource that doesn't exist).

### `X-Cache-Status` — Is This Response Cached?

```nginx
add_header X-Cache-Status $upstream_cache_status;
```

This adds a response header that tells you whether the response came from cache. The values:

| Value | Meaning |
|---|---|
| `MISS` | Not in cache; fetched from backend |
| `HIT` | Served from cache |
| `EXPIRED` | Was cached, but expired; re-fetched from backend |
| `BYPASS` | Caching was intentionally bypassed |
| `STALE` | Serving an expired cache entry (backend unreachable) |

This header is invaluable for debugging. When you suspect caching problems, curl the endpoint and check `X-Cache-Status`.

### Cache Keys — What Makes Two Requests "the Same"?

The **cache key** determines which cached response serves which request. By default, the key is:

```text
$scheme$proxy_host$request_uri
```

This means: protocol + upstream name + URI (including query string).

So `GET /api/products?page=1` and `GET /api/products?page=2` are different cache entries (different query strings). But `GET /api/products?page=1` from User A and the same request from User B share the same cache entry.

**This is where caching gets dangerous.**

### The Cache Poisoning Risk

If your API returns user-specific data, and the cache key doesn't include anything user-specific, nginx will cache User A's response and serve it to User B.

Example of what goes wrong:

1. User A requests `GET /api/profile` → backend returns User A's profile → nginx caches it.
2. User B requests `GET /api/profile` → nginx serves User A's cached profile to User B.

User B sees User A's data. This is a **data leak** caused by incorrect caching.

### Preventing Cache Mistakes

**Rule 1:** Never cache user-specific responses unless the cache key includes the user identity.

The safest approach is to not cache authenticated API endpoints at all:

```nginx
location /api/ {
    proxy_pass http://api_backends;

    # Don't cache if there's an Authorization header
    proxy_cache_bypass $http_authorization;
    proxy_no_cache     $http_authorization;
}
```

`proxy_no_cache` prevents nginx from storing the response. `proxy_cache_bypass` skips the cache when looking up responses.

**Rule 2:** Only cache responses that are genuinely the same for all users — public data, product listings, static API responses.

**Rule 3:** Respect the backend's cache headers. If the backend sends `Cache-Control: no-store` or `Cache-Control: private`, nginx should not cache.

```nginx
# This is the default behavior — nginx respects Cache-Control from the backend.
# But if you set proxy_cache_valid, it overrides the backend's headers.
# Be deliberate about which one controls caching.
```

### Cache Invalidation — The Hard Problem

The backend updates a product's price. The cache still holds the old price for the remaining cache lifetime. Users see stale data.

There is no elegant solution to cache invalidation. Here are the practical approaches:

| Approach | How it works | Tradeoff |
|---|---|---|
| Short TTL | `proxy_cache_valid 200 30s` — cache expires quickly | Still 30 seconds of stale data; backend gets more requests |
| Cache purge | Send a PURGE request to remove a specific cache entry | Requires the `ngx_cache_purge` module (not in default nginx); adds operational complexity |
| Cache bypass | Client sends a specific header to skip cache | Useful for admin/refresh scenarios |
| Versioned URLs | `/api/products?v=2` — change the version when data changes | Works for assets, awkward for API responses |

In practice, short TTLs are the most common approach for API caching. For static assets (CSS, JS, images), longer TTLs with versioned filenames (`app.abc123.js`) are standard.

---

## Lab: Add Caching (Stage 5)

### Goal

Add proxy caching for API responses and observe cache behavior.

### Step 1: Create the cache directory

Add a volume for the cache and create the directory inside the container. Update `docker-compose.yml` — add a `tmpfs` for the cache:

```yaml
  nginx:
    image: nginx:1.27
    ports:
      - "8080:80"
      - "8443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./proxy_params:/etc/nginx/proxy_params:ro
      - ./static:/var/www/static:ro
      - ./certs:/etc/nginx/certs:ro
    tmpfs:
      - /var/cache/nginx
    depends_on:
      - backend1
      - backend2
```

### Step 2: Update nginx.conf

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Cache configuration
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
        keepalive 32;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name localhost;

        ssl_certificate     /etc/nginx/certs/selfsigned.crt;
        ssl_certificate_key /etc/nginx/certs/selfsigned.key;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Cached API proxy
        location /api/ {
            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;

            # Caching
            proxy_cache api_cache;
            proxy_cache_valid 200 30s;
            proxy_cache_valid 404 10s;
            add_header X-Cache-Status $upstream_cache_status always;
        }
    }
}
```

### Step 3: Restart and test

```bash
docker compose down
docker compose up -d
```

```bash
curl -k -s -D - https://localhost:8443/api/test -o /dev/null 2>&1 | grep -i x-cache
```

First request:

```text
X-Cache-Status: MISS
```

Second request (within 30 seconds):

```text
X-Cache-Status: HIT
```

The second request was served from cache — the backend was never contacted.

### Step 4: Verify the backend didn't get the second request

Watch backend logs:

```bash
docker compose logs --tail=5 backend1
docker compose logs --tail=5 backend2
```

You should see only one request logged, not two.

### Step 5: Wait for cache expiry

Wait 30 seconds, then request again:

```bash
sleep 31
curl -k -s -D - https://localhost:8443/api/test -o /dev/null 2>&1 | grep -i x-cache
```

```text
X-Cache-Status: EXPIRED
```

The cache entry expired. nginx fetched a fresh response from the backend.

Stage 5 is complete.

---

## Browser Caching for Static Assets

Proxy caching (above) stores responses at nginx. Browser caching tells the client to store responses locally so it doesn't even make a request.

For static assets that change rarely (CSS, JS, images with fingerprinted filenames):

```nginx
location / {
    try_files $uri $uri/ =404;

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

- **`expires 30d`** — Sets the `Expires` header to 30 days from now.
- **`Cache-Control: public, immutable`** — Tells the browser: this file is cacheable by anyone, and it won't change (the `immutable` flag means don't even bother revalidating).

> **Why nested location?** A `location` block inside another `location` block works in nginx. The outer `location /` handles HTML with `try_files`. The inner regex location matches static asset extensions and adds long cache headers. The inner block inherits `root` from the outer/server context.

For assets with fingerprinted filenames (`app.a1b2c3.js`), 30-day or even 1-year caching is safe. When the content changes, the filename changes, so the browser fetches the new file.

For `index.html` itself, you generally want short or no caching — so the browser always gets the latest version (which then references the correct fingerprinted assets).

---

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

## Security Headers — What the Browser Needs

Security headers tell browsers how to handle your content safely. They don't protect the server — they protect the user's browser.

```nginx
server {
    ...

    # Security headers
    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection       "0" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;
}
```

### What Each Header Does

**`X-Frame-Options: SAMEORIGIN`**

Prevents your page from being embedded in an `<iframe>` on another site. This blocks **clickjacking** attacks, where an attacker overlays your site with invisible elements to trick users into clicking things they don't intend to.

**`X-Content-Type-Options: nosniff`**

Prevents the browser from guessing the file type. Without this, a browser might interpret a text file as JavaScript if the content looks like code — an attack vector called **MIME type sniffing**. With `nosniff`, the browser strictly uses the `Content-Type` header.

**`X-XSS-Protection: 0`**

This disables the browser's built-in XSS filter. The old value `1; mode=block` is no longer recommended — the XSS filter itself had vulnerabilities and modern browsers have deprecated it. Content Security Policy (CSP) is the modern replacement for XSS protection.

**`Referrer-Policy: strict-origin-when-cross-origin`**

Controls what information the browser sends in the `Referer` header when navigating away from your site. `strict-origin-when-cross-origin` sends the full URL for same-origin requests but only the origin (no path) for cross-origin requests, and nothing over a HTTPS→HTTP downgrade.

**`Permissions-Policy: camera=(), microphone=(), geolocation=()`**

Disables browser features your site doesn't use. If an XSS attack injects code that tries to access the camera, the browser blocks it because the permissions policy says no.

### HSTS — Strict Transport Security

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

Tells the browser: always use HTTPS for this domain for the next 2 years. After the first visit, the browser won't even try HTTP.

> **Warning for local development:** Don't add HSTS to your localhost config. If you do, your browser will refuse to use HTTP for localhost until the max-age expires, which is annoying. We'll add it in the final production config.

### The `always` Parameter

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
```

The `always` keyword means the header is added to **all responses**, including error responses (404, 500, etc.). Without `always`, nginx only adds the header to successful responses, leaving error pages unprotected.

### `server_tokens off` — Hide Version Information

```nginx
http {
    server_tokens off;
    ...
}
```

By default, nginx sends `Server: nginx/1.27.3` in response headers and on error pages. This reveals your exact nginx version, which helps attackers look up known vulnerabilities.

With `server_tokens off`, the header becomes just `Server: nginx` and error pages don't show the version.

This is a small change, but it's a low-cost security improvement that every production config should include.

---

## IP-Based Access Control — `allow` and `deny`

Sometimes you want to restrict access to specific paths — an admin panel, a health check endpoint, internal metrics.

```nginx
location /admin/ {
    allow 10.0.0.0/8;
    allow 192.168.1.0/24;
    deny all;

    proxy_pass http://api_backends;
}
```

Rules are evaluated top to bottom. The first matching rule wins:

1. If the client IP is in `10.0.0.0/8` → allow.
2. If the client IP is in `192.168.1.0/24` → allow.
3. Everything else → deny (returns 403).

### When `allow`/`deny` Is Not Enough

If nginx sits behind another proxy or load balancer, `$remote_addr` is the proxy's IP, not the client's. You'd need `real_ip` module configuration (`set_real_ip_from`, `real_ip_header`) to get the actual client IP from `X-Forwarded-For`. Without that, `allow`/`deny` operates on the wrong IP.

For anything beyond basic IP filtering, use proper authentication (API keys, OAuth, mutual TLS) at the application level. nginx is a first gate, not a complete access-control system.

---

## Protecting Against Slow Clients

Slow clients (or deliberate **slowloris**-style attacks) keep connections open for a long time, sending data as slowly as possible. This can exhaust nginx's connection slots.

nginx has built-in timeouts that protect against this:

```nginx
http {
    client_body_timeout   10s;
    client_header_timeout 10s;
    send_timeout          10s;
    keepalive_timeout     65s;
}
```

- **`client_header_timeout 10s`** — Close the connection if the client doesn't send the complete headers within 10 seconds.
- **`client_body_timeout 10s`** — Close the connection if the client stops sending the request body for 10 seconds.
- **`send_timeout 10s`** — Close the connection if the client stops reading the response for 10 seconds.
- **`keepalive_timeout 65s`** — Close idle keep-alive connections after 65 seconds.

These defaults are reasonable. Lowering them protects against slow clients but might affect legitimate users on very slow networks.

---

## What nginx Can and Cannot Protect

This is important to understand clearly.

### What nginx can do

- Rate limit by IP or other simple keys.
- Block requests by IP address.
- Add security headers.
- Terminate TLS.
- Hide backend details.
- Reject requests with oversized bodies.
- Time out slow clients.
- Block access to specific paths.

### What nginx cannot do

- **Validate application input.** nginx doesn't understand your API's data. SQL injection, XSS payloads, malformed JSON — these pass through nginx as normal request bodies.
- **Authenticate users.** nginx can check IP addresses and basic HTTP auth, but not application-level JWT tokens, OAuth flows, or session validation.
- **Detect application-layer attacks.** A web application firewall (WAF) like ModSecurity or a cloud WAF inspects request contents for attack patterns. nginx alone doesn't do this.
- **Prevent DDoS.** Rate limiting helps, but a serious distributed attack requires upstream mitigation (CDN, cloud DDoS protection).

nginx is the first gate. The application and specialised security tools are the inner gates. Don't assume "nginx is secure" means "the application is secure."

---

## Lab: Add Rate Limiting and Security Headers (Stage 6)

### Goal

Add rate limiting to the API and security headers to all responses.

### Update nginx.conf

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server_tokens off;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_status 429;

    # Cache configuration
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
        keepalive 32;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name localhost;

        ssl_certificate     /etc/nginx/certs/selfsigned.crt;
        ssl_certificate_key /etc/nginx/certs/selfsigned.key;

        # Security headers
        add_header X-Frame-Options        "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection       "0" always;
        add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;

        # Timeouts for slow clients
        client_body_timeout   10s;
        client_header_timeout 10s;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;

            # Long browser cache for static assets
            location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
                expires 30d;
                add_header Cache-Control "public, immutable" always;
                # Re-add security headers — add_header in a nested block
                # does NOT inherit from the parent
                add_header X-Frame-Options        "SAMEORIGIN" always;
                add_header X-Content-Type-Options "nosniff" always;
            }
        }

        # API proxy with rate limiting and caching
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;

            # Caching
            proxy_cache api_cache;
            proxy_cache_valid 200 30s;
            proxy_cache_valid 404 10s;
            add_header X-Cache-Status $upstream_cache_status always;
        }
    }
}
```

### Important Detail: `add_header` Inheritance

Notice we re-added security headers inside the nested static asset `location` block. This is because of a critical nginx behavior:

> **If any `add_header` directive appears in a block, all `add_header` directives from parent blocks are NOT inherited.**

The nested `location ~* \.(css|js|...)$` block has its own `add_header` directives (`Cache-Control`), so the security headers from the parent `server` block are not inherited. You must repeat any headers you still want.

This catches people off guard. If you add `add_header` anywhere inside a `location`, check that you haven't accidentally dropped headers from the parent.

### Restart and Test

```bash
docker compose down
docker compose up -d
```

**Test security headers:**

```bash
curl -k -s -D - https://localhost:8443/ -o /dev/null | grep -iE "x-frame|x-content|server:|referrer"
```

Expected:

```text
Server: nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Notice `Server: nginx` — no version number. `server_tokens off` is working.

**Test rate limiting:**

Send 30 requests quickly:

```bash
for i in $(seq 1 30); do
  curl -k -s -o /dev/null -w "%{http_code}\n" https://localhost:8443/api/test
done
```

Expected: the first ~20 return `200`, then some return `429` (Too Many Requests).

The exact split depends on timing. The burst of 20 allows the first 20 requests through. After that, only 10 per second are allowed. Excess requests get 429.

**Test static asset caching headers:**

```bash
curl -k -s -D - https://localhost:8443/style.css -o /dev/null | grep -iE "cache-control|expires"
```

Expected:

```text
Cache-Control: public, immutable
Expires: ... (a date 30 days from now)
```

Stage 6 is complete.

---

## Things Senior Engineers Notice

1. **`add_header` inheritance is the most surprising nginx behavior.** A single `add_header` in a child block silently drops all parent headers. This has caused real production incidents where security headers disappeared from specific paths. Use an `include` file for security headers and include it in every block that has its own `add_header`.

2. **Caching authenticated responses is one of the easiest ways to leak data.** If your API returns different data for different users and you cache it, one user's data gets served to another. Always use `proxy_no_cache` and `proxy_cache_bypass` for endpoints behind authentication.

3. **`limit_req` without `burst` is too aggressive.** Browsers open multiple connections and send several requests simultaneously (CSS, JS, images on page load). Without a burst allowance, legitimate page loads trigger rate limiting. Start with a reasonable burst and adjust based on real traffic patterns.

4. **Rate limiting per IP breaks behind NAT.** All users behind a corporate NAT share one IP. A `rate=10r/s` limit means the entire office shares 10 requests/second. If your users commonly share IPs, you need a different key (API key, session cookie) or much higher limits.

5. **Self-signed certificates are fine for development, a security incident in production.** Use Let's Encrypt or your org's CA. Certificate renewal must be automated — an expired certificate takes down your HTTPS site. Set a monitoring alert for certificate expiry.

6. **HSTS is a one-way door.** Once a browser receives an HSTS header with a 2-year max-age, it will refuse HTTP for 2 years. If you enable HSTS and then break HTTPS (expired cert, misconfiguration), users can't access your site at all. Start with a short max-age (1 hour) and increase only after you're confident.

7. **`proxy_cache_valid` overrides the backend's `Cache-Control` header.** If the backend sends `Cache-Control: no-cache` but nginx has `proxy_cache_valid 200 5m`, nginx caches anyway. Be deliberate about who controls caching — nginx or the backend. Mixing both without understanding the precedence causes stale-data bugs.

8. **Cache invalidation is an operational problem, not a configuration problem.** You can configure caching perfectly and still serve stale data when the backend updates. Plan for it: short TTLs, cache-busting URLs for assets, or a purge mechanism.

9. **Security headers protect the browser, not the server.** `X-Frame-Options` prevents clickjacking in the user's browser. It doesn't prevent an attacker from hitting your API directly with curl. Server-side security (input validation, authentication, authorization) is separate and equally important.

10. **`server_tokens off` is trivially easy and universally recommended.** There's no reason to reveal your nginx version. It takes one line and removes one piece of information attackers can use.

---

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

## What's Next — Volume 4

In Volume 4, we focus on making nginx observable and fast:

- **Performance tuning:** Workers, connections, keepalive, gzip compression (CPU vs bandwidth tradeoff), buffer sizes, and what to measure before tuning.
- **Logging:** Access log and error log in depth, custom log formats, conditional logging, connecting log lines to request behavior, and what nginx can and cannot tell you.

The continuous project evolves to Stage 7: tuned performance settings and structured logging that supports real debugging.
