## Lab: Reverse Proxy to One Backend (Stage 2)

### Goal

Configure nginx to proxy API requests to one backend while still serving static files directly. This is Stage 2 of our continuous project.

### Setup

Make sure your environment from Volume 0 is running:

```bash
cd ~/nginx-guide
docker compose up -d
```

### Step 1: Create the proxy_params file

```bash
cat > proxy_params << 'EOF'
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
EOF
```

### Step 2: Update docker-compose.yml to mount proxy_params

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./proxy_params:/etc/nginx/proxy_params:ro
      - ./static:/var/www/static:ro
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

    server {
        listen 80;
        server_name localhost;

        # Static frontend
        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }

        # Proxy API requests to backend1
        location /api/ {
            proxy_pass http://backend1:3001;
            include /etc/nginx/proxy_params;
        }
    }
}
```

### Step 4: Restart (needed because we changed docker-compose.yml volumes)

```bash
docker compose down
docker compose up -d
```

### Step 5: Test static file serving

```bash
curl http://localhost:8080/
```

Expected: your HTML frontend, same as before.

### Step 6: Test the proxy

```bash
curl http://localhost:8080/api/users
```

Expected:

```json
{
  "message": "Hello from the backend API",
  "instance": "backend-1",
  "path": "/api/users"
}
```

### What to Observe

- **`instance": "backend-1"`** — the request reached backend-1. nginx proxied it.
- **`path": "/api/users"`** — the backend received the full URI `/api/users`. This is because our `proxy_pass` has no trailing slash (`http://backend1:3001`, not `http://backend1:3001/`).

### Step 7: Verify with verbose curl

```bash
curl -v http://localhost:8080/api/users 2>&1 | head -20
```

Look at the response headers:

```text
< HTTP/1.1 200 OK
< Server: nginx/1.27.x
< Content-Type: application/json
```

The client sees `Server: nginx`. It has no idea the response came from a Python backend. nginx is invisible to the client as a proxy.

### Step 8: Test the trailing-slash difference

Temporarily change the `proxy_pass` line:

```nginx
        location /api/ {
            proxy_pass http://backend1:3001/;    # added trailing slash
            include /etc/nginx/proxy_params;
        }
```

Reload and test:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
curl http://localhost:8080/api/users
```

Expected:

```json
{
  "message": "Hello from the backend API",
  "instance": "backend-1",
  "path": "/users"
}
```

Notice `"path": "/users"` — the `/api/` prefix was stripped. The backend received `/users` instead of `/api/users`.

**Revert the change** — remove the trailing slash from `proxy_pass` and reload. Our backend expects `/api/` in the path, so we keep the full URI forwarded:

```nginx
            proxy_pass http://backend1:3001;
```

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

Stage 2 is complete. nginx is serving static files at `/` and proxying API requests at `/api/` to backend-1.

---

