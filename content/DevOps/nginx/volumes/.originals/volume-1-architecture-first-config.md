---
id: nginx-vol-1-architecture-first-config
title: "Volume 1 — Architecture and Your First Config"
order: 1
description: "nginx internals (master/worker, event loop), nginx.conf contexts, location matching, and serving static files."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 1 — Architecture and Your First Config

This volume opens up the nginx engine. Before writing real configuration, you need to understand what is happening on your machine when nginx runs — how it manages processes, how it handles thousands of connections without choking, and why a config reload doesn't drop active connections.

Then we write `nginx.conf` from scratch. Not by copying a production config and hoping for the best — by understanding contexts, directives, and how nginx decides which block handles which request. By the end, you will serve the static frontend of our project and confidently predict which `location` block matches any given URL.

## Why This Matters

If you don't understand how nginx processes requests internally, every config change is guesswork. You won't know why `location /api/` matches differently than `location = /api/`, or why increasing `worker_connections` helps one problem and not another, or why a reload is safe mid-traffic but a restart isn't.

Architecture understanding is what separates "I copied this config from Stack Overflow" from "I know what this config does and I can fix it when it breaks."

## What You Will Be Able to Do After This Volume

- Explain the master process and worker process model.
- Explain why nginx's event-driven model handles concurrency better than a thread-per-connection model.
- Know what `worker_processes` and `worker_connections` control.
- Write a working `nginx.conf` from an empty file.
- Understand contexts: `main`, `events`, `http`, `server`, `location`.
- Predict which `location` block matches a given request URI.
- Serve static files correctly using `root`, `index`, and `try_files`.
- Use `nginx -t`, `nginx -s reload`, and read error logs.
- Have Stage 1 of the continuous project running: static frontend served by nginx.

---

## How nginx Runs — Master and Worker Processes

When you start nginx, it doesn't just create one process. It creates two kinds of processes with completely different jobs.

### The Master Process

The master process is the boss. It does not handle any client connections. Its jobs are:

- Read and validate the configuration file.
- Create and manage worker processes.
- Handle signals (reload, stop, quit).
- Open log files and listening sockets.

There is always exactly **one** master process. It runs as root (it needs root to bind to port 80/443 and to open log files), but the workers it spawns run as a less-privileged user (typically `www-data` or `nginx`).

### Worker Processes

Worker processes do the real work. Every incoming connection is handled by a worker. Each worker is an independent process — if one crashes, the others keep running, and the master restarts the failed one.

You can see this on a running nginx:

```bash
ps aux | grep nginx
```

```text
root      1234  ...  nginx: master process /usr/sbin/nginx
www-data  1235  ...  nginx: worker process
www-data  1236  ...  nginx: worker process
```

Back to our analogy: the master process is the **desk manager** — they read the rulebook (config), hire the receptionists (spawn workers), and handle administrative tasks (reload, shutdown). The worker processes are the **receptionists** who actually talk to visitors (handle connections).

### How Many Workers?

The directive `worker_processes` controls how many workers are created.

```nginx
worker_processes auto;
```

`auto` tells nginx to create one worker per CPU core. On a 4-core machine, you get 4 workers. This is almost always the right setting because:

- Each worker is single-threaded and uses one core efficiently.
- More workers than cores means they compete for CPU time with no benefit.
- Fewer workers than cores means you leave CPU capacity unused.

You can set a specific number (`worker_processes 2;`) but `auto` is the standard production choice.

---

## Why Event-Driven? The Key Architectural Insight

This is the most important thing to understand about nginx's internals.

### The Traditional Approach: One Thread Per Connection

Older web servers (and many application servers) assign one thread or process to each connection. When a client connects, a thread picks it up and stays dedicated to that connection until it's finished.

The problem is **waiting**. Most of the time, a connection is not doing useful work:

- Waiting for the client to send the full request (slow network).
- Waiting for the backend to respond (database query, API call).
- Waiting for the client to acknowledge received data.
- Waiting for the next request on a keep-alive connection.

While one thread waits, it holds memory and a slot in the thread pool. With 10,000 concurrent connections, you need 10,000 threads, most of them doing nothing. Memory usage explodes. Context-switching between threads wastes CPU.

### nginx's Approach: Event-Driven, Non-Blocking

Each nginx worker runs a single-threaded **event loop**. Instead of blocking on one connection, the worker asks the operating system: "Tell me which of my connections has something ready for me right now."

The OS maintains a list of all connections the worker is managing. When data arrives on any of them, the OS notifies the worker. The worker processes that data, then immediately checks for the next ready connection.

One worker can manage thousands of connections because it never sits idle waiting for a single one. It is always working on whichever connection needs attention right now.

```text
Traditional:

Thread 1 ──── [handle client A] ──── [waiting...] ──── [waiting...] ──── [done]
Thread 2 ──── [handle client B] ──── [waiting...] ──── [done]
Thread 3 ──── [handle client C] ──── [waiting...] ──── [waiting...] ──── [done]
   ...1000 more threads, most of them waiting...

nginx event loop:

Worker ──── [client A: read request] ─┐
            [client C: send response] ─┤  (processes whichever connection is ready)
            [client B: read request]  ─┤
            [client A: proxy to backend]┤
            [client D: new connection] ─┤
            [...thousands more...]     ─┘
```

Think of the analogy: instead of one receptionist standing at one visitor's side until they leave, a single efficient receptionist handles the line — greets someone, hands them a form, moves to the next person, comes back when the form is ready.

### What This Means in Practice

| Scenario | Thread-per-connection | nginx event-driven |
|---|---|---|
| 10,000 idle keep-alive connections | 10,000 threads using ~80 MB+ of memory | One worker, a few MB |
| Slow clients on mobile networks | Threads blocked waiting for slow data | Worker moves on, checks back later |
| Backend is slow to respond | Thread sits waiting for backend | Worker handles other connections while waiting |
| Traffic spike: 50K connections | Need 50K threads or start rejecting | Workers handle it if `worker_connections` is sized right |

This is why nginx can handle massive concurrency with very little memory. The event-driven model is not magic — it is simply a more efficient way to manage waiting.

### The Tradeoff

nginx's event loop is great for I/O-bound work (reading files, proxying, waiting for backends). It is not great for CPU-heavy computation. If a worker has to do something CPU-intensive (like heavy compression of a very large file), it blocks the event loop and all other connections on that worker stall.

This is fine because nginx's job is traffic handling, not computation. The heavy work happens in the backend application.

---

## worker_connections — How Many Connections Per Worker

```nginx
events {
    worker_connections 1024;
}
```

This sets the maximum number of **simultaneous connections** each worker can hold. With `worker_processes auto` on a 4-core machine and `worker_connections 1024`:

```text
Maximum concurrent connections = 4 workers × 1024 = 4,096
```

Each connection to a backend also counts. If nginx proxies every client request to a backend, each client uses two connections in the worker (one from client to nginx, one from nginx to backend).

So in reverse-proxy mode:

```text
Effective max clients ≈ (workers × worker_connections) / 2
```

The default of 512 or 1024 is fine for most setups. You increase it when you expect high concurrency (tens of thousands of connections). We will tune this properly in Volume 4.

> **Senior insight:** Don't increase `worker_connections` to an arbitrarily large number. Each connection uses a file descriptor, and the OS has file descriptor limits (`ulimit -n`). If `worker_connections` exceeds the file descriptor limit, nginx will log errors and reject connections. We'll cover this in the troubleshooting volume.

---

## Config Reload vs Restart — Why It Matters

This is one of those details that separates production-ready thinking from beginner thinking.

### Restart: `nginx -s stop` then start, or `systemctl restart nginx`

A restart kills all worker processes immediately and starts new ones. Any client in the middle of receiving a response gets disconnected. In production with live traffic, this means dropped requests.

### Reload: `nginx -s reload` or `systemctl reload nginx`

A reload is graceful:

1. The master process reads and validates the new config.
2. If the config is valid, the master starts **new** worker processes with the new config.
3. The **old** worker processes stop accepting new connections but finish serving their current ones.
4. Once all current connections in an old worker are done, that old worker exits.

During a reload, both old and new workers exist briefly. New connections go to new workers (new config). Existing connections finish on old workers (old config). No connections are dropped.

```text
Before reload:
  Master ── Worker A (old config) ── handling connections

During reload:
  Master ── Worker A (old config, draining) ── finishing existing connections
         ── Worker B (new config) ── handling new connections

After drain completes:
  Master ── Worker B (new config) ── handling all connections
```

This is why, in production, you **always reload, never restart** — unless you have a specific reason (like upgrading the nginx binary itself).

### The Safety Net: `nginx -t`

Before reloading, always test:

```bash
nginx -t
```

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If the config has an error:

```text
nginx: [emerg] unknown directive "locaton" in /etc/nginx/nginx.conf:10
nginx: configuration file /etc/nginx/nginx.conf test failed
```

`nginx -t` validates the config without applying it. If you skip this step and reload a broken config, the reload will fail and the **old config stays active** — which is nginx being safe. But if you're running `nginx -t` in a CI/CD pipeline or deploy script, catching the error before even attempting the reload is the proper workflow.

> **The habit:** `nginx -t` → then `nginx -s reload`. Every time. Build this into your muscle memory.

---

## Understanding nginx.conf — Contexts and Directives

nginx's configuration is built from **directives** organized into **contexts** (blocks). If you understand the nesting, you understand the config.

### The Simplest Possible Config

```nginx
events { }

http {
    server {
        listen 80;

        location / {
            return 200 "hello from nginx\n";
        }
    }
}
```

This is a valid, complete nginx config. Let's break it down.

### Contexts — The Nesting Structure

```text
main context          (the file itself — everything outside of blocks)
├── events { }        (connection-handling settings)
└── http { }          (all HTTP-related configuration)
    └── server { }    (one virtual server — one "site")
        └── location { }  (a rule for matching specific URIs)
```

**Main context** — The top level of the file. Directives like `worker_processes`, `error_log`, and `pid` go here. They affect the entire nginx process.

**`events` context** — Controls how workers handle connections. Contains `worker_connections` and the connection processing method. You almost always just set `worker_connections` here.

**`http` context** — Everything related to HTTP. All web server, proxy, and load balancer configuration lives inside this block. You can set defaults here that apply to all servers.

**`server` context** — Defines a virtual server. If you host multiple websites on one nginx, each gets its own `server` block. nginx uses `listen` and `server_name` to decide which `server` block handles each request.

**`location` context** — Lives inside a `server` block. Matches a specific URI pattern and defines what to do with requests that match.

### Directive Inheritance

Directives set in an outer context are inherited by inner contexts, unless overridden.

```nginx
http {
    gzip on;                # applies to all servers

    server {
        listen 80;
        server_name site-a.example.com;
        # gzip is ON here (inherited from http)

        location /api/ {
            gzip off;       # overridden: gzip is OFF for /api/
        }
    }
}
```

This inheritance is why you set common settings in the `http` block and override them in specific `server` or `location` blocks where needed.

---

## Your First Real Config — Step by Step

Let's build the Volume 1 configuration for our continuous project. We will configure nginx to serve the static frontend.

### Step 1: The Skeleton

Every `nginx.conf` needs at least `events` and `http`:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {

}
```

- `worker_processes auto` — one worker per CPU core.
- `worker_connections 1024` — each worker handles up to 1024 connections.
- `http` — we will put our server config inside this.

### Step 2: Add a Server Block

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name localhost;
    }
}
```

- `listen 80` — this server accepts connections on port 80.
- `server_name localhost` — this server responds to requests with `Host: localhost`. For local development, `localhost` is correct. In production, this would be your domain name.

### Step 3: Serve Static Files

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

Several new pieces. Let's understand each one.

---

## Key Directives Explained

### `include /etc/nginx/mime.types`

When nginx serves a file, it needs to tell the browser what kind of file it is — this is the `Content-Type` header. The `mime.types` file is a mapping: `.html` → `text/html`, `.css` → `text/css`, `.js` → `application/javascript`, `.png` → `image/png`, etc.

Without this include, nginx doesn't know that `style.css` should be served as `text/css`. The browser might refuse to apply the stylesheet because the content type is wrong.

`default_type application/octet-stream` is the fallback — if nginx can't determine the file type, it serves it as a raw binary download.

### `root /var/www/static`

This tells nginx where to find files on disk. When a request comes in for `/index.html`, nginx looks for the file at:

```text
root + URI = /var/www/static/index.html
```

For `/css/style.css`:

```text
/var/www/static/css/style.css
```

The `root` directive **appends the full URI** to the path. This seems obvious now, but it becomes important when we compare `root` with `alias` later.

### `index index.html`

When a request is for a directory (like `/`), nginx looks for this file inside that directory. So a request for `/` becomes a request for `/index.html`, which maps to `/var/www/static/index.html`.

### `try_files $uri $uri/ =404`

This is one of nginx's most useful directives. It tells nginx to try multiple options in order:

1. `$uri` — Try to serve the exact file matching the request URI.
2. `$uri/` — If that's not a file, try it as a directory (which triggers the `index` directive).
3. `=404` — If nothing works, return a 404 Not Found.

Without `try_files`, a request for a path that doesn't exist could produce confusing behavior depending on other directives. With `try_files`, the logic is explicit: look for the file, look for a directory, or return 404.

---

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

## Break It — Intentional Misconfiguration

Now let's intentionally break things to learn how nginx fails and how to diagnose it.

### Break 1: Wrong Root Path

Change `root /var/www/static;` to `root /var/www/wrong;` and reload.

```bash
# Docker:
docker compose exec nginx nginx -t     # passes! (syntax is valid)
docker compose exec nginx nginx -s reload
curl http://localhost:8080/
```

**Result:**

```html
<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
</body>
</html>
```

**Why:** `nginx -t` only checks syntax, not whether directories or files exist. The config is syntactically valid — nginx just can't find any files at `/var/www/wrong/`. This is a common production mistake: config passes tests but the file path is wrong.

**How to investigate:** Check the error log:

```bash
# Docker:
docker compose exec nginx cat /var/log/nginx/error.log
```

You'll see something like:

```text
open() "/var/www/wrong/index.html" failed (2: No such file or directory)
```

The error log tells you exactly what file nginx tried to open and why it failed. **Always check the error log first.**

**Fix:** Correct the `root` path and reload. Restore `root /var/www/static;`.

### Break 2: Missing Semicolon

Change any line to remove its semicolon:

```nginx
        root /var/www/static
```

```bash
docker compose exec nginx nginx -t
```

```text
nginx: [emerg] invalid number of arguments in "index" directive in /etc/nginx/nginx.conf:14
```

**Why:** Without the semicolon, nginx tries to parse the next line as part of the same directive. The error message might not point directly to the missing semicolon — it points to where nginx got confused. This is why you look at the line mentioned *and the line above it*.

**Fix:** Add the semicolon back, run `nginx -t`, then reload.

### Break 3: Remove `include mime.types`

Comment out the `include` line:

```nginx
    # include /etc/nginx/mime.types;
```

Reload and add a CSS file:

```bash
echo "body { color: red; }" > static/style.css  # or into the Docker volume
curl -I http://localhost:8080/style.css
```

```text
Content-Type: application/octet-stream
```

The browser will refuse to use this as a stylesheet because the content type is wrong. The file is served, but without `mime.types`, nginx doesn't know that `.css` files are `text/css`.

**Fix:** Uncomment the `include` line and reload.

---

## The `location` Block — nginx's Most Important Matching Rule

This section is critical. `location` matching is where most nginx config confusion comes from. Invest time here — it pays off every day you work with nginx.

### What Does a `location` Block Do?

A `location` block says: "When the request URI matches this pattern, apply these directives."

```nginx
server {
    listen 80;

    location / {
        # handles most requests
    }

    location /api/ {
        # handles requests starting with /api/
    }

    location /images/ {
        # handles requests starting with /images/
    }
}
```

When a request for `/api/users` comes in, nginx must decide which `location` block handles it. The rules for this decision are precise and worth understanding deeply.

### Location Match Types

nginx supports several types of location matching. Here they are in priority order (highest priority first):

| Type | Syntax | Meaning | Priority |
|---|---|---|---|
| Exact match | `location = /path` | URI must be exactly this | 1 (highest) |
| Preferential prefix | `location ^~ /path` | URI starts with this, skip regex | 2 |
| Regex (case-sensitive) | `location ~ \.php$` | URI matches this regex | 3 |
| Regex (case-insensitive) | `location ~* \.(jpg\|png)$` | URI matches this regex (case-insensitive) | 3 |
| Standard prefix | `location /path` | URI starts with this | 4 (lowest) |

### How nginx Decides — The Matching Algorithm

This is the exact process nginx follows for every request:

**Step 1:** nginx checks all **prefix locations** (exact, preferential prefix, and standard prefix). It finds the **longest matching prefix**.

**Step 2:** If the longest matching prefix is an **exact match** (`=`), use it immediately. Done.

**Step 3:** If the longest matching prefix is a **preferential prefix** (`^~`), use it immediately. No regex check. Done.

**Step 4:** nginx now checks **all regex locations**, in the order they appear in the config file. The **first regex that matches** wins.

**Step 5:** If no regex matches, nginx uses the longest matching prefix from Step 1.

Here's that process as a flow:

```text
Request URI arrives
       │
       ▼
Find longest matching prefix location
       │
       ├── Is it an exact match (=)?  ──── YES ──> Use it. Done.
       │
       ├── Is it a preferential prefix (^~)?  ──── YES ──> Use it. Done.
       │
       ▼
Check regex locations (top to bottom)
       │
       ├── First regex matches?  ──── YES ──> Use it. Done.
       │
       ▼
No regex matched ──> Use the longest prefix from the first step.
```

### Practical Examples

Given this config:

```nginx
server {
    listen 80;

    location = / {                    # A: exact match for "/"
        return 200 "exact root\n";
    }

    location / {                      # B: prefix match for everything
        return 200 "prefix root\n";
    }

    location /api/ {                  # C: prefix match for /api/
        return 200 "api prefix\n";
    }

    location ^~ /api/internal/ {      # D: preferential prefix for /api/internal/
        return 200 "api internal\n";
    }

    location ~ \.json$ {              # E: regex for anything ending in .json
        return 200 "json regex\n";
    }
}
```

Let's trace some requests:

**Request: `GET /`**

- Prefix matches: A (`= /`, exact), B (`/`).
- A is an exact match → **use A**. Response: `exact root`.

**Request: `GET /about`**

- Prefix matches: B (`/` matches everything starting with `/`).
- Longest prefix: B.
- Not exact, not `^~`. Check regexes: `/about` doesn't end with `.json` → E doesn't match.
- No regex matched → **use B**. Response: `prefix root`.

**Request: `GET /api/users`**

- Prefix matches: B (`/`), C (`/api/`).
- Longest prefix: C (`/api/` is longer than `/`).
- Not exact, not `^~`. Check regexes: `/api/users` doesn't end with `.json` → E doesn't match.
- No regex matched → **use C**. Response: `api prefix`.

**Request: `GET /api/data.json`**

- Prefix matches: B (`/`), C (`/api/`).
- Longest prefix: C.
- Not exact, not `^~`. Check regexes: `/api/data.json` ends with `.json` → **E matches**.
- Regex wins → **use E**. Response: `json regex`.

**Request: `GET /api/internal/status.json`**

- Prefix matches: B (`/`), C (`/api/`), D (`^~ /api/internal/`).
- Longest prefix: D.
- D is `^~` → **use D immediately, skip regex**. Response: `api internal`.

Notice how `/api/data.json` was claimed by the regex (E) instead of the prefix (C), but `/api/internal/status.json` stayed with D because `^~` blocks regex evaluation. This is the `^~` superpower — it locks a prefix against regex stealing.

### The Most Common Confusion

People assume `location` blocks are checked in file order from top to bottom. They are not.

**Prefix locations are matched by specificity (longest match), regardless of file order.**

**Regex locations are matched in file order.** The first matching regex wins.

This means:

```nginx
# These two are equivalent — order doesn't matter for prefix matching:
location /api/ { ... }
location / { ... }

# same behavior as:
location / { ... }
location /api/ { ... }
```

But for regex locations, order matters:

```nginx
# This matches .json first:
location ~ \.json$ { return 200 "json"; }
location ~ \.css$  { return 200 "css"; }

# For a request to /style.json.css — first regex (\.json$) doesn't match,
# second regex (\.css$) matches → "css"
```

### Location Matching — Mental Shortcut

When you're looking at a config and trying to figure out which location handles a request:

1. Find the **longest prefix match**.
2. Is it `=` or `^~`? → That's your answer.
3. Otherwise, scan **regexes top-to-bottom**. First match wins.
4. No regex? → Use the longest prefix.

---

## Lab: Prove Location Matching to Yourself

### Goal

See location matching in action by setting up multiple location blocks and testing requests against them.

### Setup

Update your `nginx.conf`:

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

        location = / {
            return 200 "EXACT: /\n";
            default_type text/plain;
        }

        location / {
            return 200 "PREFIX: /\n";
            default_type text/plain;
        }

        location /api/ {
            return 200 "PREFIX: /api/\n";
            default_type text/plain;
        }

        location ^~ /api/internal/ {
            return 200 "PREFERENTIAL: /api/internal/\n";
            default_type text/plain;
        }

        location ~ \.json$ {
            return 200 "REGEX: .json\n";
            default_type text/plain;
        }
    }
}
```

### Test and reload:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

### Test each case:

```bash
curl http://localhost:8080/
# Expected: EXACT: /

curl http://localhost:8080/about
# Expected: PREFIX: /

curl http://localhost:8080/api/users
# Expected: PREFIX: /api/

curl http://localhost:8080/api/data.json
# Expected: REGEX: .json

curl http://localhost:8080/api/internal/status.json
# Expected: PREFERENTIAL: /api/internal/
```

### What to Observe

- `/` hits the exact match, not the prefix `/`.
- `/about` falls through to the generic prefix `/` because nothing more specific matches.
- `/api/users` hits the longer prefix `/api/`.
- `/api/data.json` would match the prefix `/api/`, but the regex `\.json$` overrides it.
- `/api/internal/status.json` would also match the regex, but `^~` on `/api/internal/` blocks regex checking.

Run each curl and verify your predictions match reality. If any result surprises you, re-read the matching algorithm and trace through it.

### Cleanup

After finishing this lab, we'll restore the static-serving config. Keep this matching knowledge — you will need it for every volume from here on.

---

## `server_name` — Matching the Right Virtual Server

Before `location` matching happens, nginx must first decide which `server` block handles the request. This is done using two things: the port (`listen`) and the hostname (`server_name`).

### How It Works

When a request arrives, nginx looks at:

1. Which port did the request come in on? Match it against `listen`.
2. What does the `Host` header say? Match it against `server_name`.

```nginx
http {
    server {
        listen 80;
        server_name shop.example.com;
        # handles requests to shop.example.com
    }

    server {
        listen 80;
        server_name api.example.com;
        # handles requests to api.example.com
    }
}
```

Both servers listen on port 80. When a request arrives with `Host: api.example.com`, nginx routes it to the second block.

### The Default Server

If no `server_name` matches the incoming `Host` header, nginx uses the **default server** for that port. The default server is the first `server` block with that `listen` port, unless you explicitly mark one:

```nginx
server {
    listen 80 default_server;
    server_name _;
    return 444;    # drop the connection
}
```

`server_name _` is a convention for "match nothing specifically" — it acts as a catch-all. Returning 444 (an nginx-specific status code that closes the connection without sending a response) is a common way to reject requests to unknown hostnames. This prevents random requests (from bots, scanners, or misconfigured DNS) from hitting a real site.

For our local development, a single `server` block with `server_name localhost` is enough. In production with multiple domains, you will have multiple `server` blocks.

---

## `root` vs `alias` — A Subtle but Important Difference

These two directives both point to files on disk, but they build the path differently.

### `root`

```nginx
location /images/ {
    root /var/www;
}
```

Request: `GET /images/logo.png`

nginx looks for: `/var/www` + `/images/logo.png` = **`/var/www/images/logo.png`**

`root` **appends the full URI** to the root path. This means the `location` prefix (`/images/`) is part of the file path.

### `alias`

```nginx
location /images/ {
    alias /var/www/img/;
}
```

Request: `GET /images/logo.png`

nginx looks for: `/var/www/img/` + `logo.png` = **`/var/www/img/logo.png`**

`alias` **replaces the location prefix** with the alias path. The `/images/` part of the URI is swapped out for `/var/www/img/`.

### When to Use Which

| Use case | Use |
|---|---|
| The files on disk mirror the URI structure | `root` |
| The URI prefix doesn't match the directory structure | `alias` |

Most of the time, `root` is what you want. Use `alias` when you need to map a URI to a directory with a different name.

### Common Mistake with `alias`

Forgetting the trailing slash in the `alias` path:

```nginx
# WRONG — will produce broken paths
location /images/ {
    alias /var/www/img;
}
```

Request for `/images/logo.png` → nginx looks for `/var/www/imglogo.png` (missing slash between directory and filename).

Always include the trailing slash: `alias /var/www/img/;`

---

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

## Reading the Error Log — Your First Debugging Tool

The error log is where nginx tells you when something goes wrong. Before we add more features, know where it is and what it says.

### Where Is It?

Default location: `/var/log/nginx/error.log`

In Docker:

```bash
docker compose exec nginx cat /var/log/nginx/error.log
docker compose exec nginx tail -f /var/log/nginx/error.log  # live follow
```

### What Do Log Levels Mean?

The error log has levels. From most severe to least:

| Level | When It Appears |
|---|---|
| `emerg` | nginx cannot start (bad config, can't bind to port) |
| `alert` | Something requires immediate action |
| `crit` | Critical problems (disk full, permissions) |
| `error` | Request-level errors (file not found, backend refused connection) |
| `warn` | Something unusual but not broken |
| `notice` | Normal but noteworthy events |
| `info` | General information |
| `debug` | Very verbose, for development only |

In the `main` context:

```nginx
error_log /var/log/nginx/error.log warn;
```

This logs `warn` and everything above it (warn, error, crit, alert, emerg). In production, `warn` or `error` is typical. `debug` creates enormous logs and should only be used temporarily.

### Reading an Error Line

```text
2026/09/16 10:23:45 [error] 1234#0: *5 open() "/var/www/static/missing.html" failed
(2: No such file or directory), client: 172.18.0.1, server: localhost,
request: "GET /missing.html HTTP/1.1", host: "localhost"
```

This tells you:

- **When:** 2026/09/16 10:23:45
- **Severity:** error
- **Worker PID:** 1234
- **What failed:** `open()` on a file path — file not found
- **Client IP:** 172.18.0.1
- **Which server block:** localhost
- **The request:** GET /missing.html
- **The host header:** localhost

This single line tells you the entire story: a client requested `/missing.html`, nginx tried to open `/var/www/static/missing.html`, and the file doesn't exist.

---

## Things Senior Engineers Notice

1. **`nginx -t` passes but the site is broken.** Syntax validation does not check whether files, directories, or upstream servers actually exist. A valid config can still serve 404s or 502s.

2. **The `location` block you think matches might not be the one that actually matches.** When debugging unexpected behavior, the first question should be: "Which location actually handled this request?" Use `return 200 "debug: location X\n";` temporarily to verify.

3. **`root` is set in the wrong context.** If you set `root` inside one `location` block, other `location` blocks don't inherit it (they inherit from the `server` or `http` context). Set `root` at the `server` level and override only where needed.

4. **Regex locations are order-dependent.** Rearranging regex `location` blocks changes which one matches. Prefix locations are order-independent (longest match wins). Mixing the two mental models is where most config errors come from.

5. **Missing `mime.types` is a silent failure.** nginx still serves the file, but with the wrong content type. The browser silently ignores stylesheets and scripts served as `application/octet-stream`. You will not see an error in nginx logs — everything looks fine from nginx's perspective.

6. **`try_files` is not just for static files.** It's commonly used for single-page applications: `try_files $uri $uri/ /index.html;` — if the file doesn't exist, serve `index.html` and let the frontend router handle the path.

7. **The default server catches more than you think.** Without an explicit `default_server` that rejects unknown hosts, the first `server` block becomes the default. Scanners and bots hitting your IP directly will reach your site even without knowing its hostname.

8. **A reload is not instant.** Old workers drain connections, which can take seconds or even minutes if clients have long-running connections. During this window, old and new configs coexist. This is usually fine, but for changes like removing a `location` block, some requests may still be handled by the old config briefly.

---

## Interview Questions

### Level 1 — Fundamentals

**Q: How does nginx handle so many concurrent connections?**

nginx uses an event-driven, non-blocking architecture. Each worker process runs a single-threaded event loop that monitors thousands of connections and processes whichever one has data ready, instead of dedicating a thread to each connection. This avoids the memory and CPU overhead of thread-per-connection models.

**Q: What is the difference between the master process and a worker process?**

The master process reads the configuration, manages worker processes, handles signals (reload, stop), and opens log files and listening sockets. Worker processes handle actual client connections and request processing. There is one master and typically one worker per CPU core.

**Q: What does `nginx -t` do?**

It tests the configuration file for syntax errors without applying it. It checks that the config can be parsed correctly but does not verify that referenced files, directories, or upstream servers actually exist.

### Level 2 — Practical

**Q: What is the difference between a reload and a restart?**

A reload (`nginx -s reload`) is graceful: the master starts new workers with the new config while old workers finish serving existing connections. No connections are dropped. A restart kills all workers immediately and starts fresh, which drops in-flight connections.

**Q: How does nginx decide which `location` block handles a request?**

nginx first finds the longest matching prefix location. If it's an exact match (`=`) or preferential prefix (`^~`), it uses that immediately. Otherwise, it scans regex locations top-to-bottom and uses the first match. If no regex matches, it falls back to the longest prefix.

**Q: What is the difference between `root` and `alias`?**

`root` appends the full URI to the path: `root /var/www` + URI `/images/logo.png` = `/var/www/images/logo.png`. `alias` replaces the location prefix: `alias /var/www/img/` inside `location /images/` maps `/images/logo.png` to `/var/www/img/logo.png`.

### Level 3 — Scenario Based

**Q: You deployed a new `location /api/ {}` block but requests to `/api/data.json` are being handled by a different block. What's happening?**

How to think: a regex location like `location ~ \.json$` would match `.json` requests and override a standard prefix location. Prefix locations are overridden by regex locations unless the prefix uses `^~`. Check whether there's a regex location matching the URI. If so, either add `^~` to the prefix or move the logic into the regex block.

**Q: You changed `root` in one `location` block but files in other locations are now 404. What's wrong?**

How to think: if `root` was previously set at the `server` level and you moved it into a specific `location` block, other `location` blocks lose the `root` value. They fall back to the `http` context or default. Check where `root` is defined and ensure it's at the right level in the hierarchy.

### Level 4 — Senior Thinking

**Q: Why would you set up a `default_server` that returns 444 (connection close) for unknown hostnames?**

Without it, the first `server` block becomes the default, and scanners hitting your IP directly reach your actual site. Returning 444 drops connections from unknown hosts, reducing exposure of your application to bots and reconnaissance. It also prevents accidental exposure if DNS for another domain gets pointed to your IP.

**Q: What are the implications of a config reload for active long-lived connections like WebSocket connections?**

Old workers continue serving existing connections with the old config until those connections close. Long-lived connections (WebSockets, long polling) keep old workers alive. If you change proxy settings or upstream addresses, existing connections still follow the old config. You may need to wait for connections to drain or, in extreme cases, accept a short disruption.

---

## What's Next — Volume 2

In Volume 2, we put nginx to work as a reverse proxy and load balancer. We will:

- Configure `proxy_pass` to forward requests to our backend API.
- Understand the trailing-slash trap that silently changes forwarded URLs.
- Set proper proxy headers so the backend knows the real client IP and hostname.
- Configure `upstream` blocks with two backends.
- Set up round-robin, least connections, and weighted load balancing.
- Understand how nginx detects backend failures.
- Evolve the continuous project to Stages 2 and 3: reverse proxy to one backend, then load balance across both.

This is where nginx's most common production job begins.
