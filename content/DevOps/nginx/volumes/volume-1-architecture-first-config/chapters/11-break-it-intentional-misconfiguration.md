## Break It — Intentional Misconfiguration

Now let's intentionally break things to learn how nginx fails and how to diagnose it.

### Break 1: Wrong Root Path

Change `root /var/www/static;` to `root /var/www/wrong;` and reload.

```bash
# Docker:
docker compose exec nginx nginx -t     # passes! (syntax is valid)
docker compose exec nginx nginx -s reload
curl http://localhost:8080/
```

**Result:**

```html
<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
</body>
</html>
```

**Why:** `nginx -t` only checks syntax, not whether directories or files exist. The config is syntactically valid — nginx just can't find any files at `/var/www/wrong/`. This is a common production mistake: config passes tests but the file path is wrong.

**How to investigate:** Check the error log:

```bash
# Docker:
docker compose exec nginx cat /var/log/nginx/error.log
```

You'll see something like:

```text
open() "/var/www/wrong/index.html" failed (2: No such file or directory)
```

The error log tells you exactly what file nginx tried to open and why it failed. **Always check the error log first.**

**Fix:** Correct the `root` path and reload. Restore `root /var/www/static;`.

### Break 2: Missing Semicolon

Change any line to remove its semicolon:

```nginx
        root /var/www/static
```

```bash
docker compose exec nginx nginx -t
```

```text
nginx: [emerg] invalid number of arguments in "index" directive in /etc/nginx/nginx.conf:14
```

**Why:** Without the semicolon, nginx tries to parse the next line as part of the same directive. The error message might not point directly to the missing semicolon — it points to where nginx got confused. This is why you look at the line mentioned *and the line above it*.

**Fix:** Add the semicolon back, run `nginx -t`, then reload.

### Break 3: Remove `include mime.types`

Comment out the `include` line:

```nginx
    # include /etc/nginx/mime.types;
```

Reload and add a CSS file:

```bash
echo "body { color: red; }" > static/style.css  # or into the Docker volume
curl -I http://localhost:8080/style.css
```

```text
Content-Type: application/octet-stream
```

The browser will refuse to use this as a stylesheet because the content type is wrong. The file is served, but without `mime.types`, nginx doesn't know that `.css` files are `text/css`.

**Fix:** Uncomment the `include` line and reload.

---

