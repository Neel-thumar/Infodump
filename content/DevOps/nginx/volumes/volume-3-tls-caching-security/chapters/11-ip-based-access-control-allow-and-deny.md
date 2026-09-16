## IP-Based Access Control — `allow` and `deny`

Sometimes you want to restrict access to specific paths — an admin panel, a health check endpoint, internal metrics.

```nginx
location /admin/ {
    allow 10.0.0.0/8;
    allow 192.168.1.0/24;
    deny all;

    proxy_pass http://api_backends;
}
```

Rules are evaluated top to bottom. The first matching rule wins:

1. If the client IP is in `10.0.0.0/8` → allow.
2. If the client IP is in `192.168.1.0/24` → allow.
3. Everything else → deny (returns 403).

### When `allow`/`deny` Is Not Enough

If nginx sits behind another proxy or load balancer, `$remote_addr` is the proxy's IP, not the client's. You'd need `real_ip` module configuration (`set_real_ip_from`, `real_ip_header`) to get the actual client IP from `X-Forwarded-For`. Without that, `allow`/`deny` operates on the wrong IP.

For anything beyond basic IP filtering, use proper authentication (API keys, OAuth, mutual TLS) at the application level. nginx is a first gate, not a complete access-control system.

---

