## Config Reload vs Restart — Why It Matters

This is one of those details that separates production-ready thinking from beginner thinking.

### Restart: `nginx -s stop` then start, or `systemctl restart nginx`

A restart kills all worker processes immediately and starts new ones. Any client in the middle of receiving a response gets disconnected. In production with live traffic, this means dropped requests.

### Reload: `nginx -s reload` or `systemctl reload nginx`

A reload is graceful:

1. The master process reads and validates the new config.
2. If the config is valid, the master starts **new** worker processes with the new config.
3. The **old** worker processes stop accepting new connections but finish serving their current ones.
4. Once all current connections in an old worker are done, that old worker exits.

During a reload, both old and new workers exist briefly. New connections go to new workers (new config). Existing connections finish on old workers (old config). No connections are dropped.

```text
Before reload:
  Master ── Worker A (old config) ── handling connections

During reload:
  Master ── Worker A (old config, draining) ── finishing existing connections
         ── Worker B (new config) ── handling new connections

After drain completes:
  Master ── Worker B (new config) ── handling all connections
```

This is why, in production, you **always reload, never restart** — unless you have a specific reason (like upgrading the nginx binary itself).

### The Safety Net: `nginx -t`

Before reloading, always test:

```bash
nginx -t
```

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If the config has an error:

```text
nginx: [emerg] unknown directive "locaton" in /etc/nginx/nginx.conf:10
nginx: configuration file /etc/nginx/nginx.conf test failed
```

`nginx -t` validates the config without applying it. If you skip this step and reload a broken config, the reload will fail and the **old config stays active** — which is nginx being safe. But if you're running `nginx -t` in a CI/CD pipeline or deploy script, catching the error before even attempting the reload is the proper workflow.

> **The habit:** `nginx -t` → then `nginx -s reload`. Every time. Build this into your muscle memory.

---

