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

