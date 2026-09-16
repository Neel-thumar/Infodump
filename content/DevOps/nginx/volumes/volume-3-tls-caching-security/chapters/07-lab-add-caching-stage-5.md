## Lab: Add Caching (Stage 5)

### Goal

Add proxy caching for API responses and observe cache behavior.

### Step 1: Create the cache directory

Add a volume for the cache and create the directory inside the container. Update `docker-compose.yml` — add a `tmpfs` for the cache:

```yaml
  nginx:
    image: nginx:1.27
    ports:
      - "8080:80"
      - "8443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./proxy_params:/etc/nginx/proxy_params:ro
      - ./static:/var/www/static:ro
      - ./certs:/etc/nginx/certs:ro
    tmpfs:
      - /var/cache/nginx
    depends_on:
      - backend1
      - backend2
```

### Step 2: Update nginx.conf

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

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

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Cached API proxy
        location /api/ {
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

### Step 3: Restart and test

```bash
docker compose down
docker compose up -d
```

```bash
curl -k -s -D - https://localhost:8443/api/test -o /dev/null 2>&1 | grep -i x-cache
```

First request:

```text
X-Cache-Status: MISS
```

Second request (within 30 seconds):

```text
X-Cache-Status: HIT
```

The second request was served from cache — the backend was never contacted.

### Step 4: Verify the backend didn't get the second request

Watch backend logs:

```bash
docker compose logs --tail=5 backend1
docker compose logs --tail=5 backend2
```

You should see only one request logged, not two.

### Step 5: Wait for cache expiry

Wait 30 seconds, then request again:

```bash
sleep 31
curl -k -s -D - https://localhost:8443/api/test -o /dev/null 2>&1 | grep -i x-cache
```

```text
X-Cache-Status: EXPIRED
```

The cache entry expired. nginx fetched a fresh response from the backend.

Stage 5 is complete.

---

