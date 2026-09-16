## nginx Won't Reload — Syntax Error

### What It Means

You ran `nginx -s reload` (or `systemctl reload nginx`) and it failed, or the reload appeared to succeed but the old config is still running.

### Investigation

**Step 1: Always run `nginx -t` first — never skip this.**

```bash
nginx -t
```

```text
nginx: [emerg] unexpected "}" in /etc/nginx/nginx.conf:45
nginx: configuration file /etc/nginx/nginx.conf test failed
```

The error tells you the exact line. Common causes:

- Missing semicolon on the previous line (nginx reports the error on the *following* line).
- Mismatched braces `{ }`.
- A directive used in the wrong context (e.g., `proxy_pass` outside a `location` block).
- A typo in a directive name.

**Step 2: If `nginx -t` passes but reload still seems to fail:**

Check if the reload signal actually reached the master process:

```bash
ps aux | grep "nginx: master"
```

If there's no master process, nginx isn't running at all — you need to start it, not reload it.

**Step 3: Check the systemd status if using systemd.**

```bash
systemctl status nginx
journalctl -u nginx -n 50
```

### Fix

- Fix the syntax error at the reported line (and check the line before it too — often the actual mistake is one line earlier, like a missing semicolon).
- If nginx isn't running, start it fresh: `systemctl start nginx`.

### Prevention

- **Always run `nginx -t` before every reload, without exception.** This is the single most effective habit for avoiding self-inflicted outages.
- Use version control for your config files so you can diff changes and quickly revert.
- In CI/CD pipelines, run `nginx -t` against the new config as an automated gate before deploying it.

---

