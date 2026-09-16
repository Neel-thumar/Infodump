## Browser Caching for Static Assets

Proxy caching (above) stores responses at nginx. Browser caching tells the client to store responses locally so it doesn't even make a request.

For static assets that change rarely (CSS, JS, images with fingerprinted filenames):

```nginx
location / {
    try_files $uri $uri/ =404;

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

- **`expires 30d`** — Sets the `Expires` header to 30 days from now.
- **`Cache-Control: public, immutable`** — Tells the browser: this file is cacheable by anyone, and it won't change (the `immutable` flag means don't even bother revalidating).

> **Why nested location?** A `location` block inside another `location` block works in nginx. The outer `location /` handles HTML with `try_files`. The inner regex location matches static asset extensions and adds long cache headers. The inner block inherits `root` from the outer/server context.

For assets with fingerprinted filenames (`app.a1b2c3.js`), 30-day or even 1-year caching is safe. When the content changes, the filename changes, so the browser fetches the new file.

For `index.html` itself, you generally want short or no caching — so the browser always gets the latest version (which then references the correct fingerprinted assets).

---

