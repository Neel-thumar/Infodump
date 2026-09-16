## Log Rotation

nginx writes to log files continuously. Without rotation, they grow until they fill the disk.

On most Linux distributions, `logrotate` handles this automatically. The default config (usually at `/etc/logrotate.d/nginx`) rotates logs daily and keeps 14 days.

If you need to manually trigger log rotation:

```bash
# Move the current log
mv /var/log/nginx/access.log /var/log/nginx/access.log.1

# Tell nginx to reopen log files
nginx -s reopen
```

The `reopen` signal tells nginx to close the old file handle and open a new file at the configured path. This is safe during live traffic — no log lines are lost.

In Docker, logs are often collected from `stdout`/`stderr` by the container runtime. You can configure nginx to log to stdout:

```nginx
access_log /dev/stdout main;
error_log  /dev/stderr warn;
```

This lets Docker's logging driver handle collection and rotation.

---

