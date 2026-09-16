## Keepalive Tuning

Keepalive connections avoid the overhead of creating a new TCP connection for every request. There are two separate keepalive settings: between the **client and nginx**, and between **nginx and the upstream**.

### Client-Side Keepalive

```nginx
http {
    keepalive_timeout  65s;
    keepalive_requests 100;
}
```

- **`keepalive_timeout 65s`** — How long an idle client connection stays open. After the last response, nginx waits this long for a new request before closing the connection. The default of 65 seconds is reasonable. Lowering it frees connections faster; raising it helps clients that make periodic requests.

- **`keepalive_requests 100`** — Maximum number of requests nginx serves on a single keepalive connection before closing it. The default of 1000 (in recent versions) is fine. This prevents a single connection from staying open indefinitely and leaking resources.

### Upstream Keepalive

We configured this in Volume 2:

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;
    keepalive 32;
}

location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_pass http://api_backends;
}
```

`keepalive 32` keeps up to 32 idle connections per worker to the upstream group. Under steady traffic, these connections get reused instead of being created and destroyed for every request.

**Tuning the number:**

- Too low (e.g., `keepalive 2`): Under moderate load, most requests create new connections, defeating the purpose.
- Too high (e.g., `keepalive 256`): Idle connections waste resources on both nginx and the backend.
- Right range: Start with 16–64 for typical API traffic. Monitor the number of new connections to upstreams. If it's still high, increase.

### `keepalive_timeout` to Upstreams

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;
    keepalive 32;
    keepalive_timeout 60s;
}
```

`keepalive_timeout 60s` in the upstream context (available in recent nginx versions) controls how long an idle upstream connection stays open. This should be slightly lower than the backend's own keepalive timeout to avoid nginx sending a request on a connection the backend has already closed.

---

