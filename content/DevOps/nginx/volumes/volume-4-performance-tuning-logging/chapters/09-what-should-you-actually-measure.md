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

