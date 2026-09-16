## Buffer Tuning

Buffers control how nginx handles data in transit. The defaults work for most traffic, but certain patterns need adjustment.

### Client Request Buffers

```nginx
http {
    client_body_buffer_size   16k;
    client_max_body_size      10m;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;
}
```

**`client_body_buffer_size 16k`** — Buffer for the request body. If the body fits in memory, nginx processes it directly. If it's larger, nginx writes the excess to a temporary file on disk.

**`client_max_body_size 10m`** — Maximum allowed request body size. Requests larger than this are rejected with **413 Request Entity Too Large**. The default is 1 MB, which is too small for file uploads. Set it based on your largest expected upload.

This is one of the most common "it works locally but fails in production" issues: someone deploys an image upload feature, and nginx rejects everything over 1 MB before the request even reaches the backend.

```nginx
# For an upload endpoint:
location /api/upload/ {
    client_max_body_size 50m;
    proxy_pass http://api_backends;
}
```

**`large_client_header_buffers 4 8k`** — For requests with large headers. The default handles headers up to about 8 KB total (4 buffers × 8 KB). If your application uses large cookies or long authorization tokens, you might need to increase this.

When headers exceed the buffer: nginx returns **400 Bad Request**. The error log will show `client sent too long header line`. This is a classic gotcha with applications that store lots of data in cookies.

### Proxy Buffers

We touched on this in Volume 2:

```nginx
proxy_buffer_size    4k;
proxy_buffers        8 16k;
proxy_busy_buffers_size 32k;
```

**`proxy_buffer_size 4k`** — For the first part of the backend response (status line and headers). If your backend sends large headers (many Set-Cookie headers, for example), increase this.

**`proxy_buffers 8 16k`** — For the response body. 8 buffers of 16 KB each. If the response doesn't fit, it spills to disk (slower).

**`proxy_busy_buffers_size 32k`** — How much of the buffered response can be sent to the client while the rest is still being buffered.

**When to change proxy buffers:** If your backend responses are consistently large (several hundred KB), increase `proxy_buffers`. If your backend sends large headers, increase `proxy_buffer_size`. Monitor for `upstream sent too big header` in error logs.

The defaults are fine for typical API responses (JSON payloads under a few KB). Adjust only if you see related errors or know your response sizes are atypical.

---

