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

