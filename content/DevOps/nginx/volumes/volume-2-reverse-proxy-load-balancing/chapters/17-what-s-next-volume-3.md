## What's Next — Volume 3

In Volume 3, we add three critical production layers to our setup:

- **TLS termination** — HTTPS on the front door, with HTTP-to-HTTPS redirection.
- **Caching** — proxy cache for responses, cache keys, and the operational challenge of invalidation.
- **Security hardening** — rate limiting with `limit_req`, security headers, `server_tokens off`, IP-based access control, and what nginx can and cannot protect.

The continuous project evolves to Stages 4, 5, and 6: TLS, caching, rate limiting, and security headers. By the end of Volume 3, the config will look close to production-ready.
