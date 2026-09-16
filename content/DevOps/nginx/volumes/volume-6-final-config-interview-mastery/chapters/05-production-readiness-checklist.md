## Production Readiness Checklist

Before trusting any nginx configuration in production, verify:

### Configuration Safety

- [ ] Config is in version control.
- [ ] `nginx -t` passes with zero warnings.
- [ ] Config has been tested in a staging environment identical to production.
- [ ] Deploy process uses `nginx -s reload`, never a blind restart, for routine changes.

### TLS

- [ ] Certificate is from a trusted CA (not self-signed) for public-facing services.
- [ ] Certificate auto-renewal is configured and tested.
- [ ] Certificate expiry monitoring/alerting is in place.
- [ ] `ssl_protocols` excludes TLS 1.0/1.1.
- [ ] HTTP → HTTPS redirect is in place.
- [ ] HSTS is enabled (after confirming HTTPS is stable).

### Reverse Proxy / Load Balancing

- [ ] Proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) are set on every proxied location.
- [ ] Trailing-slash behavior on every `proxy_pass` has been deliberately checked.
- [ ] Timeouts (`proxy_connect_timeout`, `proxy_read_timeout`) are set to realistic, endpoint-appropriate values.
- [ ] `upstream` has more than one backend, or a documented reason why not.
- [ ] `proxy_next_upstream` is configured appropriately for the endpoint's idempotency.
- [ ] `max_fails`/`fail_timeout` are tuned for your traffic patterns.

### Caching

- [ ] No authenticated/user-specific endpoint is cached without `proxy_no_cache`/`proxy_cache_bypass`.
- [ ] Cache TTLs match how frequently the underlying data changes.
- [ ] `X-Cache-Status` header is available for debugging (at least in non-production, ideally gated in production).
- [ ] There's a documented process for emergency cache clearing.

### Security

- [ ] `server_tokens off` is set.
- [ ] Rate limiting is configured on public API endpoints.
- [ ] Security headers are present on all responses, including error responses (`always`).
- [ ] `client_max_body_size` matches actual expected upload sizes (not left at the tiny default, not left unbounded).
- [ ] Admin/internal endpoints have `allow`/`deny` or authentication.
- [ ] You understand that nginx is not a WAF and have separate input validation/authentication in the application layer.

### Performance

- [ ] `worker_processes auto` and `worker_connections` sized for expected load.
- [ ] `worker_rlimit_nofile` matches or exceeds connection capacity needs.
- [ ] `sendfile`, `tcp_nopush`, `tcp_nodelay` are enabled.
- [ ] gzip is enabled for compressible content types at a reasonable level (4–6).
- [ ] Upstream `keepalive` is configured to reduce backend connection churn.

### Logging and Observability

- [ ] Access log format includes upstream timing and cache status, not just the default format.
- [ ] Log rotation is configured (logrotate or container log driver).
- [ ] Health check endpoints have `access_log off` to reduce noise.
- [ ] `stub_status` (or equivalent) is enabled and monitored, restricted to internal access.
- [ ] Alerting exists for error rate spikes, not just manual log review.

### High Availability

- [ ] nginx itself is not a single point of failure (multiple instances, HA setup, or orchestrated by Kubernetes/cloud LB).
- [ ] There's a tested rollback process for bad config deploys.
- [ ] Backend deploys use rolling updates, not simultaneous full replacement.

This checklist won't catch everything, but working through it deliberately before a production launch catches the vast majority of real-world nginx incidents.

---

