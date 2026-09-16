## Lab: Add TLS to the Project (Stage 4)

### Goal

Configure nginx to serve HTTPS with a self-signed certificate and redirect HTTP to HTTPS.

### Step 1: Generate a Self-Signed Certificate

For local development, a self-signed certificate is sufficient. In production, you'd use Let's Encrypt (certbot) or your organization's certificate authority.

```bash
cd ~/nginx-guide

mkdir -p certs

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/selfsigned.key \
  -out certs/selfsigned.crt \
  -subj "/CN=localhost"
```

This creates:

- `certs/selfsigned.key` — the private key.
- `certs/selfsigned.crt` — the certificate.

### Step 2: Update docker-compose.yml

Add the HTTPS port and certificate volume:

```yaml
# docker-compose.yml
services:
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
    depends_on:
      - backend1
      - backend2

  backend1:
    image: python:3.12-slim
    working_dir: /app
    volumes:
      - ./backend.py:/app/backend.py:ro
    command: python backend.py
    environment:
      - PORT=3001
      - INSTANCE=backend-1

  backend2:
    image: python:3.12-slim
    working_dir: /app
    volumes:
      - ./backend.py:/app/backend.py:ro
    command: python backend.py
    environment:
      - PORT=3001
      - INSTANCE=backend-2
```

### Step 3: Update nginx.conf

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

    # Redirect all HTTP to HTTPS
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

        # Proxy API requests
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

Let's understand the new pieces.

### The HTTP → HTTPS Redirect Server

```nginx
server {
    listen 80;
    server_name localhost;
    return 301 https://$host:8443$request_uri;
}
```

This is a separate `server` block that listens on port 80. It doesn't serve anything — it immediately redirects every request to the HTTPS version using a 301 (permanent redirect).

- `$host` — the hostname from the request (preserves whatever the client used).
- `$request_uri` — the full original URI including query string.
- `:8443` — we use port 8443 because our Docker container maps 8443 to 443. In production on standard ports, this would just be `https://$host$request_uri`.

### The HTTPS Server

```nginx
server {
    listen 443 ssl;
    server_name localhost;

    ssl_certificate     /etc/nginx/certs/selfsigned.crt;
    ssl_certificate_key /etc/nginx/certs/selfsigned.key;
    ...
}
```

- `listen 443 ssl` — listen on port 443 with TLS enabled.
- `ssl_certificate` — path to the certificate file (public).
- `ssl_certificate_key` — path to the private key.

That's the minimum for TLS. nginx handles the entire TLS handshake — cipher negotiation, certificate presentation, encryption/decryption — without the backend knowing anything about it.

### Step 4: Restart and Test

```bash
docker compose down
docker compose up -d
```

Test the HTTP redirect:

```bash
curl -v http://localhost:8080/ 2>&1 | grep -E "< HTTP|< Location"
```

Expected:

```text
< HTTP/1.1 301 Moved Permanently
< Location: https://localhost:8443/
```

Test HTTPS (use `-k` because our certificate is self-signed):

```bash
curl -k https://localhost:8443/
```

Expected: your HTML frontend.

Test the API over HTTPS:

```bash
curl -k https://localhost:8443/api/test
```

Expected: JSON response from one of the backends.

### Step 5: Inspect the TLS connection

```bash
curl -kv https://localhost:8443/ 2>&1 | grep -E "SSL|subject|issuer|TLS"
```

You'll see output like:

```text
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* Server certificate:
*  subject: CN=localhost
*  issuer: CN=localhost
```

This confirms nginx is terminating TLS with our self-signed certificate.

> **Note:** Browsers will show a security warning for self-signed certificates. This is expected. In production, you'd use a certificate from a trusted CA (Let's Encrypt is free and automated).

Stage 4 is complete.

---

