## Reading the Error Log — Your First Debugging Tool

The error log is where nginx tells you when something goes wrong. Before we add more features, know where it is and what it says.

### Where Is It?

Default location: `/var/log/nginx/error.log`

In Docker:

```bash
docker compose exec nginx cat /var/log/nginx/error.log
docker compose exec nginx tail -f /var/log/nginx/error.log  # live follow
```

### What Do Log Levels Mean?

The error log has levels. From most severe to least:

| Level | When It Appears |
|---|---|
| `emerg` | nginx cannot start (bad config, can't bind to port) |
| `alert` | Something requires immediate action |
| `crit` | Critical problems (disk full, permissions) |
| `error` | Request-level errors (file not found, backend refused connection) |
| `warn` | Something unusual but not broken |
| `notice` | Normal but noteworthy events |
| `info` | General information |
| `debug` | Very verbose, for development only |

In the `main` context:

```nginx
error_log /var/log/nginx/error.log warn;
```

This logs `warn` and everything above it (warn, error, crit, alert, emerg). In production, `warn` or `error` is typical. `debug` creates enormous logs and should only be used temporarily.

### Reading an Error Line

```text
2026/09/16 10:23:45 [error] 1234#0: *5 open() "/var/www/static/missing.html" failed
(2: No such file or directory), client: 172.18.0.1, server: localhost,
request: "GET /missing.html HTTP/1.1", host: "localhost"
```

This tells you:

- **When:** 2026/09/16 10:23:45
- **Severity:** error
- **Worker PID:** 1234
- **What failed:** `open()` on a file path — file not found
- **Client IP:** 172.18.0.1
- **Which server block:** localhost
- **The request:** GET /missing.html
- **The host header:** localhost

This single line tells you the entire story: a client requested `/missing.html`, nginx tried to open `/var/www/static/missing.html`, and the file doesn't exist.

---

