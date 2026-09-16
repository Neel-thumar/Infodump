---
id: nginx-vol-5-troubleshooting-production-ops
title: "Volume 5 — Troubleshooting and Production Operations"
order: 5
description: "Systematic investigation of real nginx failures, the debugging mindset, and production operations: safe reloads, zero-downtime deploys, and HA patterns."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 5 — Troubleshooting and Production Operations

Every volume so far has been about building something that works. This volume is about what happens when it stops working — and how to run it safely once it's carrying real traffic.

This is arguably the most valuable volume in this guide. Configuring nginx correctly the first time is one skill. Diagnosing why it's failing at 2 AM, under pressure, with incomplete information, is a different and more important skill. This volume teaches the investigation process, not just the fixes.

## Why This Matters

nginx sits directly in the path of all production traffic. When it fails, everything fails — even if the actual problem is somewhere else (a backend crash, a bad deploy, a network issue). Because nginx is the first thing to show symptoms, engineers who don't know how to investigate nginx often waste time guessing instead of systematically narrowing down the cause.

The goal here is not to memorize a list of error codes and their fixes. It's to build a repeatable process: given a symptom, what do you check, in what order, and why.

## What You Will Be Able to Do After This Volume

- Systematically diagnose 502, 504, 403, and TLS failures.
- Diagnose "config loads but wrong location matches" problems.
- Diagnose "nginx won't reload" and "nginx starts but nothing listens" problems.
- Diagnose intermittent failures under load.
- Diagnose caching serving stale or wrong content.
- Diagnose a load balancer sending traffic to a dead backend.
- Apply a consistent debugging mindset to unfamiliar failures.
- Understand production deploy patterns: safe reloads, zero-downtime config changes.
- Reason about high-availability nginx architecture.

---

## The Debugging Mindset

Before specific failures, internalize this question sequence. Apply it to almost any nginx problem.

```text
1. Did the config actually load?
       → nginx -t, check the error log for load-time errors

2. Which server/location block actually matched this request?
       → Trace the request through server_name and location matching

3. Is this an nginx problem or a backend problem?
       → Check $upstream_response_time vs $request_time in access log

4. Is this a network problem between nginx and the backend?
       → Check for connection refused / timeout errors in error log

5. Is this a client-side problem (headers, TLS, caching)?
       → Reproduce with curl -v, inspect request/response headers

6. Is this a resource-limit problem (connections, file descriptors, worker load)?
       → Check stub_status, system limits, error log for "too many" messages

7. What does the access log say happened? What does the error log say?
       → Cross-reference both logs by timestamp and client IP
```

This sequence works because it moves from cheapest-to-check to most-involved. Always start with `nginx -t` and the error log — they answer most questions in seconds. Only dig deeper when the obvious checks come up empty.

---

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

## 504 Gateway Timeout — Backend Too Slow

### What It Means

nginx successfully connected to the backend, but the backend didn't send a complete response within the configured timeout.

### Common Causes

- The backend is processing a slow database query.
- The backend is deadlocked or stuck.
- The backend is overloaded (too many concurrent requests for its capacity).
- A downstream dependency of the backend (database, external API) is slow.
- `proxy_read_timeout` is set too low for a legitimately slow operation.

### Investigation

**Step 1: Check the error log.**

```text
upstream timed out (110: Connection timed out) while reading response header from upstream,
client: 172.18.0.1, server: localhost, request: "GET /api/reports HTTP/1.1",
upstream: "http://172.18.0.3:3001/api/reports", host: "localhost"
```

This confirms it's a timeout, not a connection failure. nginx connected fine; the backend just didn't answer in time.

**Step 2: Check whether this is isolated to one endpoint or widespread.**

```bash
grep "upstream timed out" /var/log/nginx/error.log | awk -F'"' '{print $2}' | sort | uniq -c
```

If it's concentrated on one endpoint (`/api/reports`), that endpoint has a specific performance problem. If it's spread across all endpoints, the backend itself is likely overloaded or a shared dependency (database) is slow.

**Step 3: Check backend logs and metrics directly.**

Look at what the backend was doing when the timeout occurred — slow query logs, thread pool exhaustion, memory pressure.

**Step 4: Determine if the timeout value itself is the problem.**

If the endpoint is *supposed* to take longer than `proxy_read_timeout` (a report generation endpoint, for example), the "failure" might just be a timeout that's too aggressive for that specific route.

### Fix

- If the backend is genuinely stuck: restart it, investigate the root cause (slow query, deadlock, resource exhaustion).
- If the operation is legitimately slow: increase `proxy_read_timeout` for that specific location, or better, make the operation asynchronous (return immediately, let the client poll for completion).
- If the backend is overloaded: scale horizontally (add more backend instances) or investigate why it's slow under this load.

### Prevention

- Set realistic, endpoint-specific timeouts rather than one global timeout for everything.
- Monitor `$upstream_response_time` trends to catch gradual backend slowdowns before they become timeouts.
- Consider circuit-breaker patterns at the application level for slow dependencies.

---

## 403 Forbidden — Access Denied

### What It Means

nginx explicitly denied the request. This is different from 404 (not found) — nginx knows about the resource but refuses to serve it.

### Common Causes

- File permissions: the nginx worker process user doesn't have read access to the file.
- Missing `index` file and no `autoindex` — a directory request with no index file and directory listing disabled.
- `deny` rule matched (IP-based access control).
- A `location` block with no valid way to handle the request.

### Investigation

**Step 1: Check the error log.**

```text
2026/09/16 10:23:45 [error] 1234#0: *5 "/var/www/static/private/index.html" is forbidden
(13: Permission denied), client: 172.18.0.1, server: localhost,
request: "GET /private/ HTTP/1.1", host: "localhost"
```

`(13: Permission denied)` is a filesystem permission error. The nginx worker process (running as `www-data` or `nginx`) can't read the file.

**Step 2: Check file permissions.**

```bash
ls -la /var/www/static/private/
```

The nginx worker user needs at least read permission on files and execute permission on directories (to traverse into them).

**Step 3: Check for `allow`/`deny` rules.**

```bash
grep -A 5 "location" nginx.conf | grep -B 2 "deny"
```

If a `deny all;` rule matches the client's IP, that's the cause — this is intentional, not a bug, but confirm the client should or shouldn't have access.

**Step 4: Check for missing index with directory listing off.**

A request to a directory (`/private/`) with no `index.html` inside it and no `autoindex on;` configured returns 403 by default (nginx won't guess what to show).

### Fix

- Correct file/directory permissions: `chmod` and `chown` to match the nginx worker user.
- Add an `index` file if missing.
- Adjust `allow`/`deny` rules if access should be permitted.
- Enable `autoindex on;` only if directory listing is intentional (rare in production — usually a security risk).

### Prevention

- Set correct permissions as part of your deployment process, not manually after the fact.
- Use `allow`/`deny` deliberately and document why specific paths are restricted.

---

## Config Loads, But the Wrong `location` Block Matches

### What It Means

`nginx -t` passes, nginx reloads successfully, but requests are handled by a different `location` block than you expected.

### Common Causes

- A regex location is unexpectedly matching before your intended prefix location.
- A `^~` preferential prefix is blocking regex evaluation you expected to happen.
- Location blocks were reordered, changing regex matching order (prefix order doesn't matter, but regex order does).
- A more specific prefix exists elsewhere in the config that you forgot about.

### Investigation

**Step 1: Temporarily add a debug marker.**

```nginx
location /api/special/ {
    add_header X-Debug-Location "api-special-block" always;
    proxy_pass http://api_backends;
}
```

```bash
curl -k -s -D - https://localhost:8443/api/special/test -o /dev/null | grep X-Debug-Location
```

If the header doesn't appear, this block isn't matching — something else is intercepting the request.

**Step 2: List all location blocks and their types.**

```bash
grep -n "location" nginx.conf
```

Manually trace through the matching algorithm from Volume 1: find the longest prefix, check for `=` or `^~`, then check regexes top to bottom.

**Step 3: Check for regex locations that might unexpectedly match.**

A regex like `location ~ \.(json|api)$` could match paths you didn't anticipate. Review all regex locations for overly broad patterns.

### Fix

- Add `^~` to a prefix location if you need it to take priority over regex matching.
- Reorder regex locations if match order matters (first matching regex wins).
- Make regex patterns more specific to avoid unintended matches.
- Remove the debug header once you've confirmed the fix.

### Prevention

- Keep location blocks organized and commented, especially when mixing prefix and regex types.
- When adding a new location block, always check whether it could be shadowed by an existing regex location, or whether it shadows an existing prefix location.

---

## nginx Won't Reload — Syntax Error

### What It Means

You ran `nginx -s reload` (or `systemctl reload nginx`) and it failed, or the reload appeared to succeed but the old config is still running.

### Investigation

**Step 1: Always run `nginx -t` first — never skip this.**

```bash
nginx -t
```

```text
nginx: [emerg] unexpected "}" in /etc/nginx/nginx.conf:45
nginx: configuration file /etc/nginx/nginx.conf test failed
```

The error tells you the exact line. Common causes:

- Missing semicolon on the previous line (nginx reports the error on the *following* line).
- Mismatched braces `{ }`.
- A directive used in the wrong context (e.g., `proxy_pass` outside a `location` block).
- A typo in a directive name.

**Step 2: If `nginx -t` passes but reload still seems to fail:**

Check if the reload signal actually reached the master process:

```bash
ps aux | grep "nginx: master"
```

If there's no master process, nginx isn't running at all — you need to start it, not reload it.

**Step 3: Check the systemd status if using systemd.**

```bash
systemctl status nginx
journalctl -u nginx -n 50
```

### Fix

- Fix the syntax error at the reported line (and check the line before it too — often the actual mistake is one line earlier, like a missing semicolon).
- If nginx isn't running, start it fresh: `systemctl start nginx`.

### Prevention

- **Always run `nginx -t` before every reload, without exception.** This is the single most effective habit for avoiding self-inflicted outages.
- Use version control for your config files so you can diff changes and quickly revert.
- In CI/CD pipelines, run `nginx -t` against the new config as an automated gate before deploying it.

---

## nginx Starts But Nothing Listens on the Expected Port

### What It Means

nginx process is running, but `curl` to the expected port gets "connection refused."

### Common Causes

- Another process is already using that port (nginx fails to bind but the master process might still be "running" in a broken state, or fails silently in some setups).
- The `listen` directive has a typo or wrong port number.
- Firewall rules block the port even though nginx is listening correctly.
- In Docker, the port isn't actually published/mapped in `docker-compose.yml`.

### Investigation

**Step 1: Check what's actually listening.**

```bash
# On the host or inside the container:
netstat -tlnp | grep nginx
# or
ss -tlnp | grep nginx
```

If nginx isn't listed, it's not bound to the port at all — check the error log for a bind failure:

```text
nginx: [emerg] bind() to 0.0.0.0:443 failed (98: Address already in use)
```

**Step 2: Find what's using the port instead.**

```bash
lsof -i :443
```

Another process (maybe an old nginx instance that didn't fully stop, or a different service) is holding the port.

**Step 3: For Docker setups, verify the port mapping.**

```bash
docker compose ps
```

Confirm the `PORTS` column shows the expected mapping (e.g., `0.0.0.0:8443->443/tcp`). If it's missing, check `docker-compose.yml` for the `ports:` section.

### Fix

- Stop the conflicting process, or change nginx's `listen` port.
- Fix the `docker-compose.yml` port mapping.
- Check firewall rules (`ufw`, `iptables`, cloud security groups) if the port is open locally but unreachable externally.

### Prevention

- Ensure old nginx processes are fully stopped before starting new ones (especially after crashes or manual process management).
- Use consistent port configuration across environments to avoid "works on staging, not on production" surprises.

---

## TLS Handshake Failures

### What It Means

The client cannot establish an HTTPS connection. This shows up as connection errors in the browser or curl, often before any HTTP request/response even happens.

### Common Causes

- Certificate file path is wrong or the file doesn't exist.
- Certificate and private key don't match (mismatched pair).
- Certificate has expired.
- Client doesn't support the TLS protocol version nginx offers (rare with modern clients, common with old ones).
- Certificate chain is incomplete (missing intermediate certificates).

### Investigation

**Step 1: Check the error log for TLS-specific errors.**

```text
2026/09/16 10:23:45 [emerg] 1#1: cannot load certificate
"/etc/nginx/certs/selfsigned.crt": PEM_read_bio_X509() failed
```

This means the certificate file is missing, corrupted, or the wrong format.

**Step 2: Verify the certificate and key match.**

```bash
openssl x509 -noout -modulus -in certs/selfsigned.crt | openssl md5
openssl rsa -noout -modulus -in certs/selfsigned.key | openssl md5
```

If the two MD5 hashes don't match, the certificate and key are not a pair — TLS handshakes will fail.

**Step 3: Check certificate expiry.**

```bash
openssl x509 -noout -enddate -in certs/selfsigned.crt
```

```text
notAfter=Sep 16 10:00:00 2027 GMT
```

If this date is in the past, the certificate has expired. Browsers will refuse the connection.

**Step 4: Test the handshake directly.**

```bash
openssl s_client -connect localhost:8443 -servername localhost
```

This shows the full handshake process and will report specific errors (expired cert, chain issues, unsupported protocol).

### Fix

- Correct the certificate file paths.
- Regenerate or replace mismatched certificate/key pairs.
- Renew expired certificates (and set up automated renewal — this is the most common cause of production TLS outages).
- Include the full certificate chain (`fullchain.pem` from Let's Encrypt includes intermediates).

### Prevention

- **Automate certificate renewal.** Manual renewal is forgotten until the certificate expires and the site goes down.
- **Monitor certificate expiry** with an alert 2–4 weeks before expiration.
- Test certificate changes with `openssl s_client` before relying on browser testing alone.

---

## Intermittent Failures Under Load

### What It Means

Everything works fine under normal traffic, but under load (traffic spikes, load testing, peak hours), some requests start failing — often with 502s, 504s, or connection resets, and often not consistently reproducible.

### Common Causes

- `worker_connections` limit reached — new connections are refused.
- File descriptor limit reached (`worker_rlimit_nofile` too low or OS limit too low).
- Backend connection pool exhausted (backend can't accept more connections than nginx is sending).
- Rate limiting (`limit_req`, `limit_conn`) is triggering more aggressively than expected under real traffic patterns.
- Upstream `keepalive` pool too small, causing excessive new connection creation under load.

### Investigation

**Step 1: Check `stub_status` during the load event (or from logs/metrics captured during it).**

```text
Active connections: 2048
Reading: 512 Writing: 1400 Waiting: 136
```

If `Active connections` is at or near your `worker_connections × worker_processes` limit, you've found the bottleneck.

**Step 2: Check the error log for resource-limit messages.**

```text
2026/09/16 14:00:12 [alert] 1234#0: 1024 worker_connections are not enough
```

This is explicit — nginx is telling you it ran out of connection slots.

```text
2026/09/16 14:00:15 [error] 1234#0: accept4() failed (24: Too many open files)
```

This means the file descriptor limit was hit.

**Step 3: Check if rate limiting is the actual cause.**

```bash
grep "limiting requests" /var/log/nginx/error.log | wc -l
```

```text
2026/09/16 14:00:20 [error] 1234#0: *9821 limiting requests, excess: 10.500 by zone "api_limit",
client: 172.18.0.1, server: localhost, request: "GET /api/test HTTP/1.1"
```

If this appears heavily during the load event, legitimate traffic is being rate-limited, not failing due to resource exhaustion.

**Step 4: Check backend-side connection limits.**

The backend application might have its own connection pool or worker limit that's smaller than what nginx is sending. Even if nginx has capacity, the backend rejecting connections looks like an nginx-side 502 from the client's perspective.

### Fix

- Increase `worker_connections` and `worker_rlimit_nofile` together, matched to expected peak load.
- Increase upstream `keepalive` pool size if new-connection churn is high.
- Adjust rate limiting (`burst`, `rate`) if legitimate traffic is being throttled.
- Scale the backend (more instances, more capacity) if it's the actual bottleneck.

### Prevention

- Load test before peak events (sales, launches, marketing pushes) to find limits proactively rather than discovering them live.
- Set monitoring alerts on active connection count as a percentage of the configured maximum.
- Have a documented, tested process for scaling nginx and backend capacity quickly.

---

## Caching Serving Stale or Wrong Content

We covered the mechanics of this in Volume 3. Here's the systematic investigation process.

### Investigation

**Step 1: Check `X-Cache-Status` on the affected response.**

```bash
curl -k -s -D - https://localhost:8443/api/affected-endpoint -o /dev/null | grep -i x-cache
```

- `HIT` — serving from cache. If the content is wrong, the cache holds outdated or incorrect data.
- `STALE` — serving an expired cache entry, likely because the backend is unreachable and `proxy_cache_use_stale` is configured.

**Step 2: Check if this is a wrong-user problem (cache poisoning) or a stale-data problem.**

- **Wrong-user problem:** One user sees another user's data. This means the cache key doesn't differentiate between users, but it should. This is a security bug — fix immediately by adding `proxy_no_cache`/`proxy_cache_bypass` for that endpoint or including a user-specific value in the cache key.

- **Stale-data problem:** Everyone sees the same (outdated) data. The TTL (`proxy_cache_valid`) is too long relative to how often the data changes, or a manual invalidation didn't happen.

**Step 3: Check the actual cache TTL configuration.**

```bash
grep proxy_cache_valid nginx.conf
```

### Fix

- For wrong-user issues: immediately add `proxy_no_cache`/`proxy_cache_bypass` for the endpoint. Consider clearing the existing (poisoned) cache entries.
- For stale-data issues: reduce the TTL, or implement a purge mechanism for when data changes.

### Emergency: Clear the Cache

```bash
docker compose exec nginx rm -rf /var/cache/nginx/api/*
docker compose exec nginx nginx -s reload
```

This clears all cached entries immediately. Use this as an emergency measure, then fix the underlying TTL or cache-key configuration.

---

## Load Balancer Sending Traffic to a Dead Backend

### What It Means

One backend is down, but nginx keeps sending some requests to it, causing a portion of traffic to fail.

### Investigation

**Step 1: Check `max_fails` and `fail_timeout` settings.**

```nginx
upstream api_backends {
    server backend1:3001 max_fails=3 fail_timeout=30s;
    server backend2:3001 max_fails=3 fail_timeout=30s;
}
```

If `max_fails` is high (e.g., 10), nginx tolerates many failures before marking the backend unavailable — meaning more requests fail during the detection window.

**Step 2: Check whether `proxy_next_upstream` is configured.**

Without it, a request that hits the dead backend fails outright instead of being retried on a healthy one.

**Step 3: Remember: health checking is passive in open-source nginx.**

nginx only learns a backend is down from a real request failing. There's an inherent window where some requests will hit the dead backend before it's marked unavailable.

### Fix

- Lower `max_fails` and `fail_timeout` to detect failures faster (tradeoff: more sensitive to transient blips).
- Configure `proxy_next_upstream` so failed requests retry on a healthy backend transparently.
- For faster, more reliable detection, consider nginx Plus's active health checks, or an external health-checking sidecar/orchestrator (Kubernetes readiness probes, for example) that removes unhealthy backends from nginx's config entirely via reload.

### Prevention

- If running in Kubernetes, use readiness probes so unhealthy pods are removed from service endpoints before nginx (or ingress-nginx) ever routes to them.
- Combine passive detection (`max_fails`) with proactive orchestration-level health checks for faster, more reliable failover.

---

## Production Operations

### Reload vs Restart Under Real Traffic

We covered the mechanics in Volume 1. In production, the discipline matters more than the mechanics.

**The standard deploy sequence for a config change:**

```text
1. Edit the config (on a staging copy or via configuration management).
2. Run nginx -t against the new config. Do not proceed if this fails.
3. Deploy the validated config file to the server(s).
4. Run nginx -s reload (or systemctl reload nginx).
5. Verify: check error log for reload-related issues, test key endpoints.
6. If something is wrong, roll back the config file and reload again.
```

**Never restart nginx in production for a routine config change.** Restart only for binary upgrades or when nginx is in an unrecoverable state.

### Zero-Downtime nginx Binary Upgrades

Reloading applies a new *config* with the same binary. Upgrading the nginx *binary itself* (a new version) uses a different mechanism: `nginx -s USR2`.

```text
1. Send USR2 signal to the master process.
2. The old master starts a new master process with a new binary,
   which spawns new workers.
3. Both old and new master/worker sets run simultaneously.
4. Send WINCH to the old master to gracefully stop its workers.
5. Verify the new instance is handling traffic correctly.
6. Send QUIT to the old master to shut it down completely.
```

This is more involved than a config reload and is typically automated by package managers or orchestration tools (Kubernetes rolling updates handle this differently — by replacing pods rather than upgrading in-place).

### Deploying Backend Changes Without Dropping Traffic

When you deploy a new version of your backend application (not nginx itself), the goal is zero-downtime for users. A common pattern with nginx load balancing:

```text
1. Add a new backend instance running the new version to the upstream
   (or replace one at a time — "rolling" deploy).
2. nginx starts routing some traffic to it (round-robin picks it up).
3. Verify the new instance behaves correctly.
4. Repeat for remaining instances, one at a time.
5. At no point are all instances down simultaneously.
```

If a backend instance needs to be taken out of rotation gracefully (for a deploy), mark it down without immediately cutting active connections:

```nginx
upstream api_backends {
    server backend1:3001 down;   # take out of rotation for maintenance
    server backend2:3001;
}
```

Setting `down` on a server removes it from load-balancing decisions immediately (new requests skip it) while not affecting the directive's presence in the config (useful for temporarily disabling without deleting the line). Reload after setting this, deploy/restart that backend, then remove `down` and reload again.

### Configuration Management

In production, don't hand-edit `nginx.conf` on a live server. Use:

- **Version control** (git) for all config files — every change is tracked, diffable, and revertable.
- **Configuration management tools** (Ansible, Chef, Puppet, Terraform) to apply changes consistently across multiple servers.
- **CI/CD validation** — run `nginx -t` in a container matching production before deploying, as an automated gate.
- **Staged rollout** — apply config changes to one server first, verify, then roll out to the rest.

### High Availability Patterns

A single nginx instance is a single point of failure. Production architectures typically add redundancy:

```text
                    DNS / Load Balancer (e.g., cloud LB, keepalived+VRRP)
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
            nginx instance 1          nginx instance 2
            (active)                  (standby or active-active)
                 │                         │
                 └────────────┬────────────┘
                              ▼
                     Backend application servers
```

Common approaches:

- **Active-passive with keepalived:** Two nginx instances share a virtual IP (VRRP). If the active one fails, the standby takes over the IP.
- **Active-active behind a cloud load balancer:** Multiple nginx instances run simultaneously behind an AWS/GCP/Azure load balancer, which health-checks nginx itself and routes around failures.
- **Kubernetes ingress-nginx:** Multiple ingress-nginx pods run behind a Kubernetes Service, and Kubernetes handles pod health and replacement.

The principle in all cases: nginx itself should not be a single point of failure in a system where nginx is protecting against single points of failure downstream.

---

## Things Senior Engineers Notice

1. **502 and 504 are diagnostically different, and conflating them wastes time.** 502 means "couldn't connect" — check if the backend is running. 504 means "connected but too slow" — check backend performance, not backend availability.

2. **`nginx -t` passing doesn't mean the site works.** It validates syntax, not runtime correctness (files existing, backends reachable, certificates valid). Always follow up with an actual request test after reload.

3. **The error log usually already contains the answer.** Most nginx troubleshooting sessions could be shortened significantly by reading the error log first, carefully, before jumping to hypotheses.

4. **Certificate expiry is a self-inflicted outage that's entirely preventable.** Every production TLS setup needs automated renewal and expiry monitoring. If you're manually tracking certificate expiry dates, you will eventually miss one.

5. **A load spike revealing `worker_connections are not enough` is not really an nginx problem — it's a capacity planning gap.** The fix isn't just "increase the number." It's understanding your expected peak load and configuring for it deliberately, with margin.

6. **Passive health checks mean some requests will always hit a backend right as it dies.** This is a fundamental limitation of open-source nginx, not a misconfiguration. Combine it with `proxy_next_upstream` and, where possible, orchestration-level health checks to minimize the impact.

7. **A "successful" reload can still leave stale behavior briefly.** Old workers serving old config continue handling their existing connections during the drain period. If you're debugging "why is the old behavior still happening right after I reloaded," check whether you're hitting a connection handled by a draining old worker.

8. **Rolling deploys via `down` in the upstream block are simple and effective but manual.** For frequent deploys, this manual toggle-and-reload pattern gets replaced by orchestration tools (Kubernetes, load balancer target groups) that automate the same principle.

9. **Config drift between servers is a silent risk in any multi-server setup.** If you're not using configuration management, two nginx servers behind a load balancer can quietly diverge, causing inconsistent behavior depending on which server handles a request. Version control and automated deployment prevent this.

10. **The debugging mindset matters more than memorized fixes.** New, unfamiliar nginx failures happen. The person who systematically checks "config loaded → location matched → nginx vs backend → network vs client → resource limits → logs" will solve novel problems faster than someone who only knows fixes for problems they've seen before.

---

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

## What's Next — Volume 6

Volume 6 is the final volume. It brings everything together:

- The complete, fully-explained production nginx configuration from our continuous project.
- nginx's role in 2026 infrastructure — Kubernetes ingress-nginx, API gateways, service meshes, CDNs.
- A production readiness checklist.
- The complete interview preparation section — fundamentals through system-design-level questions.
- What to learn next to go deeper.

This is your reference volume — the one you'll come back to before interviews and before trusting a config in production.
