## How nginx Runs — Master and Worker Processes

When you start nginx, it doesn't just create one process. It creates two kinds of processes with completely different jobs.

### The Master Process

The master process is the boss. It does not handle any client connections. Its jobs are:

- Read and validate the configuration file.
- Create and manage worker processes.
- Handle signals (reload, stop, quit).
- Open log files and listening sockets.

There is always exactly **one** master process. It runs as root (it needs root to bind to port 80/443 and to open log files), but the workers it spawns run as a less-privileged user (typically `www-data` or `nginx`).

### Worker Processes

Worker processes do the real work. Every incoming connection is handled by a worker. Each worker is an independent process — if one crashes, the others keep running, and the master restarts the failed one.

You can see this on a running nginx:

```bash
ps aux | grep nginx
```

```text
root      1234  ...  nginx: master process /usr/sbin/nginx
www-data  1235  ...  nginx: worker process
www-data  1236  ...  nginx: worker process
```

Back to our analogy: the master process is the **desk manager** — they read the rulebook (config), hire the receptionists (spawn workers), and handle administrative tasks (reload, shutdown). The worker processes are the **receptionists** who actually talk to visitors (handle connections).

### How Many Workers?

The directive `worker_processes` controls how many workers are created.

```nginx
worker_processes auto;
```

`auto` tells nginx to create one worker per CPU core. On a 4-core machine, you get 4 workers. This is almost always the right setting because:

- Each worker is single-threaded and uses one core efficiently.
- More workers than cores means they compete for CPU time with no benefit.
- Fewer workers than cores means you leave CPU capacity unused.

You can set a specific number (`worker_processes 2;`) but `auto` is the standard production choice.

---

