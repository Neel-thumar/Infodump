## `root` vs `alias` — A Subtle but Important Difference

These two directives both point to files on disk, but they build the path differently.

### `root`

```nginx
location /images/ {
    root /var/www;
}
```

Request: `GET /images/logo.png`

nginx looks for: `/var/www` + `/images/logo.png` = **`/var/www/images/logo.png`**

`root` **appends the full URI** to the root path. This means the `location` prefix (`/images/`) is part of the file path.

### `alias`

```nginx
location /images/ {
    alias /var/www/img/;
}
```

Request: `GET /images/logo.png`

nginx looks for: `/var/www/img/` + `logo.png` = **`/var/www/img/logo.png`**

`alias` **replaces the location prefix** with the alias path. The `/images/` part of the URI is swapped out for `/var/www/img/`.

### When to Use Which

| Use case | Use |
|---|---|
| The files on disk mirror the URI structure | `root` |
| The URI prefix doesn't match the directory structure | `alias` |

Most of the time, `root` is what you want. Use `alias` when you need to map a URI to a directory with a different name.

### Common Mistake with `alias`

Forgetting the trailing slash in the `alias` path:

```nginx
# WRONG — will produce broken paths
location /images/ {
    alias /var/www/img;
}
```

Request for `/images/logo.png` → nginx looks for `/var/www/imglogo.png` (missing slash between directory and filename).

Always include the trailing slash: `alias /var/www/img/;`

---

