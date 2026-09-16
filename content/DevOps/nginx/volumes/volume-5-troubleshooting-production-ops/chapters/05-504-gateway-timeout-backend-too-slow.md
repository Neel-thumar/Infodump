## 504 Gateway Timeout — Backend Too Slow

### What It Means

nginx successfully connected to the backend, but the backend didn't send a complete response within the configured timeout.

### Common Causes

- The backend is processing a slow database query.
- The backend is deadlocked or stuck.
- The backend is overloaded (too many concurrent requests for its capacity).
- A downstream dependency of the backend (database, external API) is slow.
- `proxy_read_timeout` is set too low for a legitimately slow operation.

### Investigation

**Step 1: Check the error log.**

```text
upstream timed out (110: Connection timed out) while reading response header from upstream,
client: 172.18.0.1, server: localhost, request: "GET /api/reports HTTP/1.1",
upstream: "http://172.18.0.3:3001/api/reports", host: "localhost"
```

This confirms it's a timeout, not a connection failure. nginx connected fine; the backend just didn't answer in time.

**Step 2: Check whether this is isolated to one endpoint or widespread.**

```bash
grep "upstream timed out" /var/log/nginx/error.log | awk -F'"' '{print $2}' | sort | uniq -c
```

If it's concentrated on one endpoint (`/api/reports`), that endpoint has a specific performance problem. If it's spread across all endpoints, the backend itself is likely overloaded or a shared dependency (database) is slow.

**Step 3: Check backend logs and metrics directly.**

Look at what the backend was doing when the timeout occurred — slow query logs, thread pool exhaustion, memory pressure.

**Step 4: Determine if the timeout value itself is the problem.**

If the endpoint is *supposed* to take longer than `proxy_read_timeout` (a report generation endpoint, for example), the "failure" might just be a timeout that's too aggressive for that specific route.

### Fix

- If the backend is genuinely stuck: restart it, investigate the root cause (slow query, deadlock, resource exhaustion).
- If the operation is legitimately slow: increase `proxy_read_timeout` for that specific location, or better, make the operation asynchronous (return immediately, let the client poll for completion).
- If the backend is overloaded: scale horizontally (add more backend instances) or investigate why it's slow under this load.

### Prevention

- Set realistic, endpoint-specific timeouts rather than one global timeout for everything.
- Monitor `$upstream_response_time` trends to catch gradual backend slowdowns before they become timeouts.
- Consider circuit-breaker patterns at the application level for slow dependencies.

---

