## Lab: Performance Tuning and Structured Logging (Stage 7)

### Goal

Add performance settings and structured logging to the continuous project.

### Update nginx.conf — Complete Stage 7 Config

```nginx
worker_processes auto;
worker_rlimit_nofile 4096;

events {
    worker_connections 2048;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server_tokens off;

    # --- Performance ---
    sendfile    on;
    tcp_nopush  on;
    tcp_nodelay on;

    keepalive_timeout  65s;
    keepalive_requests 1000;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;

    # Client buffers
    client_body_buffer_size   16k;
    client_max_body_size      10m;
    large_client_header_buffers 4 16k;

    # --- Logging ---
    log_format main
        '$remote_addr - $remote_user [$time_local] '
        '"$request" $status $body_bytes_sent '
        '"$http_referer" "$http_user_agent" '
        'rt=$request_time '
        'urt=$upstream_response_time '
        'us=$upstream_status '
        'ua=$upstream_addr '
        'cs=$upstream_cache_status';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    # --- Rate Limiting ---
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_status 429;

    # --- Caching ---
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    # --- Upstreams ---
    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
        keepalive 32;
    }

    # --- HTTP → HTTPS ---
    server {
        listen 80;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    # --- Main HTTPS Server ---
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

        # Slow-client protection
        client_body_timeout   10s;
        client_header_timeout 10s;

        # Health check (no logging)
        location = /health {
            access_log off;
            return 200 "ok\n";
            default_type text/plain;
        }

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;

            location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
                expires 30d;
                add_header Cache-Control "public, immutable" always;
                add_header X-Frame-Options        "SAMEORIGIN" always;
                add_header X-Content-Type-Options "nosniff" always;
            }
        }

        # API proxy
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

### Apply and Test

```bash
docker compose down
docker compose up -d
```

**Test the health endpoint:**

```bash
curl -k https://localhost:8443/health
```

Expected: `ok`

**Test gzip:**

```bash
curl -k -s -D - -H "Accept-Encoding: gzip" https://localhost:8443/api/test -o /dev/null 2>&1 | grep -i content-encoding
```

Expected: `Content-Encoding: gzip`

**Test custom log format:**

```bash
curl -k https://localhost:8443/api/test
docker compose exec nginx tail -1 /var/log/nginx/access.log
```

Expected: a log line with `rt=`, `urt=`, `us=`, `ua=`, `cs=` fields.

**Test cached vs uncached log entries:**

```bash
# First request (MISS)
curl -k https://localhost:8443/api/test
docker compose exec nginx tail -1 /var/log/nginx/access.log
# Look for cs=MISS

# Second request (HIT)
curl -k https://localhost:8443/api/test
docker compose exec nginx tail -1 /var/log/nginx/access.log
# Look for cs=HIT, urt=- (no upstream contacted)
```

**Verify server token is hidden:**

```bash
curl -k -s -D - https://localhost:8443/ -o /dev/null | grep -i server
```

Expected: `Server: nginx` (no version number).

Stage 7 is complete. The config now includes performance tuning and structured logging.

---

