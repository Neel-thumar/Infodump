## Worker Tuning

### `worker_processes`

```nginx
worker_processes auto;
```

We covered this in Volume 1. `auto` sets one worker per CPU core. This is correct for almost every scenario because:

- Each worker is single-threaded and uses one core.
- More workers than cores means context-switching overhead.
- Fewer workers than cores leaves capacity unused.

**When you might change it:** On a machine shared with other CPU-intensive services, you might reduce workers to leave cores for those services. On a machine doing heavy TLS or gzip, `auto` is still usually right because those are exactly the CPU-bound tasks workers do.

### `worker_connections`

```nginx
events {
    worker_connections 1024;
}
```

Each worker can hold this many simultaneous connections. Total maximum connections:

```text
max connections = worker_processes × worker_connections
```

For a reverse proxy, each client request uses **two** connections in the worker: one from client to nginx, one from nginx to backend. So effective max clients:

```text
max simultaneous clients ≈ (worker_processes × worker_connections) / 2
```

On a 4-core machine with `worker_connections 1024`: approximately 2,048 simultaneous clients.

**When to increase:** If you expect high concurrency (thousands of simultaneous connections). A value of 2048 or 4096 handles most production loads. Going higher requires increasing the OS file descriptor limit too.

### File Descriptor Limits

Each connection uses a file descriptor. The OS limits how many file descriptors a process can open (check with `ulimit -n`). If `worker_connections` exceeds the file descriptor limit, nginx logs an error and rejects connections.

```nginx
worker_rlimit_nofile 8192;
```

This tells nginx to set the file descriptor limit for worker processes. A reasonable rule of thumb: set `worker_rlimit_nofile` to at least `2 × worker_connections`.

To check the current system limit:

```bash
ulimit -n
```

To change it system-wide (on systemd-managed systems), create `/etc/security/limits.d/nginx.conf`:

```text
nginx soft nofile 8192
nginx hard nofile 8192
```

Or in the systemd unit file:

```ini
[Service]
LimitNOFILE=8192
```

> **Senior insight:** Running out of file descriptors is a classic "everything was fine until we hit traffic" failure. nginx logs `worker_connections are not enough` or `too many open files`. This is not an nginx problem — it's an OS limit problem. Check `worker_connections` and `worker_rlimit_nofile` together.

---

