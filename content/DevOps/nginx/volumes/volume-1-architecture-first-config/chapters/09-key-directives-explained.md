## Key Directives Explained

### `include /etc/nginx/mime.types`

When nginx serves a file, it needs to tell the browser what kind of file it is — this is the `Content-Type` header. The `mime.types` file is a mapping: `.html` → `text/html`, `.css` → `text/css`, `.js` → `application/javascript`, `.png` → `image/png`, etc.

Without this include, nginx doesn't know that `style.css` should be served as `text/css`. The browser might refuse to apply the stylesheet because the content type is wrong.

`default_type application/octet-stream` is the fallback — if nginx can't determine the file type, it serves it as a raw binary download.

### `root /var/www/static`

This tells nginx where to find files on disk. When a request comes in for `/index.html`, nginx looks for the file at:

```text
root + URI = /var/www/static/index.html
```

For `/css/style.css`:

```text
/var/www/static/css/style.css
```

The `root` directive **appends the full URI** to the path. This seems obvious now, but it becomes important when we compare `root` with `alias` later.

### `index index.html`

When a request is for a directory (like `/`), nginx looks for this file inside that directory. So a request for `/` becomes a request for `/index.html`, which maps to `/var/www/static/index.html`.

### `try_files $uri $uri/ =404`

This is one of nginx's most useful directives. It tells nginx to try multiple options in order:

1. `$uri` — Try to serve the exact file matching the request URI.
2. `$uri/` — If that's not a file, try it as a directory (which triggers the `index` directive).
3. `=404` — If nothing works, return a 404 Not Found.

Without `try_files`, a request for a path that doesn't exist could produce confusing behavior depending on other directives. With `try_files`, the logic is explicit: look for the file, look for a directory, or return 404.

---

