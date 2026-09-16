## 403 Forbidden — Access Denied

### What It Means

nginx explicitly denied the request. This is different from 404 (not found) — nginx knows about the resource but refuses to serve it.

### Common Causes

- File permissions: the nginx worker process user doesn't have read access to the file.
- Missing `index` file and no `autoindex` — a directory request with no index file and directory listing disabled.
- `deny` rule matched (IP-based access control).
- A `location` block with no valid way to handle the request.

### Investigation

**Step 1: Check the error log.**

```text
2026/09/16 10:23:45 [error] 1234#0: *5 "/var/www/static/private/index.html" is forbidden
(13: Permission denied), client: 172.18.0.1, server: localhost,
request: "GET /private/ HTTP/1.1", host: "localhost"
```

`(13: Permission denied)` is a filesystem permission error. The nginx worker process (running as `www-data` or `nginx`) can't read the file.

**Step 2: Check file permissions.**

```bash
ls -la /var/www/static/private/
```

The nginx worker user needs at least read permission on files and execute permission on directories (to traverse into them).

**Step 3: Check for `allow`/`deny` rules.**

```bash
grep -A 5 "location" nginx.conf | grep -B 2 "deny"
```

If a `deny all;` rule matches the client's IP, that's the cause — this is intentional, not a bug, but confirm the client should or shouldn't have access.

**Step 4: Check for missing index with directory listing off.**

A request to a directory (`/private/`) with no `index.html` inside it and no `autoindex on;` configured returns 403 by default (nginx won't guess what to show).

### Fix

- Correct file/directory permissions: `chmod` and `chown` to match the nginx worker user.
- Add an `index` file if missing.
- Adjust `allow`/`deny` rules if access should be permitted.
- Enable `autoindex on;` only if directory listing is intentional (rare in production — usually a security risk).

### Prevention

- Set correct permissions as part of your deployment process, not manually after the fact.
- Use `allow`/`deny` deliberately and document why specific paths are restricted.

---

