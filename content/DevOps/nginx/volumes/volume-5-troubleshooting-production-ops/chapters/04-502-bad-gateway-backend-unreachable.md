## 502 Bad Gateway — Backend Unreachable

### What It Means

nginx tried to forward the request to a backend but could not establish a connection, or the backend closed the connection unexpectedly.

### Common Causes

- The backend process crashed or isn't running.
- The backend is listening on a different port than nginx expects.
- A firewall is blocking the connection between nginx and the backend.
- The backend refused the connection (out of worker threads, connection limit reached).
- DNS resolution failed for the upstream hostname.
- All backends in the upstream are marked unavailable (from previous failures via `max_fails`).

### Investigation

**Step 1: Check the error log.**

```bash
docker compose exec nginx tail -20 /var/log/nginx/error.log
```

Look for lines like:

```text
connect() failed (111: Connection refused) while connecting to upstream,
client: 172.18.0.1, server: localhost, request: "GET /api/test HTTP/1.1",
upstream: "http://172.18.0.3:3001/api/test", host: "localhost"
```

This tells you exactly which upstream address nginx tried and what happened. `Connection refused` means the backend isn't listening on that port at all.

**Step 2: Verify the backend is actually running.**

```bash
docker compose ps
docker compose logs backend1
```

If the backend container exited or crashed, this shows it immediately.

**Step 3: Test connectivity directly, bypassing nginx.**

```bash
docker compose exec nginx curl http://backend1:3001/
```

If this also fails, the problem is confirmed to be between nginx and the backend (network or backend), not nginx's proxy configuration.

**Step 4: Check if all backends are down.**

```text
no live upstreams while connecting to upstream
```

This specific error means every server in the upstream group is currently marked unavailable. Check `max_fails`/`fail_timeout` settings and recent backend history.

### Fix

- Restart the crashed backend.
- Correct the port/address in the `upstream` block if it's wrong.
- Check firewall rules if backend and nginx are on different hosts.
- If backends are flapping (crashing repeatedly), the 502s are a symptom of an application problem, not an nginx problem — investigate backend logs.

### Prevention

- Use `proxy_next_upstream` so a single backend failure doesn't produce a user-visible 502 as long as another backend is healthy.
- Monitor backend health independently (process monitoring, container restart policies).
- Alert on 502 rate increases so you catch backend crashes quickly.

---

