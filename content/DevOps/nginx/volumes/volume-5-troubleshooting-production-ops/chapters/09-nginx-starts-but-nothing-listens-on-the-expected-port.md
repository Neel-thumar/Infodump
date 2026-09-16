## nginx Starts But Nothing Listens on the Expected Port

### What It Means

nginx process is running, but `curl` to the expected port gets "connection refused."

### Common Causes

- Another process is already using that port (nginx fails to bind but the master process might still be "running" in a broken state, or fails silently in some setups).
- The `listen` directive has a typo or wrong port number.
- Firewall rules block the port even though nginx is listening correctly.
- In Docker, the port isn't actually published/mapped in `docker-compose.yml`.

### Investigation

**Step 1: Check what's actually listening.**

```bash
# On the host or inside the container:
netstat -tlnp | grep nginx
# or
ss -tlnp | grep nginx
```

If nginx isn't listed, it's not bound to the port at all — check the error log for a bind failure:

```text
nginx: [emerg] bind() to 0.0.0.0:443 failed (98: Address already in use)
```

**Step 2: Find what's using the port instead.**

```bash
lsof -i :443
```

Another process (maybe an old nginx instance that didn't fully stop, or a different service) is holding the port.

**Step 3: For Docker setups, verify the port mapping.**

```bash
docker compose ps
```

Confirm the `PORTS` column shows the expected mapping (e.g., `0.0.0.0:8443->443/tcp`). If it's missing, check `docker-compose.yml` for the `ports:` section.

### Fix

- Stop the conflicting process, or change nginx's `listen` port.
- Fix the `docker-compose.yml` port mapping.
- Check firewall rules (`ufw`, `iptables`, cloud security groups) if the port is open locally but unreachable externally.

### Prevention

- Ensure old nginx processes are fully stopped before starting new ones (especially after crashes or manual process management).
- Use consistent port configuration across environments to avoid "works on staging, not on production" surprises.

---

