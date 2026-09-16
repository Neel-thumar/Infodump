---
id: nginx-vol-2-reverse-proxy-load-balancing
title: "Volume 2 — Reverse Proxy and Load Balancing"
order: 2
description: "proxy_pass mechanics, proxy headers, upstream blocks, load-balancing methods, backend failure detection, and the trailing-slash trap."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 2 — Reverse Proxy and Load Balancing

In Volume 1, nginx served files from disk. That's useful, but it's not nginx's main job in most production setups. The main job is this: receive a request from a client, forward it to a backend application server, get the response, and send it back to the client.

This is **reverse proxying**, and when you have multiple backend instances, it becomes **load balancing**. Together, they are the reason nginx sits in front of almost every production application.

This volume teaches both. By the end, our project will have nginx proxying API requests to two backend servers and distributing traffic between them.

## Why This Matters

Your application server — whether it's Node.js, Python, Go, Java, or .NET — is designed to run your business logic, not to handle the messy realities of internet-facing traffic: thousands of slow clients, TLS handshakes, keep-alive management, static file serving, and graceful failover when one instance crashes.

nginx handles all of that. Your application server only sees clean, fast, internal requests forwarded by nginx.

If you misconfigure the proxy, things break silently: the backend gets the wrong hostname, client IPs are lost, large requests fail, slow backends cause cascading timeouts. Understanding exactly what nginx does when it proxies a request prevents these problems.

## What You Will Be Able to Do After This Volume

- Explain what a reverse proxy is and why it sits in front of applications.
- Configure `proxy_pass` correctly, including the trailing-slash behavior.
- Set proxy headers so the backend knows the real client IP and hostname.
- Configure and reason about proxy timeouts.
- Understand nginx's buffering between client and backend.
- Set up `upstream` blocks with multiple backends.
- Configure round-robin, least connections, ip_hash, and weighted load balancing.
- Understand passive health checks and what happens when backends fail.
- Evolve the continuous project to Stages 2 and 3.

---

## What Is a Reverse Proxy?

A **proxy** is something that acts on behalf of someone else.

A **forward proxy** acts on behalf of the *client*. Your company's web proxy, or a VPN, is a forward proxy — your browser sends requests to the proxy, and the proxy sends them to the internet. The server never sees the real client.

A **reverse proxy** acts on behalf of the *server*. The client sends requests to the reverse proxy (nginx), and nginx forwards them to the backend application server. The client never sees the real server.

```text
Forward proxy:
  Client ──> Proxy ──> Internet Server
  (proxy hides the client)

Reverse proxy:
  Client ──> nginx ──> Backend Application
  (nginx hides the backend)
```

In our analogy: the client is a visitor, nginx is the front desk, and the backend application is the back-office staff. The visitor never goes to the back office directly — the receptionist handles the handoff and brings the answer back.

### Why Use a Reverse Proxy?

The backend application *can* serve requests directly. So why add nginx in front?

| Benefit | What nginx does |
|---|---|
| Connection management | Holds thousands of slow client connections cheaply; sends fast internal requests to the backend |
| Static file serving | Serves CSS, JS, images without bothering the backend |
| TLS termination | Handles HTTPS so the backend deals only with plain HTTP |
| Load balancing | Distributes requests across multiple backend instances |
| Failover | Stops sending requests to a crashed backend |
| Caching | Returns cached responses without hitting the backend |
| Security | Hides backend IPs, adds rate limiting, filters bad requests |

The backend only needs to handle clean, fast, pre-filtered requests. Everything else is nginx's job.

---

## `proxy_pass` — The Core Directive

`proxy_pass` tells nginx: "Don't serve this request yourself. Forward it to this backend."

### Simplest Example

```nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend1:3001;
    }
}
```

When a request comes in for `/api/users`:

1. nginx matches `location /api/`.
2. nginx opens a connection to `backend1:3001`.
3. nginx forwards the request.
4. The backend responds.
5. nginx sends the response back to the client.

The client thinks it's talking to nginx. The backend thinks it's getting a request from nginx. Neither sees the other directly.

### The Trailing-Slash Trap

This is one of the most common nginx mistakes, and it trips up experienced engineers too. Pay close attention.

**`proxy_pass` without a trailing slash:**

```nginx
location /api/ {
    proxy_pass http://backend1:3001;
}
```

Request: `GET /api/users`

What nginx forwards to the backend: `GET /api/users`

The **full original URI** is forwarded, unchanged.

**`proxy_pass` with a trailing slash:**

```nginx
location /api/ {
    proxy_pass http://backend1:3001/;
}
```

Request: `GET /api/users`

What nginx forwards to the backend: `GET /users`

The `/api/` prefix is **stripped** and replaced with `/`. Only the part after `/api/` is forwarded.

**The rule:**

- If `proxy_pass` has **no URI component** (no path after the port), nginx forwards the **complete original URI**.
- If `proxy_pass` has **any URI component** (even just `/`), nginx **replaces** the matched `location` prefix with the `proxy_pass` URI.

Here's one more example to make it concrete:

```nginx
location /app/v1/ {
    proxy_pass http://backend:3001/v1/;
}
```

Request: `GET /app/v1/orders`

What gets forwarded: `GET /v1/orders`

The `/app/v1/` prefix is replaced with `/v1/`.

### Why This Matters

If your backend expects requests at `/api/users` and you accidentally strip the `/api/` prefix, the backend receives `/users` and returns 404. Or worse — it handles a completely different route. This is a silent failure: nginx returns whatever the backend returns, and the error looks like an application bug, not a proxy misconfiguration.

**Mental shortcut:**

| `proxy_pass` value | What gets forwarded |
|---|---|
| `http://backend:3001` | Full original URI: `/api/users` |
| `http://backend:3001/` | URI with prefix stripped: `/users` |
| `http://backend:3001/v2/` | URI with prefix replaced: `/v2/users` |

When in doubt, start without a trailing slash and adjust only if you need path rewriting.

---

## Proxy Headers — What the Backend Needs to Know

When nginx proxies a request, the backend sees the request coming from **nginx's IP**, not from the original client. And by default, the `Host` header the backend receives is the upstream server's address, not the client's original hostname.

This causes real problems:

- Logging on the backend shows nginx's IP for every request, not the real client.
- The backend can't make decisions based on the client's IP (rate limiting, geo-routing).
- The backend generates URLs using the wrong hostname.
- Security audit trails are useless.

### The Essential Proxy Headers

```nginx
location /api/ {
    proxy_pass http://backend1:3001;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Let's understand each one.

### `Host`

```nginx
proxy_set_header Host $host;
```

Without this, the backend receives `Host: backend1:3001` — the upstream address. With this, the backend receives the original hostname the client used, like `Host: myapp.example.com`.

This is critical for backends that serve different content based on the hostname, generate absolute URLs, or validate the Host header.

### `X-Real-IP`

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

`$remote_addr` is the client's IP as seen by nginx. This header tells the backend the real client IP.

### `X-Forwarded-For`

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

This is the standard header for tracking the chain of proxies a request passed through. `$proxy_add_x_forwarded_for` appends the client's IP to any existing `X-Forwarded-For` header. If the request passed through multiple proxies:

```text
X-Forwarded-For: original-client-ip, first-proxy-ip
```

The backend reads the first IP in the list to get the original client.

### `X-Forwarded-Proto`

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

`$scheme` is `http` or `https`. This tells the backend whether the original client connection was secure. Important when nginx terminates TLS — the backend gets plain HTTP from nginx, but it needs to know the client used HTTPS (for generating correct redirect URLs, setting secure cookies, etc.).

### Setting Headers in a Reusable Way

You will use these same headers for every proxied location. Instead of repeating them, put them in a separate file:

```nginx
# /etc/nginx/proxy_params (create this file)
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Then include it:

```nginx
location /api/ {
    proxy_pass http://backend1:3001;
    include /etc/nginx/proxy_params;
}
```

Many distributions ship a default `proxy_params` file. If yours doesn't, create one.

---

## Proxy Timeouts — When Backends Are Slow

nginx can't wait forever for a backend to respond. Timeouts control how long nginx waits at each stage of the proxy conversation.

```nginx
location /api/ {
    proxy_pass http://backend1:3001;

    proxy_connect_timeout  5s;
    proxy_send_timeout     10s;
    proxy_read_timeout     30s;
}
```

### What Each Timeout Does

| Timeout | What it controls | Default |
|---|---|---|
| `proxy_connect_timeout` | How long nginx waits to **establish a TCP connection** to the backend | 60s |
| `proxy_send_timeout` | How long nginx waits to **send the request body** to the backend (between two successive write operations) | 60s |
| `proxy_read_timeout` | How long nginx waits to **receive a response** from the backend (between two successive read operations) | 60s |

### What Happens When a Timeout Fires

- **`proxy_connect_timeout` expires:** nginx can't reach the backend at all. The backend is down, the port is wrong, or a firewall is blocking. nginx returns **502 Bad Gateway**.

- **`proxy_read_timeout` expires:** nginx connected to the backend and sent the request, but the backend didn't respond in time. The backend is probably overloaded, stuck on a database query, or deadlocked. nginx returns **504 Gateway Timeout**.

- **`proxy_send_timeout` expires:** nginx is trying to send a large request body (file upload) to the backend, but the backend isn't reading it fast enough. Also returns **504**.

### Choosing Timeout Values

The defaults of 60 seconds are too generous for most API traffic. A typical API call should respond in well under 60 seconds. But some operations genuinely take longer (report generation, file processing).

A common approach:

```nginx
# Fast API endpoints
location /api/ {
    proxy_read_timeout 30s;
    proxy_pass http://backend;
}

# Slow endpoints (reports, exports)
location /api/reports/ {
    proxy_read_timeout 120s;
    proxy_pass http://backend;
}
```

> **Senior insight:** Setting timeouts too high means users wait forever when a backend is stuck. Setting them too low means legitimate slow requests get cut off. The right value comes from knowing your application's response-time distribution. Start with something reasonable (10–30s for APIs), monitor for 504s, and adjust.

---

## Proxy Buffering — How nginx Manages the Speed Difference

Your backend can generate a response very quickly. But the client might be on a slow mobile network. Without buffering, the backend would have to wait while the client slowly downloads the response — tying up a backend thread for seconds or minutes.

nginx solves this with **proxy buffering**. It is enabled by default and works like this:

1. The backend sends the response to nginx as fast as it can.
2. nginx stores (buffers) the entire response in memory (or on disk if it's large).
3. The backend connection is freed immediately.
4. nginx sends the buffered response to the slow client at whatever speed the client can handle.

```text
Without buffering:
  Backend ────slow trickle────> Client
  (backend thread held until client finishes downloading)

With buffering (default):
  Backend ──fast──> nginx (buffer) ────slow trickle────> Client
  (backend thread freed immediately)
```

This is a major performance benefit. Your backend handles a request in 50ms and moves on to the next one. nginx holds the response and deals with the slow client.

### When to Disable Buffering

For **streaming responses** (server-sent events, streaming APIs, long-polling), you don't want nginx to buffer — you want data to flow through as it arrives:

```nginx
location /api/stream/ {
    proxy_pass http://backend;
    proxy_buffering off;
}
```

For normal API and web traffic, keep buffering on (the default).

### Buffer Size Tuning

The defaults are usually fine, but if your backend sends very large responses:

```nginx
proxy_buffer_size    4k;   # for the initial response (status line + headers)
proxy_buffers        8 4k; # 8 buffers of 4k each for the response body
proxy_busy_buffers_size 8k;
```

If the response doesn't fit in memory buffers, nginx writes the overflow to a temporary file on disk. This is fine for large responses but slower than pure memory buffering.

We will tune these properly in Volume 4. For now, know that buffering exists and what it does.

---

## Lab: Reverse Proxy to One Backend (Stage 2)

### Goal

Configure nginx to proxy API requests to one backend while still serving static files directly. This is Stage 2 of our continuous project.

### Setup

Make sure your environment from Volume 0 is running:

```bash
cd ~/nginx-guide
docker compose up -d
```

### Step 1: Create the proxy_params file

```bash
cat > proxy_params << 'EOF'
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
EOF
```

### Step 2: Update docker-compose.yml to mount proxy_params

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./proxy_params:/etc/nginx/proxy_params:ro
      - ./static:/var/www/static:ro
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

    server {
        listen 80;
        server_name localhost;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Proxy API requests to backend1
        location /api/ {
            proxy_pass http://backend1:3001;
            include /etc/nginx/proxy_params;
        }
    }
}
```

### Step 4: Restart (needed because we changed docker-compose.yml volumes)

```bash
docker compose down
docker compose up -d
```

### Step 5: Test static file serving

```bash
curl http://localhost:8080/
```

Expected: your HTML frontend, same as before.

### Step 6: Test the proxy

```bash
curl http://localhost:8080/api/users
```

Expected:

```json
{
  "message": "Hello from the backend API",
  "instance": "backend-1",
  "path": "/api/users"
}
```

### What to Observe

- **`instance": "backend-1"`** — the request reached backend-1. nginx proxied it.
- **`path": "/api/users"`** — the backend received the full URI `/api/users`. This is because our `proxy_pass` has no trailing slash (`http://backend1:3001`, not `http://backend1:3001/`).

### Step 7: Verify with verbose curl

```bash
curl -v http://localhost:8080/api/users 2>&1 | head -20
```

Look at the response headers:

```text
< HTTP/1.1 200 OK
< Server: nginx/1.27.x
< Content-Type: application/json
```

The client sees `Server: nginx`. It has no idea the response came from a Python backend. nginx is invisible to the client as a proxy.

### Step 8: Test the trailing-slash difference

Temporarily change the `proxy_pass` line:

```nginx
        location /api/ {
            proxy_pass http://backend1:3001/;    # added trailing slash
            include /etc/nginx/proxy_params;
        }
```

Reload and test:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
curl http://localhost:8080/api/users
```

Expected:

```json
{
  "message": "Hello from the backend API",
  "instance": "backend-1",
  "path": "/users"
}
```

Notice `"path": "/users"` — the `/api/` prefix was stripped. The backend received `/users` instead of `/api/users`.

**Revert the change** — remove the trailing slash from `proxy_pass` and reload. Our backend expects `/api/` in the path, so we keep the full URI forwarded:

```nginx
            proxy_pass http://backend1:3001;
```

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

Stage 2 is complete. nginx is serving static files at `/` and proxying API requests at `/api/` to backend-1.

---

## `upstream` Blocks — Grouping Backends

So far, `proxy_pass` points to a single backend. When you have multiple instances of the same application, you group them into an **`upstream` block**.

```nginx
http {
    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
    }

    server {
        listen 80;

        location /api/ {
            proxy_pass http://api_backends;
        }
    }
}
```

Now `proxy_pass` points to the upstream group name instead of a single server. nginx distributes requests across all servers in the group.

### Important Details

- The upstream name (`api_backends`) is arbitrary. Use something descriptive.
- Each `server` line in the `upstream` block is one backend instance.
- The `upstream` block goes inside `http`, outside of any `server` block.
- `proxy_pass` references the upstream by name: `http://api_backends`.

### upstream and the Trailing Slash

The same trailing-slash rule applies:

```nginx
# Full URI forwarded:
proxy_pass http://api_backends;

# Prefix stripped:
proxy_pass http://api_backends/;
```

---

## Load-Balancing Methods

When an upstream has multiple backends, nginx must decide which one handles each request. This decision is the **load-balancing method**.

### Round Robin (Default)

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;
}
```

Requests are distributed evenly, one after another: backend-1, backend-2, backend-1, backend-2, ...

**When to use:** The default. Works well when backends are identical and requests are roughly equal in cost.

**When it's not ideal:** When some requests are much heavier than others (one backend gets an expensive query, the other gets a cheap one — the expensive backend falls behind while round-robin keeps sending traffic to both equally).

### Weighted Round Robin

```nginx
upstream api_backends {
    server backend1:3001 weight=3;
    server backend2:3001 weight=1;
}
```

Backend-1 gets 3 out of every 4 requests. Backend-2 gets 1 out of 4.

**When to use:** When backends have different capacities (one machine is more powerful than the other).

### Least Connections

```nginx
upstream api_backends {
    least_conn;
    server backend1:3001;
    server backend2:3001;
}
```

Each new request goes to the backend with the fewest active connections at that moment.

**When to use:** When requests have varying processing times. A backend that finishes fast will have fewer active connections and get more new requests. A backend that's slow on a heavy query won't get piled on.

**When to use over round-robin:** If your API endpoints have unpredictable response times (some return in 5ms, some in 5 seconds), least connections distributes load more fairly than round-robin.

### IP Hash

```nginx
upstream api_backends {
    ip_hash;
    server backend1:3001;
    server backend2:3001;
}
```

The client's IP address determines which backend they go to. The same client IP always hits the same backend (as long as it's healthy).

**When to use:** When the backend stores session state in memory (not in a shared database or Redis). This is called **sticky sessions** — the client "sticks" to one backend.

**When to avoid:** When clients share IPs (corporate NAT, mobile carrier NAT). All users behind the same IP go to the same backend, creating uneven load. Sticky sessions also complicate horizontal scaling — if you add a new backend, the hash redistribution changes where some clients land. If possible, move session state to a shared store (Redis, database) and use round-robin or least connections instead.

### Summary Table

| Method | Directive | Best for |
|---|---|---|
| Round robin | (default) | Equal backends, uniform request cost |
| Weighted | `weight=N` | Backends with different capacities |
| Least connections | `least_conn` | Varying request processing times |
| IP hash | `ip_hash` | Session affinity (sticky sessions) |

There are other methods (random, hash on arbitrary key), but these four cover the vast majority of production use cases.

---

## Backend Health — What Happens When a Backend Fails

In open-source nginx, health checking is **passive**. nginx doesn't actively probe backends. Instead, it watches what happens when it sends real requests.

### `max_fails` and `fail_timeout`

```nginx
upstream api_backends {
    server backend1:3001 max_fails=3 fail_timeout=30s;
    server backend2:3001 max_fails=3 fail_timeout=30s;
}
```

- **`max_fails=3`** — If a backend fails 3 times within the `fail_timeout` window, mark it as **unavailable**.
- **`fail_timeout=30s`** — Two things: (1) the window for counting failures, and (2) how long the backend stays marked unavailable before nginx tries it again.

What counts as a "failure"? By default, a connection error or a timeout (the backend didn't respond). You can customize this with `proxy_next_upstream`.

### What Happens Step by Step

```text
1. Request to backend-1 → connection refused (fail count: 1)
2. Request to backend-1 → connection refused (fail count: 2)
3. Request to backend-1 → connection refused (fail count: 3)
4. nginx marks backend-1 as unavailable for 30 seconds.
5. All requests go to backend-2.
6. After 30 seconds, nginx sends one request to backend-1 to test it.
7. If it succeeds → backend-1 is available again.
8. If it fails → back to unavailable for another 30 seconds.
```

### When All Backends Are Down

If every server in the upstream is marked unavailable, nginx resets all of them to "available" and tries again. It doesn't just return errors — it falls back to trying everyone. This means you'll see errors (502s) but nginx keeps attempting recovery.

### `proxy_next_upstream` — Retry on Failure

```nginx
location /api/ {
    proxy_pass http://api_backends;
    proxy_next_upstream error timeout http_502;
}
```

This tells nginx: if the chosen backend returns an error, a timeout, or a 502, try the **next** backend in the upstream instead of immediately returning the error to the client.

This improves reliability — a single backend crash doesn't produce user-visible errors as long as another backend is healthy.

**Be careful:** Don't retry non-idempotent requests (POST, PUT, DELETE) without understanding the consequences. If the first backend received the request and started processing it before timing out, retrying on a second backend could cause duplicate operations. By default, `proxy_next_upstream` only retries on connection errors and timeouts, not after the backend has started sending a response.

```nginx
# Safer: only retry on connection failures, not after data is sent
proxy_next_upstream error timeout;
proxy_next_upstream_tries 2;       # try at most 2 backends total
proxy_next_upstream_timeout 10s;   # give up after 10s of total retrying
```

---

## Lab: Load Balancing Across Two Backends (Stage 3)

### Goal

Add a second backend to the upstream and configure load balancing. This is Stage 3 of our continuous project.

### Step 1: Update nginx.conf

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
    }

    server {
        listen 80;
        server_name localhost;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Proxy API requests to the upstream group
        location /api/ {
            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;
        }
    }
}
```

### Step 2: Reload

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

### Step 3: Test load balancing

Run several requests:

```bash
for i in $(seq 1 6); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

Expected output (round-robin — alternating):

```text
  "instance": "backend-1",
  "instance": "backend-2",
  "instance": "backend-1",
  "instance": "backend-2",
  "instance": "backend-1",
  "instance": "backend-2",
```

Requests alternate between the two backends. This is round-robin in action.

### Step 4: Test least_conn

Update the upstream block:

```nginx
    upstream api_backends {
        least_conn;
        server backend1:3001;
        server backend2:3001;
    }
```

Reload and test:

```bash
docker compose exec nginx nginx -s reload
for i in $(seq 1 6); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

With only simple requests, the distribution looks similar to round-robin. The difference appears under real load when requests have varying durations — the backend with fewer active connections gets the next request.

**Revert to round-robin** (remove `least_conn;`) for the rest of the guide, or keep `least_conn` if you prefer — both are solid defaults.

### Step 5: Test backend failure

Stop one backend:

```bash
docker compose stop backend1
```

Now send requests:

```bash
for i in $(seq 1 4); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

Expected:

```text
  "instance": "backend-2",
  "instance": "backend-2",
  "instance": "backend-2",
  "instance": "backend-2",
```

All requests go to backend-2. nginx detected that backend-1 is unreachable and stopped sending traffic to it.

Check the error log:

```bash
docker compose exec nginx cat /var/log/nginx/error.log | tail -5
```

You should see something like:

```text
connect() failed (111: Connection refused) while connecting to upstream,
client: 172.18.0.1, server: localhost, request: "GET /api/test HTTP/1.1",
upstream: "http://172.18.0.2:3001/api/test", host: "localhost"
```

This tells you exactly what happened: nginx tried to connect to the backend, the connection was refused. Because `proxy_next_upstream` is configured, nginx retried on the other backend and the client got a successful response.

### Step 6: Bring backend-1 back

```bash
docker compose start backend1
```

Wait a few seconds (for `fail_timeout` to expire), then test again:

```bash
for i in $(seq 1 4); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

Both backends are serving again.

### Step 7: Test when ALL backends are down

```bash
docker compose stop backend1 backend2
curl -v http://localhost:8080/api/test
```

Expected:

```text
< HTTP/1.1 502 Bad Gateway
...
<html>
<head><title>502 Bad Gateway</title></head>
```

When no backends are reachable, nginx returns 502. This is the error you investigate when the "site is down."

Bring them back:

```bash
docker compose start backend1 backend2
```

Stage 3 is complete. nginx is load-balancing across two backends with failure detection and retry.

---

## Keepalive Connections to Upstreams

By default, nginx opens a new TCP connection to the backend for every proxied request and closes it when the response is complete. With high traffic, this creates and destroys thousands of connections per second — each one costing a TCP handshake.

**Keepalive connections** keep TCP connections to backends open and reuse them for multiple requests:

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;

    keepalive 32;
}
```

`keepalive 32` means each worker keeps up to 32 idle connections to this upstream group alive and ready for reuse.

For keepalive to work, you must also tell nginx to use HTTP/1.1 to the backend (HTTP/1.0 doesn't support persistent connections):

```nginx
location /api/ {
    proxy_pass http://api_backends;
    include /etc/nginx/proxy_params;

    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

`proxy_http_version 1.1` switches from the default HTTP/1.0 to 1.1 for the upstream connection. `proxy_set_header Connection ""` clears the Connection header so the backend doesn't close the connection after each response.

### Why This Matters in Production

Without keepalive, at 1,000 requests/second, nginx creates and destroys 1,000 TCP connections per second to your backends. Each connection requires a TCP handshake (and potentially TLS handshake if you encrypt internal traffic). With keepalive, established connections are reused, eliminating that overhead.

The performance difference is measurable, especially under high load.

---

## The Complete Stage 3 Config

Here is the full `nginx.conf` as it stands at the end of this volume:

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

    server {
        listen 80;
        server_name localhost;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Proxy API requests to the upstream group
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

This config:

- Serves static files at `/` from disk.
- Proxies `/api/` requests to two backends with round-robin load balancing.
- Preserves client IP and hostname via proxy headers.
- Uses keepalive connections to backends.
- Retries on failure with limits.
- Has reasonable timeouts.

---

## Things Senior Engineers Notice

1. **The trailing-slash trap is the most common proxy misconfiguration.** Every team hits it at least once. When `/api/` requests suddenly return 404 from the backend, check the `proxy_pass` URI first.

2. **Proxy headers are not set by default.** If your backend logs show nginx's IP for every request instead of real client IPs, you forgot `proxy_set_header`. Check whether `proxy_params` is included in every proxied `location`.

3. **`proxy_read_timeout` is not the total request time.** It's the time between two successive reads. A response that sends data slowly but continuously will never trigger the timeout. A response that starts sending, then stalls completely for longer than the timeout, will.

4. **Passive health checks have a detection lag.** nginx only discovers a backend is down when a real user's request fails. The first few requests after a backend crash will fail (or get retried to a healthy backend). nginx Plus has active health checks that probe backends independently, but open-source nginx doesn't. This is a common interview topic.

5. **`keepalive` in the upstream is per-worker, not total.** `keepalive 32` means each worker keeps up to 32 idle connections. With 4 workers, you have up to 128 idle connections to that upstream. This is usually fine. Set it too high and you waste backend resources on idle connections; too low and you lose the keepalive benefit under load.

6. **`proxy_next_upstream` can cause duplicate requests.** If a POST request times out on backend-1 and nginx retries it on backend-2, you might create two orders/payments/records. For non-idempotent endpoints, either don't retry (`proxy_next_upstream off;` for that location) or make the backend idempotent.

7. **DNS resolution in upstream happens at startup.** If `server backend1:3001;` resolves to an IP at startup, nginx uses that IP until the next reload. If the IP changes (common with containers and cloud environments), nginx doesn't notice. In Docker Compose this is handled because Docker's DNS resolves service names. In other environments, you may need the `resolver` directive for dynamic DNS resolution.

8. **Buffering is your friend for most traffic.** Disabling it (`proxy_buffering off`) means the backend can't finish and move on — it's tied to the slow client's download speed. Only disable buffering for streaming endpoints where data needs to flow through immediately.

9. **502 vs 504 tells you different things.** 502 means nginx couldn't connect to the backend at all (it's down, wrong port, firewall). 504 means nginx connected but the backend didn't respond in time (it's slow, stuck, or overloaded). Different symptoms, different investigations.

10. **Connection reuse requires both sides to cooperate.** `keepalive` on the nginx side doesn't help if the backend closes connections after every request. Check your application server's keep-alive settings too.

---

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

## What's Next — Volume 3

In Volume 3, we add three critical production layers to our setup:

- **TLS termination** — HTTPS on the front door, with HTTP-to-HTTPS redirection.
- **Caching** — proxy cache for responses, cache keys, and the operational challenge of invalidation.
- **Security hardening** — rate limiting with `limit_req`, security headers, `server_tokens off`, IP-based access control, and what nginx can and cannot protect.

The continuous project evolves to Stages 4, 5, and 6: TLS, caching, rate limiting, and security headers. By the end of Volume 3, the config will look close to production-ready.
