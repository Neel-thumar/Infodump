## The Complete Stage 3 Config

Here is the full `nginx.conf` as it stands at the end of this volume:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    upstream api_backends {
        server backend1:3001;
        server backend2:3001;

        keepalive 32;
    }

    server {
        listen 80;
        server_name localhost;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Proxy API requests to the upstream group
        location /api/ {
            proxy_pass http://api_backends;
            include /etc/nginx/proxy_params;

            proxy_http_version 1.1;
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;
        }
    }
}
```

This config:

- Serves static files at `/` from disk.
- Proxies `/api/` requests to two backends with round-robin load balancing.
- Preserves client IP and hostname via proxy headers.
- Uses keepalive connections to backends.
- Retries on failure with limits.
- Has reasonable timeouts.

---

