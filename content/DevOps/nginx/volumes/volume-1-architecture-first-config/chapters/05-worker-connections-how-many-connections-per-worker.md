## worker_connections — How Many Connections Per Worker

```nginx
events {
    worker_connections 1024;
}
```

This sets the maximum number of **simultaneous connections** each worker can hold. With `worker_processes auto` on a 4-core machine and `worker_connections 1024`:

```text
Maximum concurrent connections = 4 workers × 1024 = 4,096
```

Each connection to a backend also counts. If nginx proxies every client request to a backend, each client uses two connections in the worker (one from client to nginx, one from nginx to backend).

So in reverse-proxy mode:

```text
Effective max clients ≈ (workers × worker_connections) / 2
```

The default of 512 or 1024 is fine for most setups. You increase it when you expect high concurrency (tens of thousands of connections). We will tune this properly in Volume 4.

> **Senior insight:** Don't increase `worker_connections` to an arbitrarily large number. Each connection uses a file descriptor, and the OS has file descriptor limits (`ulimit -n`). If `worker_connections` exceeds the file descriptor limit, nginx will log errors and reject connections. We'll cover this in the troubleshooting volume.

---

