## Things Senior Engineers Notice

1. **`nginx -t` passes but the site is broken.** Syntax validation does not check whether files, directories, or upstream servers actually exist. A valid config can still serve 404s or 502s.

2. **The `location` block you think matches might not be the one that actually matches.** When debugging unexpected behavior, the first question should be: "Which location actually handled this request?" Use `return 200 "debug: location X\n";` temporarily to verify.

3. **`root` is set in the wrong context.** If you set `root` inside one `location` block, other `location` blocks don't inherit it (they inherit from the `server` or `http` context). Set `root` at the `server` level and override only where needed.

4. **Regex locations are order-dependent.** Rearranging regex `location` blocks changes which one matches. Prefix locations are order-independent (longest match wins). Mixing the two mental models is where most config errors come from.

5. **Missing `mime.types` is a silent failure.** nginx still serves the file, but with the wrong content type. The browser silently ignores stylesheets and scripts served as `application/octet-stream`. You will not see an error in nginx logs — everything looks fine from nginx's perspective.

6. **`try_files` is not just for static files.** It's commonly used for single-page applications: `try_files $uri $uri/ /index.html;` — if the file doesn't exist, serve `index.html` and let the frontend router handle the path.

7. **The default server catches more than you think.** Without an explicit `default_server` that rejects unknown hosts, the first `server` block becomes the default. Scanners and bots hitting your IP directly will reach your site even without knowing its hostname.

8. **A reload is not instant.** Old workers drain connections, which can take seconds or even minutes if clients have long-running connections. During this window, old and new configs coexist. This is usually fine, but for changes like removing a `location` block, some requests may still be handled by the old config briefly.

---

