## `upstream` Blocks — Grouping Backends

So far, `proxy_pass` points to a single backend. When you have multiple instances of the same application, you group them into an **`upstream` block**.

```nginx
http {
    upstream api_backends {
        server backend1:3001;
        server backend2:3001;
    }

    server {
        listen 80;

        location /api/ {
            proxy_pass http://api_backends;
        }
    }
}
```

Now `proxy_pass` points to the upstream group name instead of a single server. nginx distributes requests across all servers in the group.

### Important Details

- The upstream name (`api_backends`) is arbitrary. Use something descriptive.
- Each `server` line in the `upstream` block is one backend instance.
- The `upstream` block goes inside `http`, outside of any `server` block.
- `proxy_pass` references the upstream by name: `http://api_backends`.

### upstream and the Trailing Slash

The same trailing-slash rule applies:

```nginx
# Full URI forwarded:
proxy_pass http://api_backends;

# Prefix stripped:
proxy_pass http://api_backends/;
```

---

