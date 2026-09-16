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

