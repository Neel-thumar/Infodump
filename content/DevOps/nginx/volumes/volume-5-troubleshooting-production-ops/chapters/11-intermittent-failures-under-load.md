## Intermittent Failures Under Load

### What It Means

Everything works fine under normal traffic, but under load (traffic spikes, load testing, peak hours), some requests start failing — often with 502s, 504s, or connection resets, and often not consistently reproducible.

### Common Causes

- `worker_connections` limit reached — new connections are refused.
- File descriptor limit reached (`worker_rlimit_nofile` too low or OS limit too low).
- Backend connection pool exhausted (backend can't accept more connections than nginx is sending).
- Rate limiting (`limit_req`, `limit_conn`) is triggering more aggressively than expected under real traffic patterns.
- Upstream `keepalive` pool too small, causing excessive new connection creation under load.

### Investigation

**Step 1: Check `stub_status` during the load event (or from logs/metrics captured during it).**

```text
Active connections: 2048
Reading: 512 Writing: 1400 Waiting: 136
```

If `Active connections` is at or near your `worker_connections × worker_processes` limit, you've found the bottleneck.

**Step 2: Check the error log for resource-limit messages.**

```text
2026/09/16 14:00:12 [alert] 1234#0: 1024 worker_connections are not enough
```

This is explicit — nginx is telling you it ran out of connection slots.

```text
2026/09/16 14:00:15 [error] 1234#0: accept4() failed (24: Too many open files)
```

This means the file descriptor limit was hit.

**Step 3: Check if rate limiting is the actual cause.**

```bash
grep "limiting requests" /var/log/nginx/error.log | wc -l
```

```text
2026/09/16 14:00:20 [error] 1234#0: *9821 limiting requests, excess: 10.500 by zone "api_limit",
client: 172.18.0.1, server: localhost, request: "GET /api/test HTTP/1.1"
```

If this appears heavily during the load event, legitimate traffic is being rate-limited, not failing due to resource exhaustion.

**Step 4: Check backend-side connection limits.**

The backend application might have its own connection pool or worker limit that's smaller than what nginx is sending. Even if nginx has capacity, the backend rejecting connections looks like an nginx-side 502 from the client's perspective.

### Fix

- Increase `worker_connections` and `worker_rlimit_nofile` together, matched to expected peak load.
- Increase upstream `keepalive` pool size if new-connection churn is high.
- Adjust rate limiting (`burst`, `rate`) if legitimate traffic is being throttled.
- Scale the backend (more instances, more capacity) if it's the actual bottleneck.

### Prevention

- Load test before peak events (sales, launches, marketing pushes) to find limits proactively rather than discovering them live.
- Set monitoring alerts on active connection count as a percentage of the configured maximum.
- Have a documented, tested process for scaling nginx and backend capacity quickly.

---

