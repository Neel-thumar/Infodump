---
id: nginx-vol-0-big-picture
title: "Volume 0 — nginx: The Big Picture"
order: 0
description: "What nginx is, why it exists, where it sits in your infrastructure, and setting up the continuous project environment."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 0 — nginx: The Big Picture

Before you write a single line of `nginx.conf`, you need a clear mental picture of what nginx actually does. Not a textbook definition — an understanding of the real problem it solves and where it sits in the path of every request your users make.

This volume builds that picture. By the end, you will know what nginx is, why it was built, how it compares to alternatives, and where it fits in a modern infrastructure stack. You will also set up the lab environment that we will use throughout every remaining volume.

No configuration yet. No directives. Just the foundation that makes everything else make sense.

## What You Will Be Able to Do After This Volume

- Explain what nginx is and what problems it solves, in simple language.
- Distinguish between a web server, a reverse proxy, and a load balancer — and explain why nginx does all three.
- Describe where nginx sits in the journey of a real HTTP request.
- Explain why nginx exists when application servers already handle requests.
- Set up a working lab environment with nginx and two simple backend servers.
- Have the continuous project ready for Volume 1.

---

## What Is nginx?

nginx (pronounced "engine-x") is a piece of software that sits between your users and your application. Every HTTP request from a browser, mobile app, or API client hits nginx first. nginx decides what to do with that request — serve a file directly, forward it to an application server, reject it, cache the response, or something else.

That's the core idea. nginx is a **traffic handler**. It receives requests, makes decisions, and either answers them itself or passes them to someone who can.

In production, nginx is almost never the thing that runs your application logic. Your Python, Node.js, Java, Go, or .NET application does that. nginx sits *in front of* those applications and handles the parts they shouldn't have to deal with: accepting thousands of simultaneous connections efficiently, terminating TLS, serving static files, distributing load across multiple backend instances, and adding caching, compression, and rate limiting.

### One sentence to remember

> nginx is the front door of your infrastructure — it receives all incoming traffic and decides where each request goes.

---

## The Front-Desk Analogy

Throughout this guide, we will use one consistent analogy. Think of nginx as the **front desk of a large office building**.

When a visitor (an HTTP request) arrives at the building:

1. They don't walk directly into individual offices. They go to the **front desk** first.
2. The front desk checks who they want to see and what they need.
3. If the visitor just needs a brochure (a static file), the receptionist hands it over directly from the drawer — no need to bother anyone in the back offices.
4. If the visitor needs to talk to someone specific, the receptionist walks them to the right department (an application server) and brings the answer back.
5. If multiple staff members can help (multiple backend instances), the receptionist picks the one who is least busy.
6. The receptionist handles the security check at the door (TLS), so the back-office staff don't have to check IDs themselves.
7. If someone keeps asking the same question repeatedly, the receptionist remembers the last answer and gives it directly (caching).

This analogy is not perfect — no analogy is. But it maps surprisingly well to how nginx works, and we will return to it when new concepts land better with this mental picture.

**Always remember:** the analogy is a starting point. The real explanation follows every time.

---

## Why Does nginx Exist?

### The Problem: Too Many Visitors, Not Enough Doors

In the early 2000s, the internet was growing fast. Web servers at the time — primarily Apache — handled each connection by assigning it a dedicated process or thread. This worked fine for a few hundred connections. But when thousands or tens of thousands of users connected simultaneously, each one consumed memory and CPU for its own process/thread, even if most of them were just waiting — waiting for a slow network, waiting for the client to send the next request, waiting for nothing.

This was called the **C10K problem**: how do you handle 10,000 concurrent connections on a single server?

nginx was written by Igor Sysoev and first released in 2004 specifically to solve this problem. Instead of dedicating a process to each connection, nginx uses a different approach: a small number of **worker processes**, each of which can handle **thousands of connections at once** using an **event-driven loop**.

Think of it this way:

- **The old approach (Apache's traditional model):** Hire one receptionist per visitor. When you have 10,000 visitors, you need 10,000 receptionists, most of whom are standing around waiting.
- **nginx's approach:** Hire a few very efficient receptionists. Each one manages thousands of visitors at once by quickly checking in on whoever needs attention right now, instead of standing dedicated to one visitor doing nothing.

This is a simplified picture — Apache also evolved beyond pure process-per-connection — but the core architectural difference is real and explains why nginx became the dominant web server and reverse proxy for high-traffic sites.

### What nginx gives you that your application server doesn't

Your application server (Node.js, Gunicorn, Kestrel, Puma, etc.) *can* receive HTTP requests directly. So why put nginx in front?

| Concern | Application server alone | With nginx in front |
|---|---|---|
| Handling thousands of idle connections | Expensive — each holds a thread/process or goroutine | Cheap — nginx's event loop handles idle connections for almost no cost |
| Serving static files (CSS, JS, images) | Works but wastes application resources | nginx serves them directly from disk, extremely fast |
| TLS termination | Every app needs its own TLS setup | nginx handles TLS once, backends get plain HTTP |
| Load balancing across multiple app instances | You need a separate load balancer | nginx distributes requests across backends |
| Rate limiting and basic protection | You build it into the app (or add middleware) | nginx handles it before the request reaches the app |
| Graceful deploys | Restarting the app drops connections | nginx holds connections while you restart backends behind it |

In production, you almost always want something in front of your application servers. nginx is one of the most common choices for that role.

---

## The Three Jobs of nginx

nginx is often described in three different ways, and people get confused about whether these are different tools. They are not. They are three jobs that the same nginx process performs.

### Job 1: Web Server — Serving Static Files

When a request comes in for a file that already exists on disk — an HTML page, a CSS stylesheet, a JavaScript bundle, an image — nginx serves it directly. It reads the file from the filesystem and sends it back to the client. No application server is involved.

This is nginx's simplest job, and it does it extremely efficiently.

```text
Client  ──GET /style.css──>  nginx  ──reads from disk──>  /var/www/style.css
Client  <──200 OK + file──   nginx
```

### Job 2: Reverse Proxy — Forwarding Requests to Backends

When a request needs application logic (an API call, a database query, a form submission), nginx forwards the request to an application server, waits for the response, and sends it back to the client.

The client never talks directly to the application server. It only knows about nginx.

```text
Client  ──GET /api/users──>  nginx  ──proxy──>  App Server (port 3000)
Client  <──200 OK + JSON──   nginx  <──JSON──   App Server
```

This is called a **reverse proxy** because the proxy works on behalf of the server, not the client. (A "forward proxy" works on behalf of the client — like a corporate proxy that your browser sends requests through. Different concept.)

### Job 3: Load Balancer — Distributing Requests Across Multiple Backends

When you have multiple instances of the same application running (for reliability, performance, or both), nginx decides which instance receives each request. This is load balancing.

```text
                                 ┌──>  App Server 1 (port 3001)
Client  ──GET /api/users──>  nginx ──┤
                                 └──>  App Server 2 (port 3002)
```

nginx picks one backend for each request based on a method you configure — round-robin (take turns), least connections (send to the least busy one), or other strategies.

### These three jobs work together

In a real production setup, nginx does all three at once:

- A request for `/index.html` → nginx serves the static file directly (web server).
- A request for `/api/orders` → nginx forwards it to one of the backend instances (reverse proxy + load balancer).

This is exactly the setup we will build across this guide.

---

## Where nginx Sits in the Request Journey

Let's trace what happens when a user's browser makes a request to your application, with nginx in the picture.

```text
1. User's browser sends:  GET https://myapp.example.com/api/orders

2. DNS resolves myapp.example.com to your server's IP address.

3. The request arrives at your server on port 443 (HTTPS).

4. nginx is listening on port 443.
   ├── nginx terminates TLS (decrypts the request).
   ├── nginx reads the Host header: myapp.example.com
   ├── nginx finds the matching server block for that hostname.
   ├── nginx matches the URI /api/orders against its location rules.
   ├── The matching location says: proxy to the upstream backend.
   ├── nginx picks one of the backend servers (load balancing).
   ├── nginx forwards the request to that backend (e.g., localhost:3001).
   │
   │   5. The backend processes the request, queries a database, etc.
   │   6. The backend sends the HTTP response back to nginx.
   │
   ├── nginx receives the response.
   ├── nginx may cache the response for future identical requests.
   ├── nginx adds/modifies response headers (security headers, compression).
   └── nginx sends the response back to the client over the TLS connection.

7. The browser receives the response and renders the page.
```

Every volume of this guide teaches a piece of this flow. By the end, you will understand every step.

---

## nginx vs Other Tools — Brief Comparison

Other tools solve similar problems. You should know they exist and what they're good at, but this guide teaches nginx.

| Tool | What it's known for | How it relates to nginx |
|---|---|---|
| **Apache (httpd)** | Traditional web server with a rich module ecosystem | nginx and Apache both serve static files and reverse-proxy; nginx is generally preferred for high-concurrency scenarios and reverse-proxy/load-balancer roles |
| **HAProxy** | Dedicated, highly capable load balancer and proxy | HAProxy focuses purely on proxying and load balancing with very advanced health checks and routing; nginx covers that plus static file serving |
| **Envoy** | Modern proxy designed for service meshes and microservices | Envoy is common in service-mesh architectures (Istio); nginx is common as an edge proxy and ingress |
| **Caddy** | Web server with automatic HTTPS and simple config | Caddy is simpler to configure for basic setups; nginx gives more control at the cost of more config |
| **Traefik** | Dynamic proxy with native container/orchestration integration | Traefik auto-discovers backends in Docker/Kubernetes; nginx requires more explicit configuration but is more predictable |

These are not enemies — in a real infrastructure, you might use nginx as the edge proxy and Envoy inside a service mesh. What matters is understanding the *concepts* (reverse proxy, load balancing, TLS termination), which are the same regardless of the tool.

This guide uses **open-source nginx** for all practical exercises. nginx Plus (the commercial version) adds features like active health checks and a dashboard — we will note where it differs, but never require it.

---

## nginx in 2026 — Where Does It Fit Today?

nginx is not a legacy tool. As of 2026, it remains one of the most widely deployed pieces of infrastructure software in the world.

Here is where you will commonly encounter it:

### Directly configured on servers or VMs

Small-to-medium deployments, on-premise setups, and many production environments still run nginx directly on Linux servers, configured by hand or through configuration management tools (Ansible, etc.). This is the primary mode this guide teaches.

### As a Docker container

`docker run nginx` is one of the most pulled images on Docker Hub. Running nginx in a container is extremely common for development, CI/CD, and production alike.

### As the engine inside Kubernetes Ingress

The **ingress-nginx** controller is one of the most popular Kubernetes ingress controllers. It runs nginx internally and generates `nginx.conf` from Kubernetes Ingress resources. If you understand nginx configuration, you will understand what ingress-nginx is doing under the hood — and you will be far better at debugging it.

### In front of API gateways and microservices

nginx often sits as the outermost proxy layer even when more specialized tools (Kong, which is itself built on nginx, or Envoy) handle internal routing.

Understanding nginx is not just about configuring one tool. It is about understanding the **traffic-handling layer** that sits in front of almost every production application.

---

## The Continuous Project — What We Are Building

Starting from Volume 1 and evolving through every volume, we will build and improve one configuration:

```text
                    Internet / Client
                         │
                         ▼
                 ┌───────────────┐
                 │     nginx     │
                 │               │
                 │  - TLS        │
                 │  - Static     │
                 │    files      │
                 │  - Proxy      │
                 │  - Load       │
                 │    balance    │
                 │  - Cache      │
                 │  - Rate limit │
                 │  - Logging    │
                 └───────┬───────┘
                    │         │
                    ▼         ▼
              ┌──────────┐ ┌──────────┐
              │ Backend  │ │ Backend  │
              │ API #1   │ │ API #2   │
              │ :3001    │ │ :3002    │
              └──────────┘ └──────────┘
```

**The application:**

- A static frontend (a simple HTML/CSS page served by nginx directly).
- A backend API (a tiny HTTP server — we will use a simple Python or Node.js script) running as two instances on different ports, to practice load balancing.

**How the config evolves:**

| Volume | What gets added |
|---|---|
| 1 | Serve the static frontend |
| 2 | Reverse proxy `/api/` to one backend, then load balance across two |
| 3 | Add TLS, caching, rate limiting, security headers |
| 4 | Tune performance, add structured logging |
| 5 | Break it, debug it, practice production operations |
| 6 | Final production config — every line explained |

By the end, you will have one `nginx.conf` that you built from scratch, understand completely, and can explain in an interview.

---

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

## Essential Commands You Will Use Constantly

Before we dive into configuration in Volume 1, here are the nginx commands you will use over and over. Don't memorize them yet — just know they exist.

| Command | What it does |
|---|---|
| `nginx -t` | Tests the config for syntax errors without applying it |
| `nginx -s reload` | Gracefully reloads the config (no dropped connections) |
| `nginx -s stop` | Stops nginx immediately |
| `nginx -s quit` | Gracefully stops after finishing current requests |
| `nginx -V` | Shows the nginx version and compile-time options |

If you are using Docker:

```bash
docker compose exec nginx nginx -t        # test config
docker compose exec nginx nginx -s reload  # reload
docker compose restart nginx               # full restart (drops connections)
```

If you installed locally and use systemd:

```bash
sudo nginx -t                    # test config
sudo systemctl reload nginx      # graceful reload
sudo systemctl restart nginx     # full restart
```

**The most important habit to build right now:**

> **Always run `nginx -t` before reloading.** Every time. No exceptions.

A bad config that passes reload will take down your server. `nginx -t` catches the error before it does any damage.

---

## The Mental Model We Will Build

This is the complete picture of how nginx handles a request. Right now, most of these pieces won't mean much. By Volume 6, every single step will be clear.

```text
Client sends HTTP request
        │
        ▼
nginx Master Process (reads config, manages workers)
        │
        ▼
nginx Worker Process (handles the actual connection)
        │
        ▼
TLS termination (if HTTPS — decrypt the request)
        │
        ▼
Match server_name + listen (which server block?)
        │
        ▼
Match location (which rule inside that server block?)
        │
        ├───> Serve static file directly
        │
        ├───> proxy_pass to upstream (reverse proxy / load balance)
        │          │
        │          ▼
        │     Backend Application
        │          │
        │          ▼
        │     Response returns to nginx
        │
        ├───> Return a redirect or rewrite
        │
        ├───> Deny / rate-limit / block
        │
        ▼
nginx applies: headers, compression, caching, logging
        │
        ▼
Response sent to Client
```

Every volume teaches a piece of this flow:

- **Volume 1:** The architecture (master/workers), `server` and `location` matching, static file serving.
- **Volume 2:** `proxy_pass`, `upstream`, load balancing — the middle section.
- **Volume 3:** TLS termination at the top, caching and security near the bottom.
- **Volume 4:** Compression, logging — the response processing.
- **Volume 5:** What happens when any of these steps fails.
- **Volume 6:** The complete picture, fully explained.

---

## What's Next — Volume 1

In Volume 1, we will open up the nginx engine and understand how it works inside — the master process, worker processes, the event-driven model, and why this architecture matters for performance.

Then we will write our first real `nginx.conf`, understand contexts (`http`, `server`, `location`), learn how `location` matching works (this trips up almost everyone), and configure nginx to serve the static frontend of our project.

By the end of Volume 1, you will have a running nginx that serves real files, and you will understand every line of its configuration.

---

## Lab Cleanup

If you want to stop the lab environment:

**Docker:**

```bash
docker compose down
```

**Local installation:**

```bash
# Stop the backends (Ctrl+C in their terminals)
sudo systemctl stop nginx
```

The project directory at `~/nginx-guide/` stays. We will use it throughout the entire guide.
