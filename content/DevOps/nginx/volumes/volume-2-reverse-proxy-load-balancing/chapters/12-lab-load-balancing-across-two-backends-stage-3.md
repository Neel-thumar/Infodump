## Lab: Load Balancing Across Two Backends (Stage 3)

### Goal

Add a second backend to the upstream and configure load balancing. This is Stage 3 of our continuous project.

### Step 1: Update nginx.conf

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

            proxy_connect_timeout 5s;
            proxy_read_timeout    30s;

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;
        }
    }
}
```

### Step 2: Reload

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

### Step 3: Test load balancing

Run several requests:

```bash
for i in $(seq 1 6); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

Expected output (round-robin — alternating):

```text
  "instance": "backend-1",
  "instance": "backend-2",
  "instance": "backend-1",
  "instance": "backend-2",
  "instance": "backend-1",
  "instance": "backend-2",
```

Requests alternate between the two backends. This is round-robin in action.

### Step 4: Test least_conn

Update the upstream block:

```nginx
    upstream api_backends {
        least_conn;
        server backend1:3001;
        server backend2:3001;
    }
```

Reload and test:

```bash
docker compose exec nginx nginx -s reload
for i in $(seq 1 6); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

With only simple requests, the distribution looks similar to round-robin. The difference appears under real load when requests have varying durations — the backend with fewer active connections gets the next request.

**Revert to round-robin** (remove `least_conn;`) for the rest of the guide, or keep `least_conn` if you prefer — both are solid defaults.

### Step 5: Test backend failure

Stop one backend:

```bash
docker compose stop backend1
```

Now send requests:

```bash
for i in $(seq 1 4); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

Expected:

```text
  "instance": "backend-2",
  "instance": "backend-2",
  "instance": "backend-2",
  "instance": "backend-2",
```

All requests go to backend-2. nginx detected that backend-1 is unreachable and stopped sending traffic to it.

Check the error log:

```bash
docker compose exec nginx cat /var/log/nginx/error.log | tail -5
```

You should see something like:

```text
connect() failed (111: Connection refused) while connecting to upstream,
client: 172.18.0.1, server: localhost, request: "GET /api/test HTTP/1.1",
upstream: "http://172.18.0.2:3001/api/test", host: "localhost"
```

This tells you exactly what happened: nginx tried to connect to the backend, the connection was refused. Because `proxy_next_upstream` is configured, nginx retried on the other backend and the client got a successful response.

### Step 6: Bring backend-1 back

```bash
docker compose start backend1
```

Wait a few seconds (for `fail_timeout` to expire), then test again:

```bash
for i in $(seq 1 4); do
  curl -s http://localhost:8080/api/test | grep instance
done
```

Both backends are serving again.

### Step 7: Test when ALL backends are down

```bash
docker compose stop backend1 backend2
curl -v http://localhost:8080/api/test
```

Expected:

```text
< HTTP/1.1 502 Bad Gateway
...
<html>
<head><title>502 Bad Gateway</title></head>
```

When no backends are reachable, nginx returns 502. This is the error you investigate when the "site is down."

Bring them back:

```bash
docker compose start backend1 backend2
```

Stage 3 is complete. nginx is load-balancing across two backends with failure detection and retry.

---

