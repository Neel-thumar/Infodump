## Security Headers — What the Browser Needs

Security headers tell browsers how to handle your content safely. They don't protect the server — they protect the user's browser.

```nginx
server {
    ...

    # Security headers
    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection       "0" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;
}
```

### What Each Header Does

**`X-Frame-Options: SAMEORIGIN`**

Prevents your page from being embedded in an `<iframe>` on another site. This blocks **clickjacking** attacks, where an attacker overlays your site with invisible elements to trick users into clicking things they don't intend to.

**`X-Content-Type-Options: nosniff`**

Prevents the browser from guessing the file type. Without this, a browser might interpret a text file as JavaScript if the content looks like code — an attack vector called **MIME type sniffing**. With `nosniff`, the browser strictly uses the `Content-Type` header.

**`X-XSS-Protection: 0`**

This disables the browser's built-in XSS filter. The old value `1; mode=block` is no longer recommended — the XSS filter itself had vulnerabilities and modern browsers have deprecated it. Content Security Policy (CSP) is the modern replacement for XSS protection.

**`Referrer-Policy: strict-origin-when-cross-origin`**

Controls what information the browser sends in the `Referer` header when navigating away from your site. `strict-origin-when-cross-origin` sends the full URL for same-origin requests but only the origin (no path) for cross-origin requests, and nothing over a HTTPS→HTTP downgrade.

**`Permissions-Policy: camera=(), microphone=(), geolocation=()`**

Disables browser features your site doesn't use. If an XSS attack injects code that tries to access the camera, the browser blocks it because the permissions policy says no.

### HSTS — Strict Transport Security

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

Tells the browser: always use HTTPS for this domain for the next 2 years. After the first visit, the browser won't even try HTTP.

> **Warning for local development:** Don't add HSTS to your localhost config. If you do, your browser will refuse to use HTTP for localhost until the max-age expires, which is annoying. We'll add it in the final production config.

### The `always` Parameter

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
```

The `always` keyword means the header is added to **all responses**, including error responses (404, 500, etc.). Without `always`, nginx only adds the header to successful responses, leaving error pages unprotected.

### `server_tokens off` — Hide Version Information

```nginx
http {
    server_tokens off;
    ...
}
```

By default, nginx sends `Server: nginx/1.27.3` in response headers and on error pages. This reveals your exact nginx version, which helps attackers look up known vulnerabilities.

With `server_tokens off`, the header becomes just `Server: nginx` and error pages don't show the version.

This is a small change, but it's a low-cost security improvement that every production config should include.

---

