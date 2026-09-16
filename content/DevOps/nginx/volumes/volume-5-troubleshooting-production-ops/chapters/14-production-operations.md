## Production Operations

### Reload vs Restart Under Real Traffic

We covered the mechanics in Volume 1. In production, the discipline matters more than the mechanics.

**The standard deploy sequence for a config change:**

```text
1. Edit the config (on a staging copy or via configuration management).
2. Run nginx -t against the new config. Do not proceed if this fails.
3. Deploy the validated config file to the server(s).
4. Run nginx -s reload (or systemctl reload nginx).
5. Verify: check error log for reload-related issues, test key endpoints.
6. If something is wrong, roll back the config file and reload again.
```

**Never restart nginx in production for a routine config change.** Restart only for binary upgrades or when nginx is in an unrecoverable state.

### Zero-Downtime nginx Binary Upgrades

Reloading applies a new *config* with the same binary. Upgrading the nginx *binary itself* (a new version) uses a different mechanism: `nginx -s USR2`.

```text
1. Send USR2 signal to the master process.
2. The old master starts a new master process with a new binary,
   which spawns new workers.
3. Both old and new master/worker sets run simultaneously.
4. Send WINCH to the old master to gracefully stop its workers.
5. Verify the new instance is handling traffic correctly.
6. Send QUIT to the old master to shut it down completely.
```

This is more involved than a config reload and is typically automated by package managers or orchestration tools (Kubernetes rolling updates handle this differently — by replacing pods rather than upgrading in-place).

### Deploying Backend Changes Without Dropping Traffic

When you deploy a new version of your backend application (not nginx itself), the goal is zero-downtime for users. A common pattern with nginx load balancing:

```text
1. Add a new backend instance running the new version to the upstream
   (or replace one at a time — "rolling" deploy).
2. nginx starts routing some traffic to it (round-robin picks it up).
3. Verify the new instance behaves correctly.
4. Repeat for remaining instances, one at a time.
5. At no point are all instances down simultaneously.
```

If a backend instance needs to be taken out of rotation gracefully (for a deploy), mark it down without immediately cutting active connections:

```nginx
upstream api_backends {
    server backend1:3001 down;   # take out of rotation for maintenance
    server backend2:3001;
}
```

Setting `down` on a server removes it from load-balancing decisions immediately (new requests skip it) while not affecting the directive's presence in the config (useful for temporarily disabling without deleting the line). Reload after setting this, deploy/restart that backend, then remove `down` and reload again.

### Configuration Management

In production, don't hand-edit `nginx.conf` on a live server. Use:

- **Version control** (git) for all config files — every change is tracked, diffable, and revertable.
- **Configuration management tools** (Ansible, Chef, Puppet, Terraform) to apply changes consistently across multiple servers.
- **CI/CD validation** — run `nginx -t` in a container matching production before deploying, as an automated gate.
- **Staged rollout** — apply config changes to one server first, verify, then roll out to the rest.

### High Availability Patterns

A single nginx instance is a single point of failure. Production architectures typically add redundancy:

```text
                    DNS / Load Balancer (e.g., cloud LB, keepalived+VRRP)
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
            nginx instance 1          nginx instance 2
            (active)                  (standby or active-active)
                 │                         │
                 └────────────┬────────────┘
                              ▼
                     Backend application servers
```

Common approaches:

- **Active-passive with keepalived:** Two nginx instances share a virtual IP (VRRP). If the active one fails, the standby takes over the IP.
- **Active-active behind a cloud load balancer:** Multiple nginx instances run simultaneously behind an AWS/GCP/Azure load balancer, which health-checks nginx itself and routes around failures.
- **Kubernetes ingress-nginx:** Multiple ingress-nginx pods run behind a Kubernetes Service, and Kubernetes handles pod health and replacement.

The principle in all cases: nginx itself should not be a single point of failure in a system where nginx is protecting against single points of failure downstream.

---

