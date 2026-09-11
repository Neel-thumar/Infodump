## Debugging: seeing what the container sees

### `docker logs` — and its two honest limitations

```bash
cd ~/docker-app
docker build -q -t myapp:v2 .
docker run -d --name myapp --rm -p 8000:8000 -e GREETING="debugging" myapp:v2
curl -s localhost:8000
docker logs myapp
docker logs -f --tail 20 --timestamps myapp    # Ctrl-C to stop following
```

`docker logs` shows **stdout and stderr of PID 1, and nothing else.** Two consequences that cause a great deal of confusion:

1. **If your app writes to a log file inside the container, `docker logs` shows nothing.** The container convention is: log to stdout, let the platform handle routing. Apps ported from VMs usually don't, and this is the fix.
2. **Buffering hides output.** Volume 2's `PYTHONUNBUFFERED=1` exists for this; equivalents exist per language. If logs appear only when a container stops, or vanish when it's killed, you're looking at a buffer, not at Docker.

And a third point that becomes this volume's incident: those logs are **written to a file on your host, which by default has no size limit**:

```bash
CID=$(docker inspect -f '{{.Id}}' myapp)
sudo ls -lh /var/lib/docker/containers/$CID/$CID-json.log
docker info | grep -i "logging driver"
```

### `docker exec` — a second process, not a second container

```bash
docker exec myapp ps aux
docker exec -it myapp bash
```

`docker exec` starts a **new process** in the existing container's namespaces and cgroup. It is not a shell "into" anything — it's `setns()` plus `execve()`, which is precisely what you did by hand with `nsenter` in Volume 1.

Two facts that follow:

- **Processes started by `exec` count against the container's limits.** Running a memory-hungry debug tool inside a 256 MB container can OOM the whole thing, including your application.
- **If the image has no shell, `exec` has nothing to run.** This is the distroless trade-off from Volume 2. The answer is a debug sidecar sharing the target's namespaces:

```bash
docker run --rm -it --pid=container:myapp --network=container:myapp \
  --cap-add SYS_PTRACE alpine sh
```

Inside that shell, `ps aux` shows the *target's* processes and `netstat -tlnp` shows its listening sockets — because you joined its PID and network namespaces. The container being debugged needs no tooling at all. This technique is worth more than any single Docker command.

### `docker inspect` — the whole truth, as JSON

```bash
docker inspect myapp | python3 -m json.tool | head -40
docker inspect -f '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}' myapp
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' myapp
docker inspect -f '{{json .HostConfig.Memory}}' myapp
```

`--format` uses Go templates and is what makes `inspect` usable in scripts. The four fields above — status, exit code, `OOMKilled`, `RestartCount` — are the fastest triage in Docker. `RestartCount` climbing on a container that should be stable is the signal that something is crash-looping behind a restart policy.

### The rest of the kit

```bash
docker stats --no-stream                 # live CPU/memory/net/IO per container
docker top myapp                         # container processes with HOST PIDs
docker diff myapp                        # every file changed since start
docker events --since 5m                 # daemon-level event stream
docker cp myapp:/app/app.py /tmp/         # pull a file out without a shell
```

`docker diff` is underused and deserves a look — it reads the overlay upper directory and reports `A` (added), `C` (changed), `D` (deleted). You are reading copy-on-write output directly:

```bash
docker exec myapp sh -c 'echo test > /tmp/newfile'
docker diff myapp | head
```

And `docker events` is how you find out *why* something disappeared:

```bash
docker events --since 10m --filter 'event=die' --filter 'event=oom'
```

Cleanup: `docker stop myapp`

---

