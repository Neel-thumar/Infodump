## The Complete Production Configuration

This is the full config, evolved across all six volumes. Every section is annotated with which volume introduced it and why it's there.

```nginx
# ============================================================
# GLOBAL SETTINGS (main context)
# ============================================================

worker_processes auto;              # Volume 1: one worker per CPU core
worker_rlimit_nofile 4096;          # Volume 4: file descriptor limit for workers

events {
    worker_connections 2048;        # Volume 1/4: max connections per worker
}

http {
    # --- Core serving settings ---
    include       /etc/nginx/mime.types;   # Volume 1: correct Content-Type per file extension
    default_type  application/octet-stream;

    server_tokens off;              # Volume 3: hide nginx version from responses

    # --- Static file / network performance ---
    sendfile    on;                 # Volume 4: kernel-level file transfer
    tcp_nopush  on;                 # Volume 4: full packets for sendfile data
    tcp_nodelay on;                 # Volume 4: no delay for small/interactive data

    keepalive_timeout  65s;         # Volume 4: client-side keepalive duration
    keepalive_requests 1000;        # Volume 4: requests per keepalive connection

    # --- Compression ---
    gzip on;                                                              # Volume 4
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;

    # --- Client request limits ---
    client_body_buffer_size     16k;    # Volume 4
    client_max_body_size        10m;    # Volume 4: reject bodies over 10MB (413)
    large_client_header_buffers 4 16k;  # Volume 4: handle larger cookies/headers

    # --- Logging ---
    log_format main                                         /* Volume 4 */
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

    # --- Rate limiting zone ---
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;  # Volume 3
    limit_req_status 429;

    # --- Proxy cache path ---
    proxy_cache_path /var/cache/nginx/api        /* Volume 3 */
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    # --- Upstream backend group ---
    upstream api_backends {                       # Volume 2
        server backend1:3001 max_fails=3 fail_timeout=30s;
        server backend2:3001 max_fails=3 fail_timeout=30s;
        keepalive 32;                              # Volume 4: reuse connections
    }

    # ============================================================
    # SERVER: HTTP → HTTPS REDIRECT
    # ============================================================
    server {                                        # Volume 3
        listen 80;
        server_name myapp.example.com;
        return 301 https://$host$request_uri;
    }

    # ============================================================
    # SERVER: MAIN HTTPS SERVER
    # ============================================================
    server {
        listen 443 ssl;
        server_name myapp.example.com;

        # --- TLS ---
        ssl_certificate     /etc/letsencrypt/live/myapp.example.com/fullchain.pem;  # Volume 3
        ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;

        # --- Security headers ---
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;  # Volume 3
        add_header X-Frame-Options        "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection       "0" always;
        add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;

        # --- Slow-client protection ---
        client_body_timeout   10s;       # Volume 3
        client_header_timeout 10s;

        # --- Health check (no logging noise) ---
        location = /health {              # Volume 4
            access_log off;
            return 200 "ok\n";
            default_type text/plain;
        }

        # --- Static frontend ---
        root /var/www/static;             # Volume 1
        index index.html;

        location / {
            try_files $uri $uri/ =404;

            # Long-lived cache for fingerprinted static assets
            location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {  # Volume 3
                expires 30d;
                add_header Cache-Control "public, immutable" always;
                # add_header does not inherit — repeat security headers here
                add_header X-Frame-Options        "SAMEORIGIN" always;
                add_header X-Content-Type-Options "nosniff" always;
            }
        }

        # --- API reverse proxy with load balancing, caching, rate limiting ---
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;   # Volume 3

            proxy_pass http://api_backends;                # Volume 2
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;                        # Volume 4: enable upstream keepalive
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;                       # Volume 2
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;              # Volume 2: retry on failure
            proxy_next_upstream_tries 2;

            proxy_cache api_cache;                          # Volume 3
            proxy_cache_valid 200 30s;
            proxy_cache_valid 404 10s;
            add_header X-Cache-Status $upstream_cache_status always;
        }

        # --- Larger upload allowance for a specific endpoint ---
        location /api/upload/ {                             # Volume 4
            client_max_body_size 50m;
            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;
        }
    }
}
```

```text
# /etc/nginx/proxy_params  (Volume 2)
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

This is a complete, defensible production configuration. Every directive traces back to a real problem it solves, which you now understand.

---

