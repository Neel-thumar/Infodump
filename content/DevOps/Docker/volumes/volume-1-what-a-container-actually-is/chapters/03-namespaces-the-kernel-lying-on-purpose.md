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

