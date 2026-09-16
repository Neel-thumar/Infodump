## Things Senior Engineers Notice

1. **`add_header` inheritance is the most surprising nginx behavior.** A single `add_header` in a child block silently drops all parent headers. This has caused real production incidents where security headers disappeared from specific paths. Use an `include` file for security headers and include it in every block that has its own `add_header`.

2. **Caching authenticated responses is one of the easiest ways to leak data.** If your API returns different data for different users and you cache it, one user's data gets served to another. Always use `proxy_no_cache` and `proxy_cache_bypass` for endpoints behind authentication.

3. **`limit_req` without `burst` is too aggressive.** Browsers open multiple connections and send several requests simultaneously (CSS, JS, images on page load). Without a burst allowance, legitimate page loads trigger rate limiting. Start with a reasonable burst and adjust based on real traffic patterns.

4. **Rate limiting per IP breaks behind NAT.** All users behind a corporate NAT share one IP. A `rate=10r/s` limit means the entire office shares 10 requests/second. If your users commonly share IPs, you need a different key (API key, session cookie) or much higher limits.

5. **Self-signed certificates are fine for development, a security incident in production.** Use Let's Encrypt or your org's CA. Certificate renewal must be automated — an expired certificate takes down your HTTPS site. Set a monitoring alert for certificate expiry.

6. **HSTS is a one-way door.** Once a browser receives an HSTS header with a 2-year max-age, it will refuse HTTP for 2 years. If you enable HSTS and then break HTTPS (expired cert, misconfiguration), users can't access your site at all. Start with a short max-age (1 hour) and increase only after you're confident.

7. **`proxy_cache_valid` overrides the backend's `Cache-Control` header.** If the backend sends `Cache-Control: no-cache` but nginx has `proxy_cache_valid 200 5m`, nginx caches anyway. Be deliberate about who controls caching — nginx or the backend. Mixing both without understanding the precedence causes stale-data bugs.

8. **Cache invalidation is an operational problem, not a configuration problem.** You can configure caching perfectly and still serve stale data when the backend updates. Plan for it: short TTLs, cache-busting URLs for assets, or a purge mechanism.

9. **Security headers protect the browser, not the server.** `X-Frame-Options` prevents clickjacking in the user's browser. It doesn't prevent an attacker from hitting your API directly with curl. Server-side security (input validation, authentication, authorization) is separate and equally important.

10. **`server_tokens off` is trivially easy and universally recommended.** There's no reason to reveal your nginx version. It takes one line and removes one piece of information attackers can use.

---

