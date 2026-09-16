## Interview Questions

### Level 1 — Fundamentals

**Q: What's the difference between a 502 and a 504 error?**

502 Bad Gateway means nginx could not establish a connection to the backend at all (backend down, wrong port, network issue). 504 Gateway Timeout means nginx connected successfully but the backend didn't respond within the configured timeout (backend is slow, stuck, or overloaded).

**Q: How do you check if an nginx config file has a syntax error before applying it?**

Run `nginx -t`. It validates the config file's syntax without applying it, and reports the exact line where an error occurs.

### Level 2 — Practical

**Q: How would you deploy an nginx config change safely?**

Edit the config, run `nginx -t` to validate syntax, deploy the validated file, then reload with `nginx -s reload` (never restart for routine changes). Verify the change worked by testing key endpoints and checking the error log. Keep configs in version control so changes are tracked and revertible.

**Q: How would you take one backend out of rotation for maintenance without dropping traffic?**

Add the `down` parameter to that server's line in the `upstream` block and reload. nginx immediately stops sending new requests to it. Perform maintenance, then remove `down` and reload again to bring it back into rotation.

### Level 3 — Scenario Based

**Q: Users are getting 502 errors intermittently. How would you investigate?**

Check the error log for `connect() failed` or `no live upstreams` messages, identify which backend is failing, verify it's actually running (`docker compose ps` or process check), test direct connectivity from nginx to the backend bypassing the proxy config, and check `max_fails`/`fail_timeout` settings. If backends are crashing and restarting, the root cause is in the backend, not nginx.

**Q: Static assets are being served with the wrong content, seemingly cached. What would you check?**

Check `X-Cache-Status` on the response — is it HIT (serving from cache)? Check `proxy_cache_valid` TTL settings — is it too long for how often the content changes? Determine if this is a stale-data problem (everyone sees old content) or a cross-user data leak (different users see each other's cached responses) — the second is a security issue requiring immediate cache-key or bypass fixes. As an emergency measure, clear the cache directory and reload.

**Q: nginx stops responding under a traffic spike. How do you debug it?**

Check `stub_status` for active connections near the configured maximum. Check the error log for `worker_connections are not enough` or file descriptor errors. Check if rate limiting (`limit_req`) is rejecting legitimate traffic. Check backend response times — if backends slow down under load, connections pile up in nginx waiting for responses, consuming the connection pool faster than expected.

### Level 4 — Senior Thinking

**Q: How would you design an nginx deployment process that minimizes the risk of a bad config causing an outage?**

Version control all configs. Validate with `nginx -t` in CI before any deploy. Deploy to a canary/staging server first and verify. Roll out to production servers one at a time (not all simultaneously), verifying each before proceeding. Use `nginx -s reload` exclusively for config changes, never restart. Have an automated or well-rehearsed rollback process (revert the config file, reload). Monitor error rates immediately after each deploy step to catch problems before they reach all servers.

**Q: How would you debug an nginx server that stops responding under load, when you can't reproduce it in a lower-traffic environment?**

Instrument before the event: ensure `stub_status` is enabled and monitored continuously, ensure access logs include `$upstream_response_time` and `$request_time` for correlation, and ensure error logs are being collected centrally. During or after the event, correlate connection count trends, error log resource-limit messages, and backend response time trends against the traffic spike timing. Load test in a staging environment that mirrors production traffic patterns as closely as possible to find the actual limit proactively, rather than only reacting after an incident.

---

