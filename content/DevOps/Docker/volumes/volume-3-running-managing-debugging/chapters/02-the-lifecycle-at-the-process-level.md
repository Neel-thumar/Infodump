## The lifecycle, at the process level

### The states

```text
                    docker create
        (image) ─────────────────────► CREATED
                                          │
                                          │ docker start
                                          ▼
        ┌──── docker pause ────────►  RUNNING  ◄──── docker unpause ────┐
        │                                │                              │
        ▼                                │                              │
      PAUSED ───────────────────────────┘                              │
        └───────────────────────────────────────────────────────────────┘
                                          │
                       docker stop        │        docker kill
                  (SIGTERM, wait, SIGKILL)│        (SIGKILL now)
                                          │        or process exits on its own
                                          ▼
                                       EXITED
                                          │
                                          │ docker rm
                                          ▼
                                        (gone)
```

`docker run` is not a primitive. It is `docker create` + `docker start` (+ `docker attach` unless you passed `-d`). Splitting it apart is the clearest way to see where the boundary sits:

```bash
docker create --name lifecycle alpine sleep 300
docker ps -a --filter name=lifecycle
```

**Expect:** status `Created`. Now check whether a process exists:

```bash
docker inspect -f '{{.State.Pid}}' lifecycle
```

**Expect:** `0`. **Nothing is running.** But something has already happened: the writable layer was allocated, the config was resolved, and the container has an ID.

```bash
docker inspect -f '{{.GraphDriver.Data.UpperDir}}' lifecycle
```

That directory exists on your host right now, for a container that has never run. This is the answer to "why does `docker ps -a` show 200 dead containers eating disk" — a container is a persistent object with a filesystem, not a transient event.

```bash
docker start lifecycle
docker inspect -f '{{.State.Pid}}' lifecycle
```

**Expect:** a real host PID. `docker start` is the moment `clone()` happens: namespaces created, cgroup populated, overlay mounted, `pivot_root` performed, and finally `execve()` of your command.

### What each transition actually does

| Command | Signal / mechanism | Process afterwards | Filesystem afterwards |
| --- | --- | --- | --- |
| `create` | none | doesn't exist | writable layer allocated |
| `start` | `clone()` + `execve()` | PID 1 in a new PID namespace | overlay mounted |
| `pause` | **cgroup freezer** — not a signal | exists, unschedulable, unaware | mounted, untouched |
| `unpause` | freezer released | resumes mid-instruction | unchanged |
| `stop` | `SIGTERM`, wait (default 10s), then `SIGKILL` | gone | **writable layer preserved** |
| `kill` | `SIGKILL` immediately (or `-s` yours) | gone | preserved |
| `restart` | stop, then start | new process, new PID | **same writable layer** |
| `rm` | — | — | **writable layer deleted** |

Two rows deserve expansion.

**`pause` is not a signal, and that's the point.** Suspending a process with `SIGSTOP` is observable — the process can be told about it, and a signal handler can interfere. The cgroup freezer operates below that: the kernel simply stops scheduling every task in the cgroup. The process cannot detect it, cannot block it, and cannot run code during it. From its own perspective, no time passed at all.

Watch it directly, using Volume 1's cgroup skills:

```bash
docker run -d --name frozen --rm alpine sh -c 'i=0; while :; do echo $i; i=$((i+1)); sleep 1; done'
sleep 3
docker pause frozen
CID=$(docker inspect -f '{{.Id}}' frozen)
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cgroup.freeze
sleep 5
docker unpause frozen
docker logs frozen | tail -5
docker stop frozen
```

**Expect:** `cgroup.freeze` reads `1` while paused. The counter stops, then resumes from exactly where it was with no gap and no jump. Five seconds of wall-clock time are simply missing from the process's experience. (If the cgroup path doesn't resolve, find it with `find /sys/fs/cgroup -name "*$CID*" -maxdepth 3`.)

**`stop` versus `kill` is where exit codes come from.** You met exit code 137 in Volume 1. Here's the full decoder:

| Exit code | Meaning |
| --- | --- |
| 0 | Clean exit |
| 1–125 | The application's own exit code |
| 125 | The `docker run` command itself failed |
| 126 | The command exists but isn't executable |
| 127 | Command not found in the image |
| **137** | 128 + 9 = `SIGKILL` — OOM killer, or `docker stop` grace period expired |
| **139** | 128 + 11 = `SIGSEGV` |
| **143** | 128 + 15 = `SIGTERM` — a clean shutdown in response to `docker stop` |

The distinction between 143 and 137 is the one to internalize. **143 means your application handled `SIGTERM` and exited.** 137 means it didn't, and Docker had to use force. Volume 2's shell-form-versus-exec-form demo was exactly this difference, and you can now read it off the exit code:

```bash
docker run -d --name sig alpine sleep 300
docker stop sig
docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' sig
docker rm sig
```

**Expect:** `137 false`. `sleep` ignores nothing — it just has no `SIGTERM` handler, so... actually, watch that carefully. BusyBox `sleep` dies on `SIGTERM` in some builds and not others, and this is a nice reminder that "does my PID 1 handle signals" is an empirical question about the specific binary, not a general fact.

`OOMKilled` in that output is worth knowing on its own: it's how you distinguish "the kernel killed it for memory" from "the grace period expired," both of which show 137.

### Three more states you'll meet

- **`Restarting`** — the restart policy is between attempts. Covered below.
- **`Dead`** — a rare state where Docker failed to remove the container (typically a busy mount). Usually needs manual cleanup.
- **`docker ps` lies by default.** It shows running containers only. `docker ps -a` shows everything, and the gap between the two is where forgotten disk usage lives.

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Size}}"
docker rm lifecycle
```

---

