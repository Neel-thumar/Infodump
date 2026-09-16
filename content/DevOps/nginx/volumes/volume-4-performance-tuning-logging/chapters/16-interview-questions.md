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

