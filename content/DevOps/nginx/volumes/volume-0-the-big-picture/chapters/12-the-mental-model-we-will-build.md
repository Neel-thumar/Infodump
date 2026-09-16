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

