## cgroups: the budget

### The problem that existed before containers

Namespaces answer "what can it see." They say nothing about "how much can it take." A process with a perfectly isolated view can still allocate all the memory on the box, spin every core, and saturate the disk queue.

This was a real, expensive problem long before containers, and it has a name: **the noisy neighbour**. Shared hosting providers lived with it for decades. Google had it worst of all — thousands of jobs from hundreds of teams packed onto shared machines, where one team's memory leak taking down a machine full of other teams' work was unacceptable.

The classic pre-cgroups tools were inadequate in instructive ways. `nice` adjusts scheduler priority for a process, not a guaranteed share for a *group*. `ulimit`/`setrlimit` applies per process, so a runaway that forks children escapes its own limit trivially. Neither could say "these 40 processes, collectively, get 2 GB and 1.5 cores, and are accounted for together."

So Google's **Paul Menage** and **Rohit Seth** wrote what they first called "process containers," renamed **cgroups** before merging into Linux 2.6.24 in January 2008.

### The mechanism

A cgroup is a group of processes plus a set of **controllers** (memory, cpu, io, pids, and others) that limit and account for what that group uses. It's exposed as a filesystem. You create a cgroup with `mkdir`. You configure it by writing numbers into files. You put a process in it by writing its PID into a file. That's the whole API, and it's why cgroups are so easy to demonstrate.

Debian bookworm and later default to **cgroup v2** (the "unified hierarchy"), which replaced v1's separate per-controller mount points. Confirm which you have:

```bash
stat -fc %T /sys/fs/cgroup/
```

`cgroup2fs` means v2. `tmpfs` means v1 or hybrid — the commands below are v2 syntax, and I'll assume v2 for the rest of this guide.

```bash
ls /sys/fs/cgroup/
cat /sys/fs/cgroup/cgroup.controllers
```

### Build one by hand and watch it kill something

This is the exercise that makes cgroups stop being abstract. We'll create a cgroup capped at 50 MB and run a Python process that tries to allocate 200 MB.

```bash
# Create a cgroup — yes, just mkdir
sudo mkdir /sys/fs/cgroup/demo

# Give it a 50 MB memory limit and no swap
echo 50M | sudo tee /sys/fs/cgroup/demo/memory.max
echo 0   | sudo tee /sys/fs/cgroup/demo/memory.swap.max

# Start a shell, put it in the cgroup, and watch it die
sudo bash -c 'echo $$ > /sys/fs/cgroup/demo/cgroup.procs; \
  python3 -c "a = bytearray(200 * 1024 * 1024); print(\"allocated\")"'
```

**Expect:** `Killed`. The kernel's OOM killer terminated the process when the cgroup hit its limit. Nothing else on your machine was affected — that's the point. Compare with the same allocation outside the cgroup, which will just succeed.

Look at the accounting and the evidence:

```bash
cat /sys/fs/cgroup/demo/memory.peak 2>/dev/null
cat /sys/fs/cgroup/demo/memory.events
sudo dmesg | tail -20 | grep -i -A3 "memory cgroup"
```

`memory.events` has an `oom_kill` counter. `dmesg` shows the kernel's OOM report naming the cgroup.

**Cleanup** (a cgroup must be empty of processes to remove):

```bash
sudo rmdir /sys/fs/cgroup/demo
```

> **Flagged:** this exercise deliberately triggers the OOM killer. It is scoped to the cgroup and safe, but `dmesg` will have an OOM report in it afterwards, and if you raise the limit high enough to matter you can make your machine unhappy. Don't change `50M` to `50G`.

### The controllers you'll actually meet

| Controller | Key v2 files | What it does | Docker flag |
| --- | --- | --- | --- |
| `memory` | `memory.max`, `memory.high`, `memory.swap.max`, `memory.current` | Hard cap (OOM kill) and soft cap (throttle by reclaim) | `-m`, `--memory-swap` |
| `cpu` | `cpu.max`, `cpu.weight` | Bandwidth quota per period; relative weight under contention | `--cpus`, `--cpu-shares` |
| `io` | `io.max`, `io.weight` | Throttle read/write bytes and IOPS per device | `--device-read-bps` etc. |
| `pids` | `pids.max` | Cap the number of processes — the fork-bomb defence | `--pids-limit` |

Two distinctions worth carrying:

- **`memory.max` vs `memory.high`.** `max` is a wall: exceed it and something gets OOM-killed. `high` is a speed bump: the kernel aggressively reclaims and throttles the group but doesn't kill it. Docker's `-m` maps to `max`, which is why the failure mode is sudden death rather than degradation.
- **`cpu.max` vs `cpu.weight`.** A quota (`--cpus 0.5`: half a core, always, even on an idle machine) versus a share (`--cpu-shares`: relative priority that only matters *under contention*). People set `--cpu-shares` and wonder why nothing is limited on an idle box. Nothing is wrong; that's what a share means.

### Now see that Docker is doing exactly this

```bash
docker run -d --name capped -m 64m --cpus 0.5 --rm alpine sleep 300
docker inspect -f '{{.Id}}' capped
```

On a systemd Debian host the cgroup path is typically:

```bash
CID=$(docker inspect -f '{{.Id}}' capped)
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.max
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max
```

**Expect:** `67108864` (64 MiB in bytes) and something like `50000 100000` (50 ms of CPU per 100 ms period = half a core).

> If those paths don't exist, find the real one with `find /sys/fs/cgroup -name "*$CID*" -maxdepth 3` — the layout varies with cgroup driver and Docker version.

**The reveal:** `-m 64m` is not a Docker feature. It is Docker writing `67108864` into a file that you can write to yourself. Cleanup: `docker stop capped`.

Watch one get killed, from Docker's side:

```bash
docker run --rm -m 64m --memory-swap 64m python:3.12-alpine \
  python -c "a = bytearray(200*1024*1024); print('allocated')"
echo "exit code: $?"
```

**Expect:** `Killed`, and exit code **137**. That's 128 + 9, where 9 is `SIGKILL` — the universal signature of an OOM-killed container, and now you know exactly which kernel subsystem produced it. (Image is ~50 MB; remove with `docker rmi python:3.12-alpine` when done.)

---

