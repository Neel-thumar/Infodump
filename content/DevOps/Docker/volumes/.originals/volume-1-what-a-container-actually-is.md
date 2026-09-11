---
id: container-not-a-vm
title: Volume 1 — What a Container Actually Is (Not a VM)
order: 1
description: Namespaces, cgroups, and OverlayFS derived from first principles — why a container is an ordinary Linux process with a restricted view, and where that illusion breaks.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 1 — What a Container Actually Is (Not a VM)

---

## The question this volume answers

In Volume 0 you ran `sleep 300` inside a container and then found it in your host's process table, as an ordinary process with an ordinary PID. Nothing was emulated. Nothing booted.

So here is the question. If it's just a process, why does it *feel* like a machine? Log into a container and you get a hostname, a root filesystem, a process table starting at PID 1, an `eth0` with its own IP, and a `root` account. That is a convincing machine. And yet there is no machine.

The answer is that the Linux kernel will lie to a process on request. Not vaguely — specifically, per resource, per lie, each one a separate kernel feature with its own name and its own history. A container is a process for which the kernel has been asked to tell **seven or eight specific lies at once**, plus a hard budget on what it's allowed to consume, plus a clever filesystem trick so the whole thing costs nearly nothing to set up.

That's the volume. Lies (namespaces), budget (cgroups), filesystem trick (OverlayFS). Then an honest comparison with virtual machines, and a real CVE where the lies were told correctly and the escape happened anyway.

---

## First, kill the VM metaphor

You have seen the diagram. Two stacks side by side: VMs have a fat "Guest OS" box per app, containers have a thin "Docker" box. The implied message is that a container is a VM that went on a diet.

This is not a simplification. It is the wrong category.

| | Virtual machine | Container |
| --- | --- | --- |
| What's virtualized | **Hardware** — CPU, memory, disks, NICs | **Kernel interfaces** — what a process can see and use |
| Kernel | Its own, booted from its own disk image | The host's. There is no second kernel |
| What starts it | A hypervisor emulating a machine and firmware | `clone()` / `execve()` — a process is forked |
| Boot | Real boot: firmware, bootloader, init, services | None. There is nothing to boot |
| Visible on host | One big process (e.g. `qemu`), the guest's processes hidden inside it | **Every container process, individually, in `ps`** |
| Isolation enforced by | Hardware virtualization (Intel VT-x / AMD-V) + hypervisor | Kernel code paths that filter what a process sees |
| Cost to start | Seconds to minutes | Milliseconds |
| Cost to store | Gigabytes (full OS + kernel) | Megabytes (just the userspace files you need, shared) |

Say this out loud once, because it's the sentence the rest of the volume unpacks:

> **A container is a normal Linux process that has been given a restricted and rearranged view of the system, and a budget.**

That's it. There is no container object in the kernel. Search the Linux source for a `struct container` and you won't find one. "Container" is a *userspace word* for a particular combination of kernel features. This is not pedantry — it's the thing that explains every container behaviour that surprises people, including the security ones.

---

## Namespaces: the kernel lying on purpose

### The generative question

Take a plain process. What does it currently share with every other process on the machine that would betray the illusion of being alone on its own machine?

Work down the list yourself before reading on. It sees: every other process (`ps`), the same filesystem tree, the same hostname, the same network interfaces and ports, the same shared-memory segments, the same user database and UID meanings. Six leaks. Each one got its own namespace, added to Linux at a different time by different people solving different problems.

That incremental history is why there are separate namespace types instead of one "isolate me" switch. Nobody sat down and designed containers. People fixed leaks one at a time over twelve years, and then Docker noticed you could close all of them at once.

| Namespace | Isolates | Landed in kernel | Confidence |
| --- | --- | --- | --- |
| `mnt` (mount) | Mount points / filesystem tree | 2.4.19 (2002) — the first, hence the generic flag `CLONE_NEWNS` | High |
| `uts` | Hostname and NIS domain name | 2.6.19 (Dec 2006) | High |
| `ipc` | System V IPC, POSIX message queues | 2.6.19 (Dec 2006) | High |
| `pid` | Process ID number space | 2.6.24 (Jan 2008) | High |
| `net` | Network devices, stacks, ports, routes, firewall rules | Began 2.6.24; commonly described as complete in 2.6.29 | **Medium** — sources genuinely disagree on which release to cite |
| `user` | UID/GID mappings and capabilities | Work started ~2.6.23; usable form in 3.8 (2013) | Medium-high |
| `cgroup` | View of the cgroup hierarchy | 4.6 (2016) | Medium-high |
| `time` | `CLOCK_MONOTONIC` / `CLOCK_BOOTTIME` offsets | 5.6 (2020) | Medium-high |

Note the dates against Volume 0's timeline. The PID namespace and cgroups both landed in **2.6.24, January 2008**. Docker appeared in **March 2013** — five years later, and coincidentally weeks after user namespaces became usable in 3.8.

Three system calls create and join namespaces: `clone()` (make a new process in new namespaces), `unshare()` (move the *calling* process into new namespaces), and `setns()` (join an existing namespace). The `unshare` and `nsenter` command-line tools, from `util-linux`, are thin wrappers over these — and they are already on your Debian box. You do not need Docker to make a namespace. You need one command.

### Where the kernel exposes them

```bash
ls -l /proc/self/ns/
```

Every entry is a magic symlink whose target contains an **inode number**, like `pid:[4026531836]`. That number *is* the namespace's identity. Two processes are in the same namespace exactly when these numbers match. This single fact makes everything in this volume directly observable: to ask "is this container really isolated from that one," you compare integers.

```bash
lsns
```

`lsns` lists every namespace on the system with how many processes are in it. On a fresh boot you'll see one of each, containing everything — those are the "initial" or root namespaces. Start a container and watch new rows appear.

### UTS: the easiest lie

**Problem:** two workloads on one host both want to be called `db-primary`. `hostname` is a single global kernel value; changing it changes it for everyone.

**Mechanism:** the UTS namespace gives each namespace its own copy of `struct new_utsname`. `sethostname()` writes only into your copy.

```bash
sudo unshare --uts bash
hostname totally-different-box
hostname
exit
hostname
```

Inside: your new name. Outside, immediately after `exit`: unchanged. You just used the same kernel feature Docker uses for `docker run --hostname`.

> Why UTS? It stands for **UNIX Time-sharing System**, the name of the struct the hostname lives in. The namespace is named after the data structure, not the concept — an artifact of kernel history, and a good example of why you can't reason about this stuff from the names alone.

### PID: the lie that makes a container feel like a machine

**Problem:** a process can `ps` and see every other process on the host, and can signal any of them it has permission to. On a shared machine, tenant A reading tenant B's command lines (which often contain arguments, paths, sometimes credentials) is an information leak; killing B's processes is worse.

**Mechanism:** the PID namespace gives a *number space*, not just a filter. A process has a different PID in each namespace it is nested inside. The first process in a new PID namespace becomes **PID 1**, and inherits PID 1's special kernel semantics: it reaps orphans, and — crucially — **signals with default actions don't kill it**. If PID 1 dies, the kernel tears down the whole namespace and kills everything in it.

```bash
sudo unshare --pid --fork --mount-proc bash
ps aux
echo $$
exit
```

**Expect:** `ps aux` shows two or three processes, with your bash as PID 1. The host's several hundred processes are simply not in the number space.

Two details in that command matter enormously:

- **`--fork`** — `unshare()` does not move the calling process into a new PID namespace, because a process can't have its PID changed mid-life. The new namespace applies to *children*. Without `--fork` you get an unhelpful surprise.
- **`--mount-proc`** — `ps` reads `/proc`, and `/proc` is a filesystem showing *the PID namespace that mounted it*. Without remounting `/proc`, you'd be in a new PID namespace but still reading the host's `/proc`, and `ps` would show you the host's processes with wrong numbers.

That second point is the first real lesson in namespace interaction: **the PID namespace is useless without the mount namespace.** Isolation is not a checklist, it's a composition, and the seams between namespaces are exactly where bugs and escapes live. Hold that thought until the CVE section.

This is also, concretely, why **PID 1 in a container is a real operational problem**. Your application is PID 1. Does your app reap zombie children? Does it handle `SIGTERM`? Most don't — they were written assuming systemd was above them. So `docker stop` sends `SIGTERM`, PID 1 ignores it because default actions don't apply to PID 1, Docker waits ten seconds, then `SIGKILL`s. Every deploy becomes a hard kill with no graceful shutdown. Volume 3 covers `--init` and `tini`; the reason lives here.

### Mount: giving the process a different filesystem

**Problem:** chroot (Volume 0, exercise 0.5) changes the root *path* but the mount table is global — a chrooted process can still see and be affected by every mount on the system, and root can escape a chroot.

**Mechanism:** the mount namespace gives each namespace its own copy of the mount tree. Mounting or unmounting inside affects only that copy.

```bash
sudo unshare --mount bash
mkdir -p /tmp/ns-demo
mount -t tmpfs none /tmp/ns-demo
echo "only visible in here" > /tmp/ns-demo/secret.txt
ls /tmp/ns-demo
findmnt /tmp/ns-demo
exit
ls /tmp/ns-demo
```

**Expect:** the file exists inside, and `/tmp/ns-demo` is empty after you exit — the tmpfs mount vanished with the namespace, taking the file with it. (Clean up the empty directory with `sudo rmdir /tmp/ns-demo`.)

There's a subtlety worth knowing: the copy is not fully independent by default. Mount points have **propagation types** (`shared`, `private`, `slave`, `unbindable`) that determine whether mount events cross namespace boundaries. `systemd` sets `/` to `shared` on boot, which is why container runtimes explicitly remount things as private. This is also why volume mounts sometimes behave surprisingly on Docker Desktop and in nested setups. Volume 4 returns to it.

Note also what Docker *doesn't* use: `chroot`. It uses **`pivot_root`**, which swaps the root mount and detaches the old one entirely, so the old root isn't merely out of reach but no longer in the mount table at all. That distinction closes several classic chroot escapes.

### Network: its own everything

**Problem:** two containers both want to bind port 80.

**Mechanism:** the network namespace is the most complete isolation of the set. A new network namespace gets its own network devices, IP addresses, routing tables, ARP tables, port number space, **and its own `iptables`/`nftables` rules**. It starts nearly empty: a loopback interface, down.

```bash
sudo unshare --net bash
ip addr
ip route
exit
```

**Expect:** exactly one interface, `lo`, in state DOWN. No default route. This process cannot reach anything, including localhost, until you bring `lo` up.

Which raises the obvious question: if a new network namespace is an island, how does a container talk to the internet? The answer is a **veth pair** — a virtual Ethernet cable with one end in the container's namespace and one end plugged into a bridge on the host — plus NAT rules Docker writes into your host's firewall. Volume 5 traces a packet through all of it and has you read those rules.

### IPC: the one you'll rarely think about

**Problem:** System V shared memory segments, semaphores, and message queues live in a global namespace keyed by integers. Two independent apps that both use key `0x1234` collide, and either can read the other's shared memory.

**Mechanism:** the IPC namespace gives each its own set of those objects.

```bash
ipcs
sudo unshare --ipc bash
ipcs
exit
```

**Expect:** likely-populated tables on the host, empty ones inside. This namespace matters mostly for older enterprise software (databases, some Java middleware) — but that's precisely the software people containerize, and it's the reason `docker run --ipc=host` exists as an escape hatch.

### User: the one that actually changes the security model

**Problem:** every namespace so far restricts what a process can *see*. None of them change what it *is*. A process running as UID 0 inside all six namespaces above is still UID 0 to the kernel — genuinely root, with real capabilities over the host, just with a limited view. That is a huge amount of trust to place in the correctness of every isolation code path.

**Mechanism:** the user namespace maps UIDs and GIDs between the namespace and the host, and gives the first process **full capabilities inside the namespace only**. UID 0 inside can map to unprivileged UID 1000 outside.

```bash
unshare --user --map-root-user bash
id
cat /proc/self/uid_map
touch /etc/i-am-root-now
exit
```

**Expect:** `id` reports `uid=0(root)`. `/proc/self/uid_map` shows something like `0 1000 1`, meaning "UID 0 in here is UID 1000 out there, for a range of 1". And `touch /etc/...` fails with permission denied, because to the *filesystem* you are still UID 1000.

Note what you didn't type: `sudo`. This is the only namespace in this volume an unprivileged user can create — which is the entire basis of rootless containers (Podman, and Docker's rootless mode), covered in Volume 8.

And here is the uncomfortable fact that connects directly to the CVE below: **Docker does not enable user namespaces by default.** Root in your container is root on your host, modulo capability drops and seccomp. Docker supports it (`userns-remap` in the daemon config), it breaks some workflows, and most installations never turn it on. Volume 7 is largely about the consequences.

### Putting it together: look inside a real container

```bash
docker run -d --name inspect-me --rm alpine sleep 600
PID=$(docker inspect -f '{{.State.Pid}}' inspect-me)
echo "Host PID of the container's process: $PID"

sudo ls -l /proc/$PID/ns/
ls -l /proc/self/ns/
```

Compare the two listings inode by inode. The ones that differ are precisely what Docker isolated. On a default install you will typically see `mnt`, `uts`, `ipc`, `pid`, `net`, and `cgroup` differing — and **`user` identical to yours**, which is the "no user namespace by default" point made concrete.

Now enter those namespaces without Docker's help:

```bash
sudo nsenter -t $PID -m -u -i -n -p sh
hostname
ps aux
ip addr
cat /etc/os-release
exit
```

**Expect:** you are "inside the container" — Alpine's filesystem, the container's hostname, a two-process table, the container's `eth0`. You did it with a `util-linux` command, not a Docker command, on a namespace set the kernel exposes through `/proc`. `docker exec` is a nicer front end for approximately this.

Cleanup:

```bash
docker stop inspect-me
```

---

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

## OverlayFS: why this costs nothing

### The problem

You now have isolation and limits. But each container needs a root filesystem — a `/usr`, `/lib`, `/etc`, the whole userland. Naively, running ten Debian containers means ten copies of Debian on disk: several gigabytes, and a multi-second copy before each container can start. That price would have killed containers as a developer tool. Milliseconds are the whole value proposition.

Three observations rescue it:

1. Those ten containers' filesystems are **almost entirely identical**.
2. Most of those files will be **read and never written**.
3. The files a container *does* write are usually few and small.

So: store the common part once, read-only, shared; give each container a thin private writable layer on top; and only copy a file when someone actually writes to it. That last clause is **copy-on-write**, and the filesystem that implements it here is **OverlayFS**, in the mainline kernel since 3.18 (2014). Docker's default storage driver, `overlay2`, is a thin wrapper over it.

> Historical note, **medium confidence on details**: early Docker used **AUFS**, which was never accepted into mainline Linux, so Docker on non-Ubuntu distros needed out-of-tree patches or fell back to worse drivers like `devicemapper`. Getting OverlayFS upstream, and then `overlay2` as the default, removed a real adoption barrier. If you ever meet a horror story about `devicemapper` in loopback mode, this is that era.

### The mechanism, built by hand

OverlayFS takes some read-only **lower** directories, one writable **upper** directory, a **work** directory for atomic operations, and presents a **merged** view.

```bash
mkdir -p ~/overlay-demo/{lower1,lower2,upper,work,merged}
cd ~/overlay-demo

echo "from lower1" > lower1/a.txt
echo "from lower1" > lower1/shared.txt
echo "from lower2 — I win" > lower2/shared.txt
echo "from lower2" > lower2/b.txt

sudo mount -t overlay overlay \
  -o lowerdir=lower2:lower1,upperdir=upper,workdir=work \
  merged

ls merged/
cat merged/shared.txt
```

**Expect:** `merged/` contains `a.txt`, `b.txt`, and `shared.txt`, and `shared.txt` reads "from lower2 — I win." **Leftmost lowerdir wins.** That is precisely how Dockerfile layers work: a later instruction's version of a file shadows an earlier one's, and both copies still exist on disk.

Now watch copy-on-write actually happen:

```bash
ls upper/          # empty — nothing written yet
echo "modified!" >> merged/a.txt
ls upper/          # a.txt has appeared
cat upper/a.txt    # the full file, not a diff
cat lower1/a.txt   # untouched original
```

**This is the single most important observation in the volume.** The moment you appended one word, the kernel copied the *entire file* from the lower layer into the upper layer and modified the copy. The lower layer is pristine. Every other container sharing that lower layer is unaffected.

Consequences that follow directly, and that explain a lot of Docker behaviour you'll meet later:

- **Starting a container is nearly free** because nothing is copied. You create an empty upper dir and a mount.
- **Writing a 2 GB file you only wanted to append to costs 2 GB and the time to copy it.** Write-heavy workloads on the container filesystem are slow for a structural reason. This is one of the main arguments for volumes in Volume 4.
- **Deleting a file from a lower layer doesn't reclaim space.** OverlayFS records the deletion as a **whiteout** — a character device with major:minor 0:0 in the upper layer. The file is still down there.

See the whiteout:

```bash
rm merged/b.txt
ls merged/         # gone
ls -la upper/      # b.txt present as a 'c' (character device) entry
ls lower2/         # still there, untouched
```

**This is why `RUN rm -rf /secret-file` in a Dockerfile does not remove the secret from your image.** It adds a whiteout in a new layer. The file remains in the earlier layer, fully readable by anyone who pulls the image and unpacks the layers. It's not a bug; you're looking at the mechanism that makes it inevitable. Volume 2 covers doing it properly, and Volume 7 covers the class of credential leaks this has caused.

**Cleanup:**

```bash
cd ~
sudo umount ~/overlay-demo/merged
rm -rf ~/overlay-demo
```

### Where Docker keeps yours

```bash
sudo ls /var/lib/docker/overlay2/ | head
sudo du -sh /var/lib/docker/overlay2/
docker system df
```

And for a specific running container:

```bash
docker run -d --name ovl --rm alpine sleep 300
docker inspect -f '{{json .GraphDriver.Data}}' ovl | tr ',' '\n'
```

**Expect:** the JSON names `LowerDir` (a colon-separated chain of the image's layers), `UpperDir` (the container's writable layer), `WorkDir`, and `MergedDir`. Those are exactly the four arguments you passed to `mount -t overlay` by hand two minutes ago. Write a file inside the container and then find it on your host:

```bash
docker exec ovl sh -c 'echo "hello from inside" > /tmp/proof.txt'
UPPER=$(docker inspect -f '{{.GraphDriver.Data.UpperDir}}' ovl)
sudo cat $UPPER/tmp/proof.txt
docker stop ovl
```

Your host just read a file "inside" the container with plain `cat`, because there is no inside. There is a directory.

---

## When you should still use a VM

I've spent this volume deflating the VM comparison. Now the honest other half, because "containers everywhere" is a genuinely bad default in specific cases.

The trade is simple: **VMs isolate at the hardware boundary, containers isolate at the syscall boundary.** The Linux syscall interface is roughly 350 calls plus an enormous surface of `ioctl`s, `/proc`, `/sys`, and filesystem semantics, all implemented in millions of lines of privileged C. A hypervisor's interface to a guest is far narrower. A narrower interface has fewer bugs. That's the entire security argument, and it's a good one.

Choose a VM when:

- **You need a different kernel or OS.** Windows workloads. A specific kernel version. Anything needing custom kernel modules. There is no second kernel in a container — `uname -r` inside a container returns your *host's* kernel, always.
- **You're running genuinely untrusted code from strangers.** Multi-tenant CI, a sandbox that runs user-submitted programs, malware analysis. This is why cloud providers do not put two customers' workloads in containers on the same kernel. It's also why *hybrid* runtimes exist: **gVisor** (a userspace kernel intercepting syscalls) and **Kata Containers** (a real micro-VM per container, presenting the container API). If you ever need "container UX, VM boundary," those are the names.
- **Compliance requires a hardware boundary.** Some regimes just say so.
- **A kernel-level exploit is in your threat model** and you can't patch fast. A kernel bug on your host is a bug available to every container on it. See below.

Choose containers for essentially everything else: your own applications, your team's services, development environments, CI jobs running your own code, anything where density and startup time matter.

The honest summary: **containers are an excellent isolation mechanism against accident and a decent one against attack, but they are not a security boundary of the same class as a VM.** Anyone who tells you otherwise is selling something. Volume 7 makes this precise.

---

## The incident: CVE-2019-5736

Now the promised proof that the model has seams.

**What it was.** On **11 February 2019**, the runc maintainers disclosed a vulnerability allowing a malicious container to **overwrite the host's `runc` binary** and thereby get root code execution on the host. It was found by **Adam Iwaniuk** and **Borys Popławski**; Aleksa Sarai, a runc maintainer, found that LXC was vulnerable to a more convoluted version of the same flaw. It affected **runc through 1.0-rc6, as used in Docker before 18.09.2** — and because runc is the default runtime under Docker, containerd, Podman, and CRI-O, essentially the entire container ecosystem at once. The upstream CVSSv3 vector was `AV:L/AC:H/PR:L/UI:R/S:C/C:N/I:H/A:H`, **score 7.2**. Exploit code was deliberately held until 18 February to give people a week to patch.

> **Confidence: high.** Corroborated by the CVE record, the oss-security disclosure post by Aleksa Sarai, Red Hat's advisory, and Palo Alto Unit 42's write-up. Note that Red Hat scored it differently from upstream (vendor scores commonly diverge); I'm quoting upstream's 7.2.

**How it worked.** `/proc/self/exe` is a magic symlink the kernel maintains for every process, pointing at the binary that process is executing. When `runc` runs — say, to `docker exec` into a container — it is executing the host's `runc` binary, so *its* `/proc/self/exe` points at that host binary.

The attack, in outline:

1. Get root inside a container — either by controlling the image, or by having write access to a container someone will later `docker exec` into.
2. Replace a binary the victim will execute (say `/bin/bash`) with a two-line script whose interpreter line is `#!/proc/self/exe`.
3. When `runc` sets up the exec and the kernel runs that script, the interpreter it resolves is `/proc/self/exe` **in the context of the runc process** — which resolves to the host's runc binary.
4. The attacker's process, running inside the container, opens `/proc/[runc-pid]/exe` **for writing** and overwrites the host binary with its own payload.
5. The next time anyone on the host starts or attaches to any container, the host runs the attacker's code as root.

**Why this is the perfect closing story for this volume.** Every namespace was working correctly. The PID namespace isolated PIDs. The mount namespace isolated mounts. Nothing "leaked" in the sense people usually mean. The escape came through a **file descriptor that pointed at a host object**, handed across the boundary by the runtime's own machinery — an object that, from inside the container, was reachable by path.

This is the composition problem the `--mount-proc` detail foreshadowed. Isolation isn't a property of any one namespace. It's a property of the *entire* set plus every file descriptor, every mount, and every `/proc` entry that crosses between them. The boundary is only as good as its least-examined seam. And note the kernel here was not exploited at all — this was a userspace runtime bug, which is a reminder that "container escape" has more than one flavour.

**What fixed it, and what already prevented it.** The patch (`rexec callers as memfd`) makes runc copy itself into an anonymous, in-memory file (`memfd`) and re-execute *that*, so there is no host-filesystem path for the container to write through. Notably, several configurations were never vulnerable, and each one is a lesson you'll see again in Volume 7:

- **User namespaces** with host root unmapped — the container's root isn't the host's root, so the write fails. Blocked it outright.
- **SELinux in enforcing mode** with correct policy (Red Hat's `container_t` labelling) — blocked it.
- **Read-only host filesystem** for the runc binary (Atomic Host) — nothing to overwrite.
- The **default AppArmor policy** on Debian/Ubuntu did *not* block it. Neither did Fedora's default SELinux policy for the `moby-engine` package.

Every one of those is defence in depth doing its job. The lesson isn't "containers are unsafe." It's that the isolation you get from namespaces alone is one layer, the layer this volume described, and production hardening means stacking several more on top of it.

---

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

## Where this leaves you, and what's next

You can now state what a container is without using the word "lightweight": a process running in a set of namespaces that restrict its view, inside a cgroup that caps its consumption, with a root filesystem assembled by OverlayFS from shared read-only layers plus a private copy-on-write layer. You've built each of those three pieces by hand, with no Docker involved, and then found Docker doing exactly the same thing underneath.

You also saw the two cracks that the rest of this guide keeps returning to: the deletion that doesn't delete (whiteouts), and the boundary that holds at every namespace and fails at a file descriptor (CVE-2019-5736).

**Volume 2: Images, Layers, and the Dockerfile.**

Having built an overlay mount by hand, you're in an unusually good position to understand images properly — because an image is nothing but a recipe for that lowerdir chain, plus metadata. We'll derive why layering exists from the distribution problem it solves, write a real Dockerfile for an actual application from first principles, and take apart the build cache until the "put your lockfile before your source" rule becomes obvious rather than memorized. Then multi-stage builds, with a before/after size comparison you run yourself — expect roughly an order of magnitude. Then tags versus digests and why `latest` is a trap with a specific, repeatable production failure mode. And we'll close on a documented supply-chain incident involving malicious images in a public registry.

Say "continue" when you're ready.
