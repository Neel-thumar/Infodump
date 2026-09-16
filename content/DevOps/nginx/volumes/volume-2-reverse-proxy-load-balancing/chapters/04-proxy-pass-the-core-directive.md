## `proxy_pass` — The Core Directive

`proxy_pass` tells nginx: "Don't serve this request yourself. Forward it to this backend."

### Simplest Example

```nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend1:3001;
    }
}
```

When a request comes in for `/api/users`:

1. nginx matches `location /api/`.
2. nginx opens a connection to `backend1:3001`.
3. nginx forwards the request.
4. The backend responds.
5. nginx sends the response back to the client.

The client thinks it's talking to nginx. The backend thinks it's getting a request from nginx. Neither sees the other directly.

### The Trailing-Slash Trap

This is one of the most common nginx mistakes, and it trips up experienced engineers too. Pay close attention.

**`proxy_pass` without a trailing slash:**

```nginx
location /api/ {
    proxy_pass http://backend1:3001;
}
```

Request: `GET /api/users`

What nginx forwards to the backend: `GET /api/users`

The **full original URI** is forwarded, unchanged.

**`proxy_pass` with a trailing slash:**

```nginx
location /api/ {
    proxy_pass http://backend1:3001/;
}
```

Request: `GET /api/users`

What nginx forwards to the backend: `GET /users`

The `/api/` prefix is **stripped** and replaced with `/`. Only the part after `/api/` is forwarded.

**The rule:**

- If `proxy_pass` has **no URI component** (no path after the port), nginx forwards the **complete original URI**.
- If `proxy_pass` has **any URI component** (even just `/`), nginx **replaces** the matched `location` prefix with the `proxy_pass` URI.

Here's one more example to make it concrete:

```nginx
location /app/v1/ {
    proxy_pass http://backend:3001/v1/;
}
```

Request: `GET /app/v1/orders`

What gets forwarded: `GET /v1/orders`

The `/app/v1/` prefix is replaced with `/v1/`.

### Why This Matters

If your backend expects requests at `/api/users` and you accidentally strip the `/api/` prefix, the backend receives `/users` and returns 404. Or worse — it handles a completely different route. This is a silent failure: nginx returns whatever the backend returns, and the error looks like an application bug, not a proxy misconfiguration.

**Mental shortcut:**

| `proxy_pass` value | What gets forwarded |
|---|---|
| `http://backend:3001` | Full original URI: `/api/users` |
| `http://backend:3001/` | URI with prefix stripped: `/users` |
| `http://backend:3001/v2/` | URI with prefix replaced: `/v2/users` |

When in doubt, start without a trailing slash and adjust only if you need path rewriting.

---

