## Applying the Config — Lab: Serve Static Files

### Goal

Configure nginx to serve the static frontend from Volume 0's project setup.

### Steps for Docker Users

**Step 1:** Update `~/nginx-guide/nginx.conf`:

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

        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }
    }
}
```

**Step 2:** Test the config and reload:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

**Step 3:** Test with curl:

```bash
curl http://localhost:8080/
```

**Expected output:**

```html
<!DOCTYPE html>
<html>
<head><title>nginx Guide — Frontend</title></head>
<body>
  <h1>Hello from the static frontend</h1>
  <p>This page is served directly by nginx.</p>
</body>
</html>
```

**Step 4:** Check the response headers:

```bash
curl -I http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Server: nginx/1.27.x
Content-Type: text/html
Content-Length: 178
...
```

### What to Observe

- `Content-Type: text/html` — The `mime.types` include is working. nginx knows `.html` means `text/html`.
- `Server: nginx/1.27.x` — nginx identifies itself. We will hide this with `server_tokens off` in Volume 3.
- The HTML content is exactly what's in `static/index.html`. nginx read the file from disk and sent it.

### Steps for Local Installation Users

**Step 1:** Copy the static files:

```bash
sudo mkdir -p /var/www/static
sudo cp ~/nginx-guide/static/index.html /var/www/static/
```

**Step 2:** Replace `/etc/nginx/nginx.conf` with the same config above.

**Step 3:** Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

**Step 4:** Test:

```bash
curl http://localhost/
```

---

