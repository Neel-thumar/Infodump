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

