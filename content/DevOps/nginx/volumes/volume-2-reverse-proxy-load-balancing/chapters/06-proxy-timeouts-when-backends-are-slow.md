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

