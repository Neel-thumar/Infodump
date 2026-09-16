## TLS in Production — What Changes

Our lab uses a self-signed certificate and minimal settings. Production TLS involves a few more considerations.

### Certificate from a Trusted CA

In production, you use a certificate signed by a certificate authority (CA) that browsers trust. **Let's Encrypt** with **certbot** is the standard free option. The process:

1. certbot proves you control the domain.
2. Let's Encrypt issues a certificate (valid for 90 days).
3. certbot installs it and sets up automatic renewal.
4. nginx uses the renewed certificate after a reload.

The nginx config looks the same — just different file paths:

```nginx
ssl_certificate     /etc/letsencrypt/live/myapp.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;
```

### TLS Protocol and Cipher Settings

Modern TLS best practice (as of 2026) is to use TLS 1.2 and 1.3 only:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```

TLS 1.0 and 1.1 are deprecated and considered insecure. Most modern clients support 1.2 and 1.3.

For cipher suites, nginx's defaults are reasonable for current versions. If you need explicit control:

```nginx
ssl_prefer_server_ciphers on;
```

This tells nginx to prefer its own cipher order over the client's, which lets you enforce stronger ciphers.

> **Senior insight:** Don't copy cipher suite strings from old blog posts. Cipher recommendations change as vulnerabilities are found. Use the defaults from a current nginx version or check Mozilla's SSL Configuration Generator, which produces up-to-date settings.

### SSL Session Caching

TLS handshakes are expensive. Session caching lets clients reconnect without a full handshake:

```nginx
ssl_session_cache   shared:SSL:10m;
ssl_session_timeout 1d;
```

`shared:SSL:10m` creates a 10 MB shared cache (shared across all workers). 1 MB stores roughly 4,000 sessions. `ssl_session_timeout 1d` keeps sessions valid for one day.

### HSTS — HTTP Strict Transport Security

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

This header tells browsers: "For the next 2 years, always use HTTPS for this domain. Never try HTTP." After the first HTTPS visit, the browser won't even attempt HTTP — it upgrades to HTTPS automatically before making the request.

**Be careful:** Once you set HSTS, you can't easily go back to HTTP. If your HTTPS setup breaks, users can't fall back. Only enable it when you're confident HTTPS is permanent and correctly configured.

We'll add HSTS in the security section below, along with other headers.

---

