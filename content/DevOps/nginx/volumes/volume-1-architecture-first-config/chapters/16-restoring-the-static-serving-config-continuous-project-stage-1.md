## Restoring the Static Serving Config — Continuous Project Stage 1

Let's put the location-matching lab config aside and set up the proper Stage 1 config for our project.

### Final Volume 1 Config

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

Apply it:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

Test:

```bash
curl http://localhost:8080/
```

You should see the HTML content of your `index.html`. This is Stage 1 of our project — a static frontend served by nginx.

### Add a CSS file to confirm MIME types

```bash
cat > static/style.css << 'EOF'
body {
    font-family: sans-serif;
    margin: 2rem;
}
EOF
```

Update `static/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>nginx Guide — Frontend</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>Hello from the static frontend</h1>
  <p>This page is served directly by nginx.</p>
  <p>If this text is styled (sans-serif font), nginx is serving CSS correctly.</p>
</body>
</html>
```

Open `http://localhost:8080/` in a browser. If the font has changed to sans-serif, nginx is serving both HTML and CSS with correct content types.

Verify with curl:

```bash
curl -I http://localhost:8080/style.css
```

```text
HTTP/1.1 200 OK
Content-Type: text/css
...
```

Stage 1 is complete.

---

