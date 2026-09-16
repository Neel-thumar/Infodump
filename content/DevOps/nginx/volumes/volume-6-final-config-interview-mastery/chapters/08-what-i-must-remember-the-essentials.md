## What I Must Remember — The Essentials

If you remember nothing else from this guide, remember these:

1. nginx uses an **event-driven, non-blocking architecture** — one worker handles thousands of connections by never waiting idle on any single one.
2. **`location` matching**: longest prefix wins, unless a regex matches first (checked top-to-bottom) — except `=` (exact) and `^~` (preferential prefix) skip regex checking entirely.
3. **The trailing slash on `proxy_pass`** determines whether the matched location prefix is stripped from the forwarded request.
4. **Always set proxy headers** (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) on every proxied location.
5. **Reload, don't restart**, for routine config changes — reload drains old connections gracefully; restart drops them.
6. **Always run `nginx -t` before reloading** — every time, no exceptions.
7. **Caching user-specific data without proper cache keys leaks data** between users. Never cache authenticated endpoints without `proxy_no_cache`/`proxy_cache_bypass`.
8. **Health checks in open-source nginx are passive** — nginx only learns a backend is down when a real request fails.
9. **502 means nginx couldn't connect to the backend; 504 means it connected but the backend was too slow.**
10. **`add_header` in a child block drops all parent `add_header` directives** — repeat what you need.

---

