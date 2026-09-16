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

