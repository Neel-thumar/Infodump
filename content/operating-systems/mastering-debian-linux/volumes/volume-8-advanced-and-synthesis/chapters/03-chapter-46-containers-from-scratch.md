# Chapter 46 — Containers, From Scratch

## 46.1 The hook

> **A Docker container is often described as "a lightweight VM." It is not a VM at all, and it isn't
> lightweight in the way that implies.**
>
> **A container is an ordinary Linux process. `ps` on the host shows it. It shares your kernel, your
> scheduler, your page cache. There is no hypervisor and no guest OS.**
>
> **So what makes it *feel* isolated? Three kernel features, all of which this book has already
> covered, and you can assemble them by hand in about five commands.**

## 46.2 THE PROBLEM: isolation without virtualisation

You want to run software such that it cannot see or disturb the rest of the machine. The heavyweight
answer is a virtual machine: a whole second kernel, its own memory, emulated hardware. Correct,
expensive, slow to start.

But look at what the isolation actually needs to cover, and each one turns out to be a *lookup the
kernel performs on the process's behalf*:

| The process asks | The kernel answers from |
|---|---|
| "what processes exist?" | the **PID** table |
| "what does `/` contain?" | the **mount** table |
| "what network interfaces are there?" | the **net** device list |
| "what's my hostname?" | the **UTS** struct |
| "who am I?" | the **credential** struct (Volume 2 §11.3) |

> **So: don't virtualise the hardware. Give the process a *different table*.**
>
> That's a **namespace**, and it is the entire trick.

## 46.3 The three ingredients

| Ingredient | Controls | Covered in |
|---|---|---|
| **Namespaces** | **what the process can SEE** | §46.4 — and Volume 3 §17.4's mounts |
| **cgroups** | **what it can USE** | Volume 6 §36.5 |
| **Capabilities / seccomp / LSM** | **what it can DO** | Volume 2 §11.8, §44.8 |

Docker did not invent any of these. It packaged them, added an image format and a registry, and made
the result usable — which was a genuine contribution, but a *packaging* one.

## 46.4 Namespaces, and the inode that proves it

Every process has one namespace of each type, and the kernel exposes them as magic symlinks:

```bash
ls -l /proc/self/ns/
```

```
cgroup -> cgroup:[4026531835]
ipc    -> ipc:[4026531839]
mnt    -> mnt:[4026531832]
net    -> net:[4026531833]
pid    -> pid:[4026531836]
time   -> time:[4026531834]
user   -> user:[4026531837]
uts    -> uts:[4026531838]
```

*(Verified.)* **Those numbers are inodes** (Volume 3 §15) in a special filesystem. Two processes are
in the same namespace **if and only if** these numbers match — which makes "is this process
contained?" a comparison rather than a mystery:

```bash
readlink /proc/self/ns/pid
readlink /proc/1/ns/pid
```

The eight types:

| Namespace | Isolates | Since |
|---|---|---|
| **`mnt`** | **the mount table** — its own `/` | 2002 |
| **`uts`** | hostname and domain name | 2006 |
| `ipc` | System V IPC, POSIX message queues | 2006 |
| **`pid`** | **the process ID number space** | 2008 |
| **`net`** | **interfaces, routes, ports, firewall rules** | 2009 |
| **`user`** | **UID/GID mappings — enables rootless containers** | 2013 |
| `cgroup` | the cgroup hierarchy root | 2016 |
| `time` | `CLOCK_MONOTONIC` and `CLOCK_BOOTTIME` offsets | 2020 |

> **Confidence: moderate** on the individual years; the ordering is right and the early-2000s to 2020
> span is correct.

### Watch them work — all verified

**PID namespace — you become PID 1:**

```bash
echo "outside: \$\$=$$  PID 1 is $(cat /proc/1/comm)"
unshare --pid --fork --mount-proc bash -c \
  'echo "inside:  \$\$=$$  PID 1 is $(cat /proc/1/comm)"; ps -eo pid,comm --no-headers'
```

```
outside: $$=499  PID 1 is process_api
inside:  $$=1    PID 1 is bash
          1 bash
          3 ps
```

*(Verified.)* **Three processes visible where the host has fifty.** Volume 2 §12.2 said PID 1 is
special — inside this namespace, *bash* is PID 1, inherits orphans, and is protected from signals it
hasn't handled.

The `--mount-proc` is doing real work: `/proc` is generated from the kernel's process table, so
without remounting it the new namespace would still show you the host's `/proc` and the illusion
would collapse immediately.

**And the inode changes, which is the proof:**

```bash
echo "outside: $(readlink /proc/self/ns/pid)"
unshare --pid --fork bash -c 'echo "inside:  $(readlink /proc/self/ns/pid)"'
```

```
outside: pid:[4026531836]
inside:  pid:[4026532209]
```

*(Verified.)* A different table.

**UTS namespace — your own hostname:**

```bash
echo "outside: $(hostname)"
unshare --uts bash -c 'hostname container-demo; echo "inside:  $(hostname)"'
echo "outside: $(hostname)   (unchanged)"
```

```
outside: vm
inside:  container-demo
outside: vm   (unchanged)
```

*(Verified.)* `hostname` is a privileged call that changed *a* hostname — just not the host's.

**Net namespace — your own network stack:**

```bash
echo "outside: $(awk 'NR>2{print $1}' /proc/net/dev | tr -d ':' | tr '\n' ' ')"
unshare --net bash -c 'echo "inside:  $(awk "NR>2{print \$1}" /proc/net/dev | tr -d ":" | tr "\n" " ")"'
```

```
outside: lo ifb0 ifb1 eth0
inside:  lo
```

*(Verified.)* **Its own interface list, routing table, port space and firewall rules.** Two processes
in different net namespaces can both bind port 80 with no conflict — Volume 5 §29.4's four-tuple
uniqueness, now scoped per namespace.

**Mount namespace — Volume 3's bind mounts, doing their real job:**

```bash
mkdir -p /tmp/nsdemo && echo "visible outside" > /tmp/nsdemo/file
unshare --mount bash -c 'mount -t tmpfs none /tmp/nsdemo; ls /tmp/nsdemo | wc -l'
echo "outside still sees: $(ls /tmp/nsdemo | wc -l) file(s)"
rm -rf /tmp/nsdemo
```

```
0
outside still sees: 1 file(s)
```

*(Verified.)* Volume 3 §17.4 showed mounting shadows a directory's contents. **In a mount namespace,
it shadows them *only for you*.**

**And list them all:**

```bash
lsns
lsns -t pid
sudo lsns -t net
```

```
        NS TYPE   NPROCS PID USER COMMAND
4026531832 mnt        50   2 root kthreadd
4026531833 net        51   2 root kthreadd
...
```

*(Verified.)* On a machine running containers, `lsns` shows one row per container per type — which
is the most honest view of "what containers are running" the system can give you.

## 46.5 The root filesystem: `pivot_root`, not `chroot`

A container needs its own `/`. The old tool is `chroot`, and it is **not** a security boundary — a
process with `CAP_SYS_CHROOT` can escape a chroot in about ten lines of C, a technique old enough to
have its own folklore.

The container-grade version is **`pivot_root`**, inside a mount namespace:

```
   1. unshare the MOUNT namespace         ← now my mount table is private
   2. mount --bind newroot newroot        ← Volume 3 §17.4: make it a mount point
   3. pivot_root newroot newroot/old
   4. umount -l /old                      ← DETACH the host's filesystem entirely
```

> **The difference that matters is step 4.** After `chroot`, the old root is still mounted and still
> reachable by a process that can get a file descriptor to it. After `pivot_root` plus `umount`,
> **the host filesystem is no longer in this namespace's mount table at all** — there is nothing to
> escape *to*.

And this is where Volume 3 §17.4's bind mounts earn their keep. A Docker `-v /data:/data` is exactly
a bind mount into the container's mount namespace:

```bash
findmnt -o TARGET,SOURCE,FSTYPE | grep -E '\[' | head -3
```

That bracket notation — `/dev/vda[/tmp/bindsrc]` — is what a bind mount looks like, verified back in
Volume 3.

## 46.6 cgroups — Volume 6's debt, in its other role

Volume 6 §36.5 introduced cgroups as systemd's answer to PID files. **The same mechanism is the
resource half of a container.**

```bash
stat -fc '%T' /sys/fs/cgroup
cat /proc/self/cgroup
ls /sys/fs/cgroup/ | head
```

| Output of `stat -fc %T` | Means |
|---|---|
| **`cgroup2fs`** | **cgroup v2 unified — Debian 11+ default** |
| `tmpfs` with `cpu/`, `memory/`, `blkio/` subdirs | cgroup v1 legacy |

*(My test box reports `tmpfs` — v1. Debian 12 should give you `cgroup2fs`.)*

Creating one by hand on cgroup v2:

```bash
sudo mkdir -p /sys/fs/cgroup/demo
echo "+memory +pids" | sudo tee /sys/fs/cgroup/cgroup.subtree_control >/dev/null
echo "100M" | sudo tee /sys/fs/cgroup/demo/memory.max
echo "20"   | sudo tee /sys/fs/cgroup/demo/pids.max
echo $$     | sudo tee /sys/fs/cgroup/demo/cgroup.procs     # move THIS SHELL in
cat /proc/self/cgroup
# ... run something ...
sudo rmdir /sys/fs/cgroup/demo
```

> **Note what that is: you configured a resource limit by `echo`ing into a file.** Volume 3 §14.3
> claimed "everything is a file" makes kernel state shell-scriptable. **cgroups are the most
> consequential example** — the entire container resource model is a directory tree you write numbers
> into.

`pids.max` deserves a mention: it is the fork-bomb defence. A cgroup that cannot exceed 20 processes
cannot exhaust the system's PID table no matter what runs inside it.

## 46.7 A container, by hand

Assemble the pieces *(the namespace parts are verified; the full sequence needs a root filesystem)*:

```bash
# 1. get a root filesystem — Debian's own tool
sudo apt install debootstrap
sudo debootstrap --variant=minbase bookworm /tmp/rootfs http://deb.debian.org/debian
sudo du -sh /tmp/rootfs

# 2. a cgroup to bound it
sudo mkdir -p /sys/fs/cgroup/handmade
echo "200M" | sudo tee /sys/fs/cgroup/handmade/memory.max >/dev/null
echo "50"   | sudo tee /sys/fs/cgroup/handmade/pids.max   >/dev/null

# 3. enter new namespaces, put ourselves in the cgroup, and pivot
sudo unshare --pid --fork --mount --uts --ipc --net --mount-proc \
     bash -c '
        echo $$ > /sys/fs/cgroup/handmade/cgroup.procs
        hostname handmade
        mount --bind /tmp/rootfs /tmp/rootfs
        mkdir -p /tmp/rootfs/old
        cd /tmp/rootfs
        pivot_root . old
        umount -l /old
        mount -t proc proc /proc
        exec /bin/bash
     '
```

Inside, verify you built a container:

```bash
hostname                     # handmade
ps -eo pid,comm              # just bash and ps — you are PID 1
ls /                         # Debian's filesystem, not the host's
cat /proc/net/dev            # only lo
cat /proc/self/cgroup        # /handmade
ls /home                     # empty — the host's /home is unreachable
```

Clean up:

```bash
sudo rmdir /sys/fs/cgroup/handmade
sudo rm -rf /tmp/rootfs
```

> **That is a container.** Five namespaces, one cgroup, a root filesystem, and `pivot_root`. No
> daemon, no image format, no registry, no Docker. Every piece is a kernel feature from an earlier
> volume.

## 46.8 So what does Docker actually add?

Quite a lot, and it's worth being precise rather than dismissive:

| Docker provides | Which is |
|---|---|
| **Image format** — layered, content-addressed | **overlayfs**, a union filesystem: a stack of read-only layers plus one writable top |
| **A registry** | HTTP + content-addressed blobs — Volume 5 |
| **Networking** | `veth` pairs bridging a net namespace to the host, plus NAT rules (§48) |
| **A build system** | `Dockerfile` → a sequence of layers |
| **Lifecycle management** | start, stop, restart policies, health checks |
| **Sane defaults** | a dropped capability set, a seccomp profile (§44.8), read-only mounts |

```bash
mount -t overlay 2>/dev/null | head -2
findmnt -t overlay 2>/dev/null | head -3
```

That last category is the underrated one. **A hand-built container like §46.7's runs as full root
with all capabilities.** Docker drops most of them by default and applies a seccomp filter blocking
dozens of syscalls. The isolation you get from `docker run` is meaningfully stronger than from
`unshare`, and it's because of §44.8's and Volume 2 §11.8's mechanisms, not the namespaces.

### And Volume 5's warning, now fully explained

Volume 5 §29.7 noted that `/var/run/docker.sock` is mode `660 root:docker`, and that **membership of
the `docker` group is equivalent to root.** Now you can see exactly why:

```bash
ls -l /var/run/docker.sock 2>/dev/null
getent group docker 2>/dev/null
```

> Anyone who can talk to that socket can ask the daemon to start a container **with `--privileged`,
> mounting the host's `/` — which is a bind mount (§46.5) into a namespace that has all capabilities
> and no seccomp filter.** From inside, the host filesystem is writable as root.
>
> **That is not a Docker vulnerability.** It is the socket's filesystem permissions being the entire
> authentication mechanism — Volume 2 §14.3's `disk` group all over again. Adding a user to `docker`
> is granting root, and should be considered exactly that.

Rootless alternatives exist and are worth knowing about — **Podman** in particular uses the **user
namespace** so that the container's "root" maps to your unprivileged UID on the host:

```bash
apt-cache show podman 2>/dev/null | grep -E '^(Package|Description)' | head -2
cat /proc/self/uid_map
```

---

