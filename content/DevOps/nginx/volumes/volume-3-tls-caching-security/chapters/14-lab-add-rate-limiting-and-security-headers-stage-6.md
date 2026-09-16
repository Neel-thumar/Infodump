## Lab: Add Rate Limiting and Security Headers (Stage 6)

### Goal

Add rate limiting to the API and security headers to all responses.

### Update nginx.conf

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server_tokens off;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_status 429;

    # Cache configuration
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
        keepalive 32;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name localhost;

        ssl_certificate     /etc/nginx/certs/selfsigned.crt;
        ssl_certificate_key /etc/nginx/certs/selfsigned.key;

        # Security headers
        add_header X-Frame-Options        "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection       "0" always;
        add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;

        # Timeouts for slow clients
        client_body_timeout   10s;
        client_header_timeout 10s;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;

            # Long browser cache for static assets
            location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
                expires 30d;
                add_header Cache-Control "public, immutable" always;
                # Re-add security headers — add_header in a nested block
                # does NOT inherit from the parent
                add_header X-Frame-Options        "SAMEORIGIN" always;
                add_header X-Content-Type-Options "nosniff" always;
            }
        }

        # API proxy with rate limiting and caching
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;

            # Caching
            proxy_cache api_cache;
            proxy_cache_valid 200 30s;
            proxy_cache_valid 404 10s;
            add_header X-Cache-Status $upstream_cache_status always;
        }
    }
}
```

### Important Detail: `add_header` Inheritance

Notice we re-added security headers inside the nested static asset `location` block. This is because of a critical nginx behavior:

> **If any `add_header` directive appears in a block, all `add_header` directives from parent blocks are NOT inherited.**

The nested `location ~* \.(css|js|...)$` block has its own `add_header` directives (`Cache-Control`), so the security headers from the parent `server` block are not inherited. You must repeat any headers you still want.

This catches people off guard. If you add `add_header` anywhere inside a `location`, check that you haven't accidentally dropped headers from the parent.

### Restart and Test

```bash
docker compose down
docker compose up -d
```

**Test security headers:**

```bash
curl -k -s -D - https://localhost:8443/ -o /dev/null | grep -iE "x-frame|x-content|server:|referrer"
```

Expected:

```text
Server: nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Notice `Server: nginx` — no version number. `server_tokens off` is working.

**Test rate limiting:**

Send 30 requests quickly:

```bash
for i in $(seq 1 30); do
  curl -k -s -o /dev/null -w "%{http_code}\n" https://localhost:8443/api/test
done
```

Expected: the first ~20 return `200`, then some return `429` (Too Many Requests).

The exact split depends on timing. The burst of 20 allows the first 20 requests through. After that, only 10 per second are allowed. Excess requests get 429.

**Test static asset caching headers:**

```bash
curl -k -s -D - https://localhost:8443/style.css -o /dev/null | grep -iE "cache-control|expires"
```

Expected:

```text
Cache-Control: public, immutable
Expires: ... (a date 30 days from now)
```

Stage 6 is complete.

---

