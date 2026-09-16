## The Continuous Project — What We Are Building

Starting from Volume 1 and evolving through every volume, we will build and improve one configuration:

```text
                    Internet / Client
                         │
                         ▼
                 ┌───────────────┐
                 │     nginx     │
                 │               │
                 │  - TLS        │
                 │  - Static     │
                 │    files      │
                 │  - Proxy      │
                 │  - Load       │
                 │    balance    │
                 │  - Cache      │
                 │  - Rate limit │
                 │  - Logging    │
                 └───────┬───────┘
                    │         │
                    ▼         ▼
              ┌──────────┐ ┌──────────┐
              │ Backend  │ │ Backend  │
              │ API #1   │ │ API #2   │
              │ :3001    │ │ :3002    │
              └──────────┘ └──────────┘
```

**The application:**

- A static frontend (a simple HTML/CSS page served by nginx directly).
- A backend API (a tiny HTTP server — we will use a simple Python or Node.js script) running as two instances on different ports, to practice load balancing.

**How the config evolves:**

| Volume | What gets added |
|---|---|
| 1 | Serve the static frontend |
| 2 | Reverse proxy `/api/` to one backend, then load balance across two |
| 3 | Add TLS, caching, rate limiting, security headers |
| 4 | Tune performance, add structured logging |
| 5 | Break it, debug it, practice production operations |
| 6 | Final production config — every line explained |

By the end, you will have one `nginx.conf` that you built from scratch, understand completely, and can explain in an interview.

---

