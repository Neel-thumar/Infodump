## Setting Up the Lab Environment

We need three things running on your machine:

1. **nginx** — the main subject.
2. **Two simple backend servers** — to act as the application that nginx proxies to.
3. **curl** — to make test requests from the terminal.

You have two options. Pick whichever is easier for you.

### Option A: Docker (Recommended)

This is the cleanest approach. Everything runs in containers, nothing touches your host system.

**Prerequisites:** Docker and Docker Compose installed.

**Step 1: Create a project directory**

```bash
mkdir ~/nginx-guide && cd ~/nginx-guide
```

**Step 2: Create the static frontend**

```bash
mkdir -p static
```

```bash
cat > static/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>nginx Guide — Frontend</title></head>
<body>
  <h1>Hello from the static frontend</h1>
  <p>This page is served directly by nginx.</p>
</body>
</html>
EOF
```

**Step 3: Create a simple backend API server**

We will use a tiny Python HTTP server. This is not a real application — it just responds with a JSON message so we can see which backend handled the request.

```bash
cat > backend.py << 'EOF'
import http.server
import json
import os
import sys

PORT = int(os.environ.get("PORT", 3001))
INSTANCE = os.environ.get("INSTANCE", "unknown")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        response = {
            "message": "Hello from the backend API",
            "instance": INSTANCE,
            "path": self.path
        }
        body = json.dumps(response, indent=2)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, format, *args):
        print(f"[Backend {INSTANCE}] {args[0]}", file=sys.stderr)

if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Backend {INSTANCE} listening on port {PORT}")
    server.serve_forever()
EOF
```

**Step 4: Create a minimal nginx config**

We will start with the absolute minimum. This will evolve throughout the guide.

```bash
cat > nginx.conf << 'EOF'
events {
    worker_connections 64;
}

http {
    server {
        listen 80;

        location / {
            return 200 "nginx is running\n";
            default_type text/plain;
        }
    }
}
EOF
```

**Step 5: Create the Docker Compose file**

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
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

> **Note:** Both backends listen on port 3001 *inside their own container*. Docker networking keeps them separate. nginx will reach them via their service names (`backend1:3001` and `backend2:3001`).

**Step 6: Start everything**

```bash
docker compose up -d
```

**Step 7: Test that nginx is running**

```bash
curl http://localhost:8080/
```

**Expected output:**

```text
nginx is running
```

If you see this, your lab environment is ready.

**Step 8: Verify the backends are running**

The backends are not yet exposed through nginx (we will do that in Volume 2), but you can confirm they are running:

```bash
docker compose logs backend1
docker compose logs backend2
```

You should see lines like:

```text
Backend backend-1 listening on port 3001
Backend backend-2 listening on port 3001
```

### Option B: Local Installation (Without Docker)

If you prefer to install nginx directly:

**Step 1: Install nginx**

On Ubuntu/Debian:

```bash
sudo apt update && sudo apt install -y nginx
```

On Oracle Linux / RHEL:

```bash
sudo dnf install -y nginx
```

**Step 2: Start nginx**

```bash
sudo systemctl start nginx
sudo systemctl status nginx
```

**Step 3: Create the project directory and files**

Follow the same Steps 1–3 from Option A to create `~/nginx-guide/`, the static frontend, and the backend script.

**Step 4: Run the backends manually**

Open two separate terminals:

```bash
PORT=3001 INSTANCE=backend-1 python3 ~/nginx-guide/backend.py
```

```bash
PORT=3002 INSTANCE=backend-2 python3 ~/nginx-guide/backend.py
```

> **Note:** In this option, both backends run on the same machine on different ports. In the Docker option, they use the same port in separate containers.

**Step 5: Edit the nginx config**

On most distributions, the main config is at `/etc/nginx/nginx.conf`. For now, we will use a custom config file:

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
```

We will replace it with our own config starting in Volume 1. For now, just verify that the default nginx is running:

```bash
curl http://localhost/
```

You should see the default nginx welcome page.

> **Warning:** Editing `/etc/nginx/nginx.conf` requires `sudo`. If you break the config, you can restore the backup. Always run `sudo nginx -t` before reloading.

---

