## Making cgroups visible

Volume 1's theory, now as things you watch happen.

### Watch an OOM kill and read the evidence

```bash
docker run -d --name hungry -m 100m --memory-swap 100m python:3.12-slim \
  python -c "
import time
data = []
while True:
    data.append(bytearray(10 * 1024 * 1024))
    print(f'allocated {len(data) * 10} MB', flush=True)
    time.sleep(0.5)
"
sleep 8
docker logs hungry | tail -3
docker inspect -f 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' hungry
docker rm hungry
```

**Expect:** logs climbing to roughly 90 MB, then stopping. `exit=137 oom=true`.

**The lesson that matters operationally:** the application did nothing wrong and got no warning. There is no catchable exception, no graceful shutdown, no chance to flush anything. `SIGKILL` cannot be handled. To your monitoring this looks like a spontaneous disappearance — which is why `OOMKilled` is the first field to check when a container vanishes mysteriously.

> **Flagged:** deliberately triggers the OOM killer inside a 100 MB cgroup. Scoped and safe; `dmesg` will record it.

### Watch throttling, and see why it's invisible

```bash
docker run -d --name slow --rm --cpus 0.2 alpine \
  sh -c 'while :; do md5sum /dev/zero; done'
sleep 5
docker stats --no-stream slow
CID=$(docker inspect -f '{{.Id}}' slow)
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.stat
sleep 5
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.stat
docker stop slow
```

**Expect:** ~20% CPU in `docker stats`, and `nr_throttled` / `throttled_usec` climbing between the two reads.

**Why this is the more insidious failure:** an OOM kill is loud. Throttling is silent. Your app is up, healthy, serving — just slowly and in bursts, with latency spikes that correlate with nothing in the application's own metrics. The host looks idle. `nr_throttled` is the only place the truth is written down, and almost nobody looks at it.

### Contain a fork bomb safely

```bash
docker run --rm --pids-limit 50 alpine sh -c \
  'i=0; while [ $i -lt 200 ]; do sleep 60 & i=$((i+1)); done; echo "spawned all"; wait' \
  2>&1 | tail -5
```

**Expect:** `can't fork` errors after roughly 50 processes. The container fails; your machine is fine.

**Why it's interesting:** the `pids` cgroup controller is the cheapest insurance in Docker and almost nobody sets it. Without `--pids-limit`, a runaway fork loop in any container exhausts the host's global PID space and you cannot even log in to fix it. Run the same thing without the flag only if you enjoy hard reboots — which is to say, don't.

---

