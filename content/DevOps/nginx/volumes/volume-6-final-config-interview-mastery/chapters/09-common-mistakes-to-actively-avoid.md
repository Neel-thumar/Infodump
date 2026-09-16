## Common Mistakes to Actively Avoid

- Forgetting the trailing slash consideration on `proxy_pass`, causing silent path-stripping.
- Leaving `client_max_body_size` at the tiny default and being confused when uploads fail.
- Caching authenticated/user-specific responses without proper safeguards.
- Setting rate limits without a `burst` allowance, breaking normal browser page loads.
- Restarting nginx instead of reloading for routine config changes.
- Skipping `nginx -t` before a reload.
- Manually tracking TLS certificate expiry instead of automating renewal.
- Assuming `nginx -t` passing means the site actually works.
- Believing security headers protect the server — they protect the browser/user, not your backend.
- Forgetting that regex locations are order-dependent while prefix locations are not.

---

