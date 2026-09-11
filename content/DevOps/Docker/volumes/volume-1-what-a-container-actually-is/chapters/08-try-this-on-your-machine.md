## TRY THIS ON YOUR MACHINE

The core teaching above is already hands-on, so these five go somewhere it didn't — each one makes a mechanism visible in a way that's mildly startling the first time.

> All exercises assume Debian with Docker installed (Volume 0, exercise 0.1) and cgroup v2. Nothing here is destructive; disk usage and cleanup are flagged per item.

### 1.1 — Prove the container shares your kernel

```bash
uname -r
docker run --rm alpine uname -r
docker run --rm ubuntu:24.04 uname -r
docker run --rm debian:bookworm-slim uname -r
```

**Expect:** all four print **the same string** — your host's kernel version. Alpine, Ubuntu, and Debian all report a kernel none of them shipped.

**Why it's interesting:** this is the single fastest demonstration that "Guest OS" in the standard diagram is wrong. You are not running Ubuntu. You are running *Ubuntu's userspace files* on *your* kernel. It's also the reason a container needing a kernel module, or a specific kernel version, simply cannot get one. **Disk:** ~150 MB. **Cleanup:** `docker rmi ubuntu:24.04 debian:bookworm-slim`

### 1.2 — Watch one process have two different PIDs at once

```bash
docker run -d --name two-pids --rm alpine sleep 300
docker exec two-pids ps aux            # PID inside
PID=$(docker inspect -f '{{.State.Pid}}' two-pids)
echo "PID on host: $PID"
sudo grep NSpid /proc/$PID/status
```

**Expect:** `ps` inside shows `sleep` as PID 1. On the host it's some four- or five-digit number. `NSpid` prints **both**, in nesting order: host PID first, then namespace PID.

**Why it's interesting:** a PID is not a property of a process. It's a property of a process *as seen from a namespace*. `NSpid` is the kernel admitting it keeps several answers for the same question. **Cleanup:** `docker stop two-pids`

### 1.3 — Build a container by hand, with no Docker

Combine three namespaces, a root filesystem, and `pivot_root`-adjacent isolation using only `util-linux` and BusyBox.

```bash
mkdir -p ~/manual-container/bin
sudo apt install -y busybox-static
cp /bin/busybox ~/manual-container/bin/
cd ~/manual-container
for c in sh ls ps mount hostname cat id; do ln -sf /bin/busybox bin/$c; done
mkdir -p proc

sudo unshare --pid --fork --mount --uts --ipc --net \
  chroot ~/manual-container /bin/sh
```

Inside, run:

```bash
mount -t proc proc /proc
hostname my-hand-made-container
hostname
ps aux
ls /
```

**Expect:** a shell in its own PID namespace (your `sh` is PID 1), its own hostname, its own network stack, and a two-directory filesystem. You built a container with one command and no runtime. Exit with `exit`.

**Why it's interesting:** it collapses the distance between "Docker" and "a handful of kernel features" completely. Compare it to Volume 0's chroot-only version — that one leaked the process table and hostname; this one doesn't. The gaps you're closing are exactly the thirty-four years of kernel history in the table above. What's still missing versus a real container: cgroup limits, an overlay root, a veth pair, capability drops, and seccomp — which is a decent outline of Volumes 3, 5, and 7.

**Disk:** ~2 MB. **Cleanup:** `rm -rf ~/manual-container`

### 1.4 — Watch CPU throttling happen in real time

```bash
docker run --rm alpine sh -c 'time dd if=/dev/zero bs=1M count=2000 | md5sum'
docker run --rm --cpus 0.25 alpine sh -c 'time dd if=/dev/zero bs=1M count=2000 | md5sum'
```

**Expect:** the second run takes roughly four times as long. The process isn't refused anything — it's descheduled once it exhausts its quota in each 100 ms period.

Run it again in the background and watch the accounting live:

```bash
docker run -d --name throttled --rm --cpus 0.25 alpine \
  sh -c 'while :; do md5sum /dev/zero; done'
docker stats --no-stream throttled
CID=$(docker inspect -f '{{.Id}}' throttled)
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.stat
docker stop throttled
```

**Expect:** `docker stats` reports roughly 25% CPU. `cpu.stat` has `nr_throttled` and `throttled_usec` counters climbing — the kernel counting how many times it parked the process.

**Why it's interesting:** those two counters are the diagnostic for one of the most common production mysteries in containerized systems — an application with plenty of idle CPU on the host that is nonetheless slow, because its quota is too low and it's being throttled in bursts. Latency graphs look like a sawtooth and nothing in the app's own metrics explains it. **Cleanup:** included above; `--rm` handles the container. **Note:** this pegs a quarter of a core while running — stop it promptly.

### 1.5 — Find where the whiteout lives in a real image

Prove that `rm` in a Dockerfile doesn't delete anything.

```bash
mkdir -p ~/whiteout-demo && cd ~/whiteout-demo
cat > Dockerfile <<'EOF'
FROM alpine
RUN echo "SUPER SECRET API KEY" > /secret.txt
RUN rm /secret.txt
EOF

docker build -t whiteout-test .
docker run --rm whiteout-test ls /secret.txt      # not found — looks deleted
docker save whiteout-test -o image.tar
mkdir extracted && tar -xf image.tar -C extracted
grep -rl "SUPER SECRET" extracted/ 2>/dev/null
```

**Expect:** the container says the file doesn't exist. The `grep` across the saved image's layer tarballs **finds it anyway**.

**Why it's interesting:** this is the OverlayFS whiteout you created by hand earlier, showing up in a real image, with a real consequence. Anyone who can pull this image can read that string. It is the single most common way credentials leak out of container images, and there is no way to fix it by adding more `RUN rm` lines — Volume 2 explains what actually works.

**Disk:** ~20 MB. **Cleanup:**

```bash
cd ~ && rm -rf ~/whiteout-demo
docker rmi whiteout-test
```

---

