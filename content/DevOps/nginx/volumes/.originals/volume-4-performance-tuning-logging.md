---
id: nginx-vol-4-performance-tuning-logging
title: "Volume 4 — Performance Tuning and Logging"
order: 4
description: "Worker and connection tuning, gzip, buffers, sendfile, structured access/error logging, custom log formats, and what to measure before touching anything."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 4 — Performance Tuning and Logging

After three volumes, our nginx serves static files, proxies and load-balances API requests, terminates TLS, caches responses, rate-limits abuse, and adds security headers. It works.

But does it work *well*? Under load, with real traffic, will it handle thousands of connections without running out of resources? And when something goes wrong at 2 AM, will the logs tell you what happened?

This volume covers two things that production nginx absolutely requires: **performance tuning** so nginx uses your machine efficiently, and **logging** so you can understand what nginx is actually doing.

## Why This Matters

Most nginx performance problems are not caused by nginx being slow. They're caused by incorrect defaults, misconfigured buffers, missing compression, or connection limits that don't match the traffic. Fixing these doesn't require exotic knowledge — it requires understanding what each setting controls and measuring before changing.

Logging is equally critical. nginx can tell you exactly what happened to every request: which backend served it, how long it took, what status code it returned, and whether caching was involved. But the default log format leaves out most of that. Custom logging turns nginx from a black box into an observable system.

## What You Will Be Able to Do After This Volume

- Understand and configure `worker_processes` and `worker_connections` for your machine.
- Tune keepalive connections on both sides (client and upstream).
- Configure gzip compression with appropriate tradeoffs.
- Adjust buffer sizes for real-world scenarios.
- Enable `sendfile`, `tcp_nopush`, and `tcp_nodelay` and know what each does.
- Know what to measure before tuning.
- Configure custom access log formats with upstream timing, cache status, and request details.
- Understand error log levels and use them effectively.
- Use conditional logging to reduce noise.
- Connect a log line to the full request lifecycle.
- Evolve the continuous project to Stage 7.

---

## The First Rule of Tuning: Measure Before You Change

This deserves its own section before any tuning advice because it is the most important point.

**Do not tune nginx based on blog posts.** Tune it based on what is actually happening on your system.

The default settings in modern nginx are sensible for most workloads. Changing them without understanding the current bottleneck can make things worse. Increasing `worker_connections` to 100,000 doesn't help if the bottleneck is a slow database behind your backend. Enabling aggressive gzip doesn't help if your responses are already small.

Before changing any performance setting, ask:

1. **What is the actual problem?** Slow responses? Connection timeouts? High CPU? High memory?
2. **Where is the bottleneck?** nginx itself? The backend? The network? The disk?
3. **What does the data say?** Check access logs (response times), error logs (connection failures, timeouts), system metrics (CPU, memory, open file descriptors, network).

Only after answering these questions does tuning make sense.

With that said, there are settings where the defaults are known to be suboptimal for specific patterns, and understanding them helps you configure nginx correctly from the start.

---

## Worker Tuning

### `worker_processes`

```nginx
worker_processes auto;
```

We covered this in Volume 1. `auto` sets one worker per CPU core. This is correct for almost every scenario because:

- Each worker is single-threaded and uses one core.
- More workers than cores means context-switching overhead.
- Fewer workers than cores leaves capacity unused.

**When you might change it:** On a machine shared with other CPU-intensive services, you might reduce workers to leave cores for those services. On a machine doing heavy TLS or gzip, `auto` is still usually right because those are exactly the CPU-bound tasks workers do.

### `worker_connections`

```nginx
events {
    worker_connections 1024;
}
```

Each worker can hold this many simultaneous connections. Total maximum connections:

```text
max connections = worker_processes × worker_connections
```

For a reverse proxy, each client request uses **two** connections in the worker: one from client to nginx, one from nginx to backend. So effective max clients:

```text
max simultaneous clients ≈ (worker_processes × worker_connections) / 2
```

On a 4-core machine with `worker_connections 1024`: approximately 2,048 simultaneous clients.

**When to increase:** If you expect high concurrency (thousands of simultaneous connections). A value of 2048 or 4096 handles most production loads. Going higher requires increasing the OS file descriptor limit too.

### File Descriptor Limits

Each connection uses a file descriptor. The OS limits how many file descriptors a process can open (check with `ulimit -n`). If `worker_connections` exceeds the file descriptor limit, nginx logs an error and rejects connections.

```nginx
worker_rlimit_nofile 8192;
```

This tells nginx to set the file descriptor limit for worker processes. A reasonable rule of thumb: set `worker_rlimit_nofile` to at least `2 × worker_connections`.

To check the current system limit:

```bash
ulimit -n
```

To change it system-wide (on systemd-managed systems), create `/etc/security/limits.d/nginx.conf`:

```text
nginx soft nofile 8192
nginx hard nofile 8192
```

Or in the systemd unit file:

```ini
[Service]
LimitNOFILE=8192
```

> **Senior insight:** Running out of file descriptors is a classic "everything was fine until we hit traffic" failure. nginx logs `worker_connections are not enough` or `too many open files`. This is not an nginx problem — it's an OS limit problem. Check `worker_connections` and `worker_rlimit_nofile` together.

---

## Keepalive Tuning

Keepalive connections avoid the overhead of creating a new TCP connection for every request. There are two separate keepalive settings: between the **client and nginx**, and between **nginx and the upstream**.

### Client-Side Keepalive

```nginx
http {
    keepalive_timeout  65s;
    keepalive_requests 100;
}
```

- **`keepalive_timeout 65s`** — How long an idle client connection stays open. After the last response, nginx waits this long for a new request before closing the connection. The default of 65 seconds is reasonable. Lowering it frees connections faster; raising it helps clients that make periodic requests.

- **`keepalive_requests 100`** — Maximum number of requests nginx serves on a single keepalive connection before closing it. The default of 1000 (in recent versions) is fine. This prevents a single connection from staying open indefinitely and leaking resources.

### Upstream Keepalive

We configured this in Volume 2:

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;
    keepalive 32;
}

location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_pass http://api_backends;
}
```

`keepalive 32` keeps up to 32 idle connections per worker to the upstream group. Under steady traffic, these connections get reused instead of being created and destroyed for every request.

**Tuning the number:**

- Too low (e.g., `keepalive 2`): Under moderate load, most requests create new connections, defeating the purpose.
- Too high (e.g., `keepalive 256`): Idle connections waste resources on both nginx and the backend.
- Right range: Start with 16–64 for typical API traffic. Monitor the number of new connections to upstreams. If it's still high, increase.

### `keepalive_timeout` to Upstreams

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;
    keepalive 32;
    keepalive_timeout 60s;
}
```

`keepalive_timeout 60s` in the upstream context (available in recent nginx versions) controls how long an idle upstream connection stays open. This should be slightly lower than the backend's own keepalive timeout to avoid nginx sending a request on a connection the backend has already closed.

---

## Gzip Compression

Compression reduces the size of responses sent to clients. Less data over the network means faster page loads and lower bandwidth costs.

```nginx
http {
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;
}
```

### What Each Directive Does

**`gzip on`** — Enable compression.

**`gzip_types`** — Which content types to compress. By default, nginx only compresses `text/html`. You need to explicitly add CSS, JavaScript, JSON, XML, etc. Don't compress already-compressed formats (images, videos, zip files) — it wastes CPU and doesn't reduce size.

**`gzip_min_length 256`** — Don't compress responses smaller than 256 bytes. The overhead of compression (CPU and the gzip header) isn't worth it for tiny responses. They might even get larger after compression.

**`gzip_comp_level 5`** — Compression level, 1 (fastest, least compression) to 9 (slowest, most compression). The sweet spot is usually 4–6. Going from 5 to 9 adds significant CPU for only marginally smaller output. Going below 3 saves CPU but compresses poorly.

Here's the general relationship:

```text
Level 1-3:  Fast, light compression.  Good for CPU-constrained servers.
Level 4-6:  Balanced.  Good default range.
Level 7-9:  Slow, heavy compression.  Rarely worth the CPU cost.
```

**`gzip_vary on`** — Adds `Vary: Accept-Encoding` to responses. This tells caches (CDNs, proxies) that the response varies based on whether the client supports gzip. Without this, a cache might serve a gzip-compressed response to a client that doesn't support it.

**`gzip_proxied any`** — Compress responses even when the request came through a proxy (identified by the `Via` header). Without this, proxied requests might not get compressed.

### The CPU vs Bandwidth Tradeoff

Compression uses CPU on every response. On a CPU-constrained server with many small responses, aggressive compression might slow things down. On a bandwidth-constrained server (or for clients on slow networks), compression is a significant win.

For most web applications, enabling gzip at level 4–6 is a clear net positive. The CPU cost is small compared to the bandwidth savings.

### Testing Compression

```bash
# Request without Accept-Encoding (no compression):
curl -k -s -D - https://localhost:8443/api/test -o /dev/null | grep -i content-length

# Request with Accept-Encoding (compressed):
curl -k -s -D - -H "Accept-Encoding: gzip" https://localhost:8443/api/test -o /dev/null | grep -iE "content-encoding|content-length"
```

If compression is working, the second request should show `Content-Encoding: gzip` and a smaller or missing `Content-Length` (chunked transfer).

---

## Buffer Tuning

Buffers control how nginx handles data in transit. The defaults work for most traffic, but certain patterns need adjustment.

### Client Request Buffers

```nginx
http {
    client_body_buffer_size   16k;
    client_max_body_size      10m;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;
}
```

**`client_body_buffer_size 16k`** — Buffer for the request body. If the body fits in memory, nginx processes it directly. If it's larger, nginx writes the excess to a temporary file on disk.

**`client_max_body_size 10m`** — Maximum allowed request body size. Requests larger than this are rejected with **413 Request Entity Too Large**. The default is 1 MB, which is too small for file uploads. Set it based on your largest expected upload.

This is one of the most common "it works locally but fails in production" issues: someone deploys an image upload feature, and nginx rejects everything over 1 MB before the request even reaches the backend.

```nginx
# For an upload endpoint:
location /api/upload/ {
    client_max_body_size 50m;
    proxy_pass http://api_backends;
}
```

**`large_client_header_buffers 4 8k`** — For requests with large headers. The default handles headers up to about 8 KB total (4 buffers × 8 KB). If your application uses large cookies or long authorization tokens, you might need to increase this.

When headers exceed the buffer: nginx returns **400 Bad Request**. The error log will show `client sent too long header line`. This is a classic gotcha with applications that store lots of data in cookies.

### Proxy Buffers

We touched on this in Volume 2:

```nginx
proxy_buffer_size    4k;
proxy_buffers        8 16k;
proxy_busy_buffers_size 32k;
```

**`proxy_buffer_size 4k`** — For the first part of the backend response (status line and headers). If your backend sends large headers (many Set-Cookie headers, for example), increase this.

**`proxy_buffers 8 16k`** — For the response body. 8 buffers of 16 KB each. If the response doesn't fit, it spills to disk (slower).

**`proxy_busy_buffers_size 32k`** — How much of the buffered response can be sent to the client while the rest is still being buffered.

**When to change proxy buffers:** If your backend responses are consistently large (several hundred KB), increase `proxy_buffers`. If your backend sends large headers, increase `proxy_buffer_size`. Monitor for `upstream sent too big header` in error logs.

The defaults are fine for typical API responses (JSON payloads under a few KB). Adjust only if you see related errors or know your response sizes are atypical.

---

## Static File Serving Optimizations

### `sendfile`

```nginx
http {
    sendfile on;
}
```

Without `sendfile`, nginx reads a file from disk into a user-space buffer, then writes it to the network socket. This involves copying data between kernel space and user space twice.

With `sendfile on`, the kernel transfers data directly from the file to the network socket without involving user-space buffers. This is significantly more efficient for serving static files.

**Always enable this.** There is no downside for normal use.

### `tcp_nopush`

```nginx
http {
    sendfile  on;
    tcp_nopush on;
}
```

Works with `sendfile`. Tells the kernel to wait until a full packet of data is ready before sending it, rather than sending partial packets. This reduces the number of network packets for large files.

Only has an effect when `sendfile` is on. Enable both together.

### `tcp_nodelay`

```nginx
http {
    tcp_nodelay on;
}
```

This is on by default. It disables Nagle's algorithm, which buffers small data writes to combine them into larger packets. For interactive traffic (API responses, web pages), you want data sent immediately, not delayed.

`tcp_nopush` and `tcp_nodelay` might seem contradictory (one delays sending, the other forces immediate sending), but nginx uses them at different phases: `tcp_nopush` while sending the body with `sendfile`, `tcp_nodelay` for the final packet and for non-sendfile data. They work well together.

### Summary of Static Optimizations

```nginx
http {
    sendfile    on;
    tcp_nopush  on;
    tcp_nodelay on;
}
```

These three lines are standard in every production config. They cost nothing and improve static file delivery.

---

## What Should You Actually Measure?

Before and after tuning, measure these:

| What to measure | How to measure | What it tells you |
|---|---|---|
| Response times (p50, p95, p99) | Access log with `$upstream_response_time`, or monitoring tools | Whether backends are slow |
| Request rate | Access log count, `stub_status` module | How much traffic nginx handles |
| Active connections | `stub_status` module | Whether you're near connection limits |
| Error rates (4xx, 5xx) | Access log analysis | Whether errors are increasing |
| CPU usage | `top`, `htop`, system monitoring | Whether workers are CPU-bound |
| Memory usage | System monitoring | Whether buffering is consuming too much memory |
| Open file descriptors | `ls /proc/<worker-pid>/fd | wc -l` | Whether you're near FD limits |

### The `stub_status` Module

nginx includes a simple built-in status page:

```nginx
server {
    listen 8081;

    location /nginx_status {
        stub_status;
        allow 127.0.0.1;
        deny all;
    }
}
```

Output:

```text
Active connections: 42
server accepts handled requests
 12345 12345 67890
Reading: 2 Writing: 8 Waiting: 32
```

- **Active connections:** Current open connections (including keep-alive idle ones).
- **accepts/handled/requests:** Total counters since nginx started.
- **Reading:** Connections where nginx is reading the request.
- **Writing:** Connections where nginx is writing the response.
- **Waiting:** Keep-alive connections waiting for a new request.

This is basic but useful for a quick health check. For production monitoring, you'd scrape these numbers with Prometheus, Datadog, or similar tools.

> **Important:** Bind this to a separate port (8081) and restrict to `allow 127.0.0.1; deny all;` so it's not publicly accessible.

---

## Logging — Making nginx Observable

### Access Log — What Happened to Each Request

The access log records every request nginx handles. The default format:

```text
172.18.0.1 - - [16/Sep/2026:10:23:45 +0000] "GET /api/test HTTP/1.1" 200 134 "-" "curl/8.5.0"
```

This tells you: client IP, time, request method/URI/protocol, response status, body size, referrer, and user agent. It's useful but missing critical information: **how long did it take?** **Which backend handled it?** **Was it cached?**

### Custom Log Format

A production-grade log format includes upstream timing, cache status, and request details:

```nginx
http {
    log_format main
        '$remote_addr - $remote_user [$time_local] '
        '"$request" $status $body_bytes_sent '
        '"$http_referer" "$http_user_agent" '
        'rt=$request_time '
        'urt=$upstream_response_time '
        'us=$upstream_status '
        'ua=$upstream_addr '
        'cs=$upstream_cache_status';

    access_log /var/log/nginx/access.log main;
}
```

### What Each Variable Means

| Variable | What it records |
|---|---|
| `$remote_addr` | Client IP |
| `$remote_user` | Client username (from HTTP basic auth; usually `-`) |
| `$time_local` | Timestamp |
| `$request` | Full request line (`GET /api/test HTTP/1.1`) |
| `$status` | Response status code |
| `$body_bytes_sent` | Size of the response body sent to the client |
| `$http_referer` | Referrer header |
| `$http_user_agent` | User-Agent header |
| `$request_time` | Total time from first byte received from client to last byte sent to client (in seconds, with millisecond precision) |
| `$upstream_response_time` | Time the backend took to respond (from connection to last byte of response) |
| `$upstream_status` | Status code from the backend (not the same as `$status` if nginx modifies it) |
| `$upstream_addr` | Which backend server handled the request |
| `$upstream_cache_status` | Cache status: HIT, MISS, EXPIRED, BYPASS, etc. |

### Reading a Custom Log Line

```text
172.18.0.1 - - [16/Sep/2026:10:23:45 +0000] "GET /api/orders HTTP/1.1" 200 1234 "-" "Mozilla/5.0" rt=0.052 urt=0.048 us=200 ua=172.18.0.3:3001 cs=MISS
```

This tells a complete story:

- Client `172.18.0.1` requested `GET /api/orders`.
- Total request time: 52 ms (`rt=0.052`).
- Backend response time: 48 ms (`urt=0.048`). The 4 ms difference is nginx overhead (TLS, buffering, network).
- Backend `172.18.0.3:3001` handled it and returned status 200.
- Cache status: MISS — the response was fetched from the backend, not cache.

Compare with a cached response:

```text
172.18.0.1 - - [16/Sep/2026:10:23:46 +0000] "GET /api/orders HTTP/1.1" 200 1234 "-" "Mozilla/5.0" rt=0.001 urt=- us=- ua=- cs=HIT
```

Request time: 1 ms. Upstream fields are `-` because the backend was never contacted. Cache: HIT.

### Why This Matters for Debugging

With this log format, you can answer questions that are impossible with default logging:

| Question | What to look at |
|---|---|
| "Why is the site slow?" | `$request_time` and `$upstream_response_time`. If `urt` is high, the backend is slow. If `rt` is high but `urt` is low, the problem is between nginx and the client (slow network, large response). |
| "Which backend is slow?" | `$upstream_addr`. Filter logs by backend address and compare response times. |
| "Is caching working?" | `$upstream_cache_status`. If everything is MISS, caching isn't configured correctly or the cache key is too specific. |
| "Are we getting 502s?" | `$status` and `$upstream_status`. If `$status` is 502 and `$upstream_addr` is `-`, nginx couldn't reach any backend. |
| "Is one backend getting more errors?" | Combine `$upstream_addr` and `$upstream_status`. |

### JSON Log Format

For logs that feed into a log aggregation system (ELK, Loki, Datadog), JSON format is easier to parse:

```nginx
log_format json_log escape=json
    '{'
      '"time": "$time_iso8601", '
      '"remote_addr": "$remote_addr", '
      '"request": "$request", '
      '"status": $status, '
      '"body_bytes_sent": $body_bytes_sent, '
      '"request_time": $request_time, '
      '"upstream_response_time": "$upstream_response_time", '
      '"upstream_addr": "$upstream_addr", '
      '"upstream_status": "$upstream_status", '
      '"upstream_cache_status": "$upstream_cache_status", '
      '"http_user_agent": "$http_user_agent"'
    '}';

access_log /var/log/nginx/access.json json_log;
```

`escape=json` ensures special characters in variables are properly escaped for valid JSON output.

This produces lines like:

```json
{"time": "2026-09-16T10:23:45+00:00", "remote_addr": "172.18.0.1", "request": "GET /api/test HTTP/1.1", "status": 200, "body_bytes_sent": 134, "request_time": 0.052, "upstream_response_time": "0.048", "upstream_addr": "172.18.0.3:3001", "upstream_status": "200", "upstream_cache_status": "MISS", "http_user_agent": "curl/8.5.0"}
```

Each line is a valid JSON object. Log aggregation tools can parse and index every field automatically.

---

## Error Log — When Things Go Wrong

The access log records what happened. The error log records what went wrong.

### Log Levels

```nginx
error_log /var/log/nginx/error.log warn;
```

Levels from most to least severe:

| Level | What it captures |
|---|---|
| `emerg` | nginx can't start |
| `alert` | Requires immediate action |
| `crit` | Critical problems (disk full, out of memory) |
| `error` | Request-level failures (file not found, backend unreachable, timeout) |
| `warn` | Unusual but not broken (header buffer too small, upstream response buffered to disk) |
| `notice` | Normal noteworthy events |
| `info` | General information |
| `debug` | Extremely verbose, every step of request processing |

**Production recommendation:** `warn` or `error`. `warn` catches important issues without drowning you in noise.

**Debugging a specific problem:** Temporarily switch to `info` or `debug`, reproduce the issue, then switch back. `debug` creates enormous log volume and should never run in production continuously.

> **Note:** `debug` requires nginx compiled with `--with-debug`. Most distribution packages include it, but verify with `nginx -V 2>&1 | grep debug`.

### Connecting Error Log to a Specific Request

Error log entries include enough context to match them to specific requests:

```text
2026/09/16 10:23:45 [error] 1234#0: *892 upstream timed out (110: Connection timed out)
while reading response header from upstream, client: 172.18.0.1, server: localhost,
request: "GET /api/slow-endpoint HTTP/1.1", upstream: "http://172.18.0.3:3001/api/slow-endpoint",
host: "localhost"
```

From this line you know:

- **When:** 2026/09/16 10:23:45
- **What failed:** upstream timeout while reading response headers
- **Client:** 172.18.0.1
- **Request:** GET /api/slow-endpoint
- **Which backend:** 172.18.0.3:3001
- **The upstream URI nginx tried:** /api/slow-endpoint

Cross-reference with the access log for the same timestamp and client IP to see the complete picture (what status code the client got, total request time, etc.).

---

## Conditional Logging

Sometimes you want to log only certain requests — errors, slow requests, or specific paths.

### Log Only Errors

```nginx
map $status $loggable_error {
    ~^[23] 0;
    default 1;
}

access_log /var/log/nginx/errors-only.log main if=$loggable_error;
```

This logs only requests with status codes that don't start with 2 or 3 (i.e., 4xx and 5xx). The `map` directive creates a variable: `$loggable_error` is `0` (don't log) for 2xx/3xx, `1` (log) for everything else.

### Log Slow Requests

```nginx
map $request_time $slow_request {
    ~^[0-9]\.[0-4]  0;
    default          1;
}

access_log /var/log/nginx/slow.log main if=$slow_request;
```

This is a rough filter that logs requests taking 0.5 seconds or more. The regex is imprecise but illustrates the concept. In practice, you'd use log aggregation tools to filter by `$request_time` rather than doing it in nginx.

### Multiple Log Files

nginx supports multiple `access_log` directives in the same context:

```nginx
access_log /var/log/nginx/access.log main;
access_log /var/log/nginx/access.json json_log;
```

Both log files are written simultaneously. This lets you keep a human-readable log and a machine-parseable JSON log.

### Disabling Logging for Health Checks

Load balancers and monitoring systems hit your nginx every few seconds with health checks. These flood the access log with noise:

```nginx
location = /health {
    access_log off;
    return 200 "ok\n";
    default_type text/plain;
}
```

`access_log off` suppresses logging for this location. The health check still works; it just doesn't fill your logs.

---

## Log Rotation

nginx writes to log files continuously. Without rotation, they grow until they fill the disk.

On most Linux distributions, `logrotate` handles this automatically. The default config (usually at `/etc/logrotate.d/nginx`) rotates logs daily and keeps 14 days.

If you need to manually trigger log rotation:

```bash
# Move the current log
mv /var/log/nginx/access.log /var/log/nginx/access.log.1

# Tell nginx to reopen log files
nginx -s reopen
```

The `reopen` signal tells nginx to close the old file handle and open a new file at the configured path. This is safe during live traffic — no log lines are lost.

In Docker, logs are often collected from `stdout`/`stderr` by the container runtime. You can configure nginx to log to stdout:

```nginx
access_log /dev/stdout main;
error_log  /dev/stderr warn;
```

This lets Docker's logging driver handle collection and rotation.

---

## Lab: Performance Tuning and Structured Logging (Stage 7)

### Goal

Add performance settings and structured logging to the continuous project.

### Update nginx.conf — Complete Stage 7 Config

```nginx
worker_processes auto;
worker_rlimit_nofile 4096;

events {
    worker_connections 2048;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server_tokens off;

    # --- Performance ---
    sendfile    on;
    tcp_nopush  on;
    tcp_nodelay on;

    keepalive_timeout  65s;
    keepalive_requests 1000;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;

    # Client buffers
    client_body_buffer_size   16k;
    client_max_body_size      10m;
    large_client_header_buffers 4 16k;

    # --- Logging ---
    log_format main
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

    # --- Rate Limiting ---
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_status 429;

    # --- Caching ---
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    # --- Upstreams ---
    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
        keepalive 32;
    }

    # --- HTTP → HTTPS ---
    server {
        listen 80;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    # --- Main HTTPS Server ---
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

        # Slow-client protection
        client_body_timeout   10s;
        client_header_timeout 10s;

        # Health check (no logging)
        location = /health {
            access_log off;
            return 200 "ok\n";
            default_type text/plain;
        }

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;

            location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
                expires 30d;
                add_header Cache-Control "public, immutable" always;
                add_header X-Frame-Options        "SAMEORIGIN" always;
                add_header X-Content-Type-Options "nosniff" always;
            }
        }

        # API proxy
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

### Apply and Test

```bash
docker compose down
docker compose up -d
```

**Test the health endpoint:**

```bash
curl -k https://localhost:8443/health
```

Expected: `ok`

**Test gzip:**

```bash
curl -k -s -D - -H "Accept-Encoding: gzip" https://localhost:8443/api/test -o /dev/null 2>&1 | grep -i content-encoding
```

Expected: `Content-Encoding: gzip`

**Test custom log format:**

```bash
curl -k https://localhost:8443/api/test
docker compose exec nginx tail -1 /var/log/nginx/access.log
```

Expected: a log line with `rt=`, `urt=`, `us=`, `ua=`, `cs=` fields.

**Test cached vs uncached log entries:**

```bash
# First request (MISS)
curl -k https://localhost:8443/api/test
docker compose exec nginx tail -1 /var/log/nginx/access.log
# Look for cs=MISS

# Second request (HIT)
curl -k https://localhost:8443/api/test
docker compose exec nginx tail -1 /var/log/nginx/access.log
# Look for cs=HIT, urt=- (no upstream contacted)
```

**Verify server token is hidden:**

```bash
curl -k -s -D - https://localhost:8443/ -o /dev/null | grep -i server
```

Expected: `Server: nginx` (no version number).

Stage 7 is complete. The config now includes performance tuning and structured logging.

---

## Things Senior Engineers Notice

1. **The default `client_max_body_size` of 1 MB catches everyone.** New feature with file uploads? nginx rejects it before the backend ever sees it. The 413 error is unmistakable once you know to look for it, but mysterious if you don't.

2. **`$request_time` includes client transfer time, `$upstream_response_time` doesn't.** If a user on a slow network downloads a 5 MB response, `$request_time` might be 10 seconds while `$upstream_response_time` is 50 ms. The backend was fast; the network was slow. Without both variables, you'd blame the backend.

3. **`sendfile`, `tcp_nopush`, and `tcp_nodelay` should be in every production config.** They're free performance improvements for static file serving. There's no reason not to enable them.

4. **Gzip level 9 is almost never worth it.** The compression improvement from level 5 to 9 is typically 5–10% smaller output for 3–5x more CPU. Level 4–6 is the practical sweet spot.

5. **Monitoring `worker_connections` usage is more important than setting it high.** If your workers never use more than 200 connections each, setting `worker_connections 65536` doesn't help. If they regularly hit the limit, you need to increase it *and* the file descriptor limit. Check active connections with `stub_status`.

6. **Log everything in production, filter in your log pipeline.** It's tempting to use conditional logging to reduce log volume. But when you need to debug a problem, the request you need is the one you filtered out. Log everything to a structured format, send it to a log aggregation system, and filter there.

7. **Upstream keepalive saves more than you'd expect.** Without it, every proxied request pays a TCP handshake cost (~1 ms on the same machine, more across networks). At 1,000 requests/second, that's 1,000 handshakes/second. With keepalive, established connections are reused and the handshake cost is amortized. If you also use TLS to backends, the savings are even larger.

8. **`access_log off` for health checks is essential for readable logs.** A health check every 5 seconds from three monitoring sources produces over 50,000 log lines per day of useless noise. Turn it off for those endpoints.

9. **JSON logs are harder to read with `tail -f` but vastly easier for aggregation tools.** Use both: a human-readable log for quick terminal debugging, and a JSON log that feeds into your monitoring stack.

10. **The `map` directive is one of nginx's most underused features.** It creates variables based on other variables. Beyond conditional logging, it's useful for routing decisions, cache bypass logic, and setting different timeouts based on request properties — all without `if` blocks (which have their own gotchas in nginx).

---

## Interview Questions

### Level 1 — Fundamentals

**Q: What does gzip compression do in nginx?**

Gzip compresses response bodies before sending them to the client, reducing the amount of data transferred over the network. The client's browser decompresses it automatically. This reduces bandwidth usage and improves page load times, at the cost of some CPU on the server.

**Q: What is the purpose of nginx's access log?**

The access log records every request nginx handles: client IP, timestamp, request method and URI, response status, body size, and (with custom formats) upstream timing, cache status, and more. It's the primary tool for understanding traffic patterns and debugging request-level issues.

### Level 2 — Practical

**Q: A user uploads a 5 MB image and gets an error, but the backend never receives the request. What's the likely cause?**

`client_max_body_size` is set too low (default is 1 MB). nginx rejects the request with 413 before forwarding it to the backend. Increase `client_max_body_size` for the upload endpoint.

**Q: How would you determine whether a slow response is caused by nginx or the backend?**

Compare `$request_time` (total time, including client transfer) with `$upstream_response_time` (backend processing time) in the access log. If `$upstream_response_time` is high, the backend is slow. If `$request_time` is much higher than `$upstream_response_time`, the delay is in network transfer between nginx and the client.

**Q: What do `sendfile`, `tcp_nopush`, and `tcp_nodelay` do?**

`sendfile` enables efficient kernel-level file transfer without user-space copying. `tcp_nopush` batches data into full network packets before sending (works with `sendfile`). `tcp_nodelay` disables Nagle's algorithm so small data chunks are sent immediately. Together, they optimize both large file delivery and small response latency.

### Level 3 — Scenario Based

**Q: nginx is using high CPU. How would you investigate?**

How to think:

1. Check which process is using CPU: `top` or `htop`. Is it the nginx workers or the backends?
2. If nginx workers: check gzip compression level. Level 7+ is CPU-intensive. Reduce to 4–5.
3. Check TLS handshake volume. Many new TLS connections (no session reuse) are CPU-expensive. Verify `ssl_session_cache` is configured.
4. Check if `sendfile` is enabled. Without it, static file serving uses more CPU.
5. Check request volume. nginx handling tens of thousands of requests/second will use CPU. Verify this is expected traffic and not an attack.

**Q: You're seeing `worker_connections are not enough` in the error log. What do you do?**

How to think:

1. Current `worker_connections` is too low for the traffic. Increase it.
2. Check `worker_rlimit_nofile` — it must be at least `2 × worker_connections`. Increase if needed.
3. Check the OS file descriptor limit (`ulimit -n`). Increase system-wide if necessary.
4. Also consider: are connections piling up because backends are slow (connections aren't being released)? Fixing backend latency reduces the number of concurrent connections nginx holds.

### Level 4 — Senior Thinking

**Q: How would you set up nginx logging for a system that needs to handle incident investigations?**

Use a JSON log format with all relevant fields: client IP, request, status, request time, upstream response time, upstream address, upstream status, cache status, request ID (if generated), and user agent. Send logs to a centralized aggregation system (ELK, Loki, Datadog). Retain logs for at least 30 days. Add a request ID header (`$request_id`) and pass it to backends so you can trace a request across nginx and backend logs. Don't filter logs at the nginx level — aggregate everything and filter in the query layer.

**Q: What is the difference between tuning nginx and tuning the backend?**

nginx tuning addresses the traffic-handling layer: connection capacity, static file delivery, compression, buffering, and TLS performance. Backend tuning addresses application logic: database queries, business logic, memory usage. Most "slow response" problems are backend problems, not nginx problems. The access log with `$upstream_response_time` tells you which one to investigate. Tuning nginx doesn't fix a slow database query.

---

## What's Next — Volume 5

Volume 5 is the operational heart of the guide: **Troubleshooting and Production Operations**.

We will systematically debug real nginx failures (502, 504, 403, TLS errors, wrong location matches, connection limit exhaustion), learn the investigation process for each, and cover production operations: reload vs restart under real traffic, zero-downtime deploys, config management, and production architecture patterns.

This is where everything from the first four volumes comes together. Configuration knowledge becomes operational skill.
