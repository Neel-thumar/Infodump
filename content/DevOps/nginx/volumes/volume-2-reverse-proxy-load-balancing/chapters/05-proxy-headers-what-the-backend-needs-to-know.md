## Proxy Headers — What the Backend Needs to Know

When nginx proxies a request, the backend sees the request coming from **nginx's IP**, not from the original client. And by default, the `Host` header the backend receives is the upstream server's address, not the client's original hostname.

This causes real problems:

- Logging on the backend shows nginx's IP for every request, not the real client.
- The backend can't make decisions based on the client's IP (rate limiting, geo-routing).
- The backend generates URLs using the wrong hostname.
- Security audit trails are useless.

### The Essential Proxy Headers

```nginx
location /api/ {
    proxy_pass http://backend1:3001;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Let's understand each one.

### `Host`

```nginx
proxy_set_header Host $host;
```

Without this, the backend receives `Host: backend1:3001` — the upstream address. With this, the backend receives the original hostname the client used, like `Host: myapp.example.com`.

This is critical for backends that serve different content based on the hostname, generate absolute URLs, or validate the Host header.

### `X-Real-IP`

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

`$remote_addr` is the client's IP as seen by nginx. This header tells the backend the real client IP.

### `X-Forwarded-For`

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

This is the standard header for tracking the chain of proxies a request passed through. `$proxy_add_x_forwarded_for` appends the client's IP to any existing `X-Forwarded-For` header. If the request passed through multiple proxies:

```text
X-Forwarded-For: original-client-ip, first-proxy-ip
```

The backend reads the first IP in the list to get the original client.

### `X-Forwarded-Proto`

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

`$scheme` is `http` or `https`. This tells the backend whether the original client connection was secure. Important when nginx terminates TLS — the backend gets plain HTTP from nginx, but it needs to know the client used HTTPS (for generating correct redirect URLs, setting secure cookies, etc.).

### Setting Headers in a Reusable Way

You will use these same headers for every proxied location. Instead of repeating them, put them in a separate file:

```nginx
# /etc/nginx/proxy_params (create this file)
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Then include it:

```nginx
location /api/ {
    proxy_pass http://backend1:3001;
    include /etc/nginx/proxy_params;
}
```

Many distributions ship a default `proxy_params` file. If yours doesn't, create one.

---

