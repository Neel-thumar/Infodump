---
id: docker-prologue
title: Volume 0 — Prologue: Why Containers Changed Everything
order: 0
description: A short narrative prologue on the problem containers solve, the forty-year history behind them, and what Docker actually invented.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 0 — Prologue: Why Containers Changed Everything

---

## Cold open: the number

In January 2026 the Cloud Native Computing Foundation published its annual survey. Among organizations that use containers at all, **82% now run Kubernetes in production** — up from 66% in the 2023 edition. The share of organizations running **most or all** of their production applications in containers rose from 41% in 2023 to **56% in 2025**. Container *pilots* — the "we're still evaluating this" category — shrank from 11% to 6%.

That last number is the interesting one. Pilots shrinking is not a sign of a technology stalling. It is a sign of a technology finishing. There is almost nobody left to convince.

> **Confidence: high** for the figures themselves (CNCF Annual Cloud Native Survey 2025, published January 2026). **Caveat you should internalize:** this is a self-selected survey of people already in the CNCF orbit. It tells you what committed cloud-native organizations do, not what the median business in the world does. There is still an enormous amount of software running on bare VMs and hand-configured servers, and there always will be. Treat "82%" as "82% of a population that already opted in," not "82% of computing."

Here is the fact that should actually surprise you, though, and it isn't a percentage.

The core mechanism that makes all of this work — the thing that isolates one container from another — is not a Docker invention, not a cloud invention, and not new. It is a set of Linux kernel features, most of which existed and shipped in mainline kernels *before* Docker was written. Docker's founders did not build the engine. They built the ignition key, the dashboard, and the fuel standard, and it turned out that was the entire problem.

Understanding exactly which parts are kernel, which are Docker, and which are an open standard is what separates people who *use* Docker from people who *know* Docker. That distinction is the spine of this whole guide.

---

## The pain that existed before

Let me tell you the failure in its generic form, because you have almost certainly lived some version of it.

A developer builds a service on her laptop. Ubuntu 20.04, Python 3.8, a handful of pip packages, ImageMagick installed via apt because one code path resizes an uploaded avatar. It works. Tests pass. She pushes.

Staging runs CentOS. Python 3.6. ImageMagick is there but it's an older build compiled without a delegate for the image format the app happens to receive most often. The service starts fine, passes the health check, serves traffic — and silently fails on roughly one request in forty, the ones with that image format. Nobody notices for six days because the error is caught, logged at INFO, and returns a default avatar.

Production runs a third thing entirely, because production was built in 2017 and staging was rebuilt in 2021 and nobody reconciled them. Production has a different glibc. The app crashes on startup. At 2 a.m.

The developer, summoned, runs it locally. It works. She says the five words: **"It works on my machine."** And she is *telling the truth*. That is the maddening part. She is not being careless. The application is correct. The machine is the bug.

Now notice what the real problem is. It is not that the environments differ — of course they differ, they were built by different people at different times. The real problem is that **the environment was never part of the artifact.** The team shipped a `.py` file, or a `.jar`, or a binary, and then *separately and by hand* tried to reconstruct the world that binary needed on three different machines. The dependency graph of a running application does not stop at your package manifest. It includes the shared libraries, the system binaries, the locale data, the CA certificate bundle, the kernel's idea of what `/etc/resolv.conf` means, the timezone database, and about four hundred other things nobody writes down.

Every pre-container solution was an attempt to reconstruct that world reliably:

| Approach | What it actually did | Why it wasn't enough |
| --- | --- | --- |
| Documentation ("setup.md") | Humans re-execute steps | Drifts within days; humans skip steps |
| Configuration management (Puppet, Chef, Ansible) | Converge a machine toward a described state | Convergence is stateful; a machine with history ≠ a fresh machine. Same playbook, different outcomes |
| Golden VM images | Ship the whole machine as the artifact | Correct, but gigabytes; boots in minutes; one per app is wasteful |
| "Just use the same OS everywhere" | Standardize by decree | Survives contact with reality for about one procurement cycle |

The golden-image people had the right *idea*: make the environment part of the artifact. Their problem was purely one of cost. A VM image carries an entire operating system, a bootloader, and a kernel, and needs a hypervisor to emulate hardware for it. Shipping a 4 GB image and waiting 90 seconds for it to boot is an absurd price to pay for the privilege of knowing which glibc you have.

**The question containers answer:** can we get the guarantee of the golden image — the environment travels with the application — at roughly the cost of starting a process?

The answer is yes, and it took about thirty-four years to assemble.

---

## A short, honest history

### 1979 — `chroot`

The `chroot` system call appeared in Version 7 Unix. It does one thing: it changes the apparent root directory (`/`) for a process and its children. A process inside a chroot that opens `/etc/passwd` gets the file at `/some/other/dir/etc/passwd` instead.

That is the first ancestor of everything in this guide: **give a process a different view of reality rather than a different computer.**

But `chroot` only virtualizes *one* thing — the filesystem path namespace. The chrooted process still sees every other process on the machine, shares the same network stack, the same hostname, the same user IDs, the same everything else. And it was never designed as a security boundary; root inside a chroot has historically been able to escape it through well-known tricks. It was a build-and-test convenience, not a jail.

> **Confidence: high** on Version 7 Unix (1979) and on chroot's escapability by root. **Lower confidence** on the often-repeated detail that Bill Joy added chroot to BSD in 1982 — I've seen it stated frequently but haven't verified it against a primary source, so treat it as folklore-grade.

### 2000 — FreeBSD jails

Twenty-one years later, FreeBSD shipped `jail`, introduced by Poul-Henning Kamp, alongside a paper whose title tells you the whole thesis: *"Jails: Confining the omnipotent root."* Jails took chroot's idea and extended it to the parts chroot ignored — a jail got its own hostname, its own IP address, and a restricted view of the process table. Root inside the jail was deliberately *not* root outside it.

This is the first system that genuinely deserves the word "container," and it's worth noticing it was built for shared hosting: one FreeBSD box, many customers, none of whom should see each other.

> **Confidence: high** on Kamp, the jail feature, and the paper's existence and title. **Medium** on the exact release (commonly cited as FreeBSD 4.0, March 2000).

### ~2004–2005 — Solaris Zones

Sun shipped Zones with Solaris 10, adding proper resource controls to the isolation story — not just "what can this workload see" but "how much of the machine can it consume." Zones were, by most accounts, technically ahead of anything Linux had at the time. They ran on Solaris, which by then was losing the datacenter to Linux, and so the ideas outlived the platform.

> **Confidence: medium-high.** Zones are strongly associated with Solaris 10; sources vary on whether to date it to the 2004 announcement or the 2005 general release.

### 2006–2008 — Google, cgroups, and the Linux kernel catches up

Google had a problem nobody else had yet: they ran an enormous number of jobs from different teams on shared machines, and they needed hard guarantees that one job couldn't starve another of CPU or memory. Their internal cluster manager (Borg, publicly described much later) depended on it.

Two Google engineers, **Paul Menage** and **Rohit Seth**, wrote a kernel feature originally called **"process containers"** — renamed **cgroups** (control groups) to avoid overloading the word "container" in kernel-speak. It merged into the mainline Linux kernel in 2.6.24, released in January 2008.

Meanwhile, Linux **namespaces** had been growing incrementally since the mount namespace landed in 2.4.19 (2002), with the rest — UTS, IPC, PID, network, user — arriving over the following decade.

Then in 2008, **LXC** appeared: userspace tooling that combined namespaces and cgroups into something recognizably container-shaped. The primitives were now all in mainline Linux and free for anyone to use.

> **Confidence: high** on Menage/Seth, the "process containers" → "cgroups" rename, and the 2.6.24 merge. **Medium** on the precise namespace-by-namespace kernel versions — I'll pin those down properly in Volume 1 rather than guess here.

**Pause on this, because it's the crux of the whole story:** by 2008, every kernel mechanism Docker would later use already existed in mainline Linux, shipped in every major distribution, documented and free. And container adoption outside of Google and a handful of hosting companies was approximately zero.

Why? Because using them required you to be a kernel-adjacent systems engineer. You had to know which namespaces to unshare, in which order, how to set up a filesystem root, how to wire a veth pair into a bridge, how to write cgroup values into `/sys/fs/cgroup`, and how to not get any of it subtly wrong. LXC helped, but it was still configuration-file work, and it had no answer at all to the question that actually mattered to developers: *how do I give this container's filesystem to my coworker?*

### March 2013 — Docker

**dotCloud** was a small platform-as-a-service company founded by Solomon Hykes, Kamel Founadi, and Sebastien Pahl, out of Y Combinator's Summer 2010 batch. PaaS in 2011 meant: customers push code, you run it safely next to other customers' code. dotCloud used Linux containers internally to do that, and had built tooling around them.

The PaaS business was not thriving. But people kept asking how the container tooling worked.

On **Friday, 15 March 2013**, at PyCon US in Santa Clara, Hykes gave a **five-minute lightning talk** titled *"The future of Linux Containers."* It was the first public demonstration of Docker. The project was open-sourced five days later, on **20 March 2013**. dotCloud renamed itself Docker, Inc. later that year.

Five minutes. The talk is still online and you should watch it at some point; it's a useful antidote to the idea that big technology shifts announce themselves loudly.

> **Confidence: high** — the lightning talk date, title, venue, and the 20 March 2013 release are corroborated by PyVideo's session record, the Kubernetes project's own retrospective, and Wikipedia.

---

## What Docker actually invented

This is the part most tutorials blur, so let's be exact. Sort every claim about Docker into one of three columns.

| Docker did **not** invent | Docker **did** invent or popularize | Docker **standardized** (later, with others) |
| --- | --- | --- |
| Namespaces (Linux kernel) | The **image format as a stack of layers** — content-addressed, cacheable, diffable | The OCI **Image Specification** |
| cgroups (Google → Linux kernel) | The **Dockerfile** — a build as a readable, version-controlled, reproducible script | The OCI **Runtime Specification** |
| Union/copy-on-write filesystems (AUFS, later OverlayFS) | **Docker Hub / registries** — `docker push` and `docker pull`, a distribution network for environments | The OCI **Distribution Specification** |
| Process isolation as a concept (chroot, jails, Zones) | A **single-command UX**: `docker run nginx` and it just works | — |
| Running containers at scale (Google's Borg, years earlier) | The **ecosystem gravity** that made one format universal | — |

Two of those deserve emphasis.

**The layered image was the real technical contribution.** Not because layering is novel — union filesystems predate Docker by years — but because Docker made a layer a *first-class, addressable, shareable unit*. Your image is built on `python:3.11`, which is built on `debian:bookworm`. If a hundred images on your machine share that Debian base, it exists on disk once. When you push an updated image, you push only the layers that changed — often a few hundred kilobytes instead of a few hundred megabytes. That single design decision is why containers pull in seconds and start in milliseconds, and it's the subject of Volume 2.

**The registry was the real product contribution.** Golden VM images solved the correctness problem but had no distribution story — you SCPed multi-gigabyte files around, or you didn't share them at all. `docker push` / `docker pull`, with layer deduplication underneath, turned "the environment" into something you could share as easily as a git commit. LXC never had that. That absence is most of why LXC had five years of head start and lost.

Docker's genius was not engineering depth at the kernel level. It was correctly identifying that the hard problem had stopped being *isolation* and become *distribution and ergonomics* — and then solving that so well that a five-minute demo was enough.

---

## Things you're about to understand that most daily Docker users never learn

Concrete teasers, each pulled from a specific later volume. If several of these make you want to skip ahead, good — that's the reaction I'm going for.

- **Why "a container is a lightweight VM" is not a simplification but a category error.** There is no guest kernel. There is no boot. Run `ps aux` on your host while a container is running and you will see the container's process sitting there in your own process table, an ordinary PID like any other. *(Volume 1)*
- **You can build a container by hand**, with no Docker installed, using `unshare`, `mount`, and a few writes into `/sys/fs/cgroup`. Doing this once permanently destroys the mystique. *(Volume 1, and as an optional deep project in Volume 9)*
- **Why a one-character change to your Dockerfile can cut your build from four minutes to four seconds** — and why the rule of thumb everyone repeats ("copy your lockfile before your source") is a *consequence* of the cache mechanism, not the mechanism itself. *(Volume 2)*
- **What `latest` actually is.** It is not "the newest version." It is a tag with no special properties whatsoever, which Docker happens to use as a default. The production failure mode this causes is specific and repeatable. *(Volume 2)*
- **The exact difference between `CMD` and `ENTRYPOINT`,** which almost nobody can state precisely, and the shell-form vs exec-form trap that silently means your container never receives `SIGTERM` and gets hard-killed on every deploy. *(Volumes 2 and 3)*
- **Where your container's data physically lives on your disk right now.** You will go find it with `ls`. And you'll see why writing to a container's writable layer and expecting it to survive is one of the most common data-loss stories in the field. *(Volume 4)*
- **How a packet actually gets from your browser to a container** — the veth pair, the bridge, and the specific `iptables` NAT rule Docker wrote into your host's kernel without telling you. You'll read that rule yourself. *(Volume 5)*
- **Why `depends_on` does not do what its name suggests,** and the race condition it has caused in approximately every Compose project ever written. *(Volume 6)*
- **What containers do *not* protect you against.** The kernel is shared. A kernel exploit crosses the boundary. There is a whole genre of real, documented attacks — including automated cryptomining worms that scan the internet for exposed Docker daemons — that exist precisely because people believed the isolation was stronger than it is. *(Volume 7)*
- **Why Docker, Inc. invented the defining infrastructure technology of the decade and then had to sell its enterprise business to Mirantis in 2019.** The gap between inventing a technology and capturing value from it is one of the most instructive stories in the industry, and it's routinely misremembered. *(Volume 8)*

---

## TRY THIS ON YOUR MACHINE

Volume 0 is narrative, so these are short. Their job is to get Docker installed and to let you *see*, before any theory, the two facts the rest of the guide explains: containers are processes, and images are shared layers.

> **Assumptions:** Debian (bookworm or later), a user with `sudo`, an internet connection. Everything here is non-destructive. Disk usage and cleanup are flagged per exercise.

### 0.1 — Install Docker Engine from Docker's official repository

Do **not** use `apt install docker.io` from Debian's own repos for this guide — it's an older, differently-packaged build, and version drift will cause confusing mismatches with what I show you later. Use Docker's repository.

```bash
# Remove any conflicting older packages (safe if none are installed)
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
  sudo apt remove -y $pkg 2>/dev/null
done

# Add Docker's official GPG key
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository, pinned to your Debian codename and architecture
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Verify:

```bash
sudo docker run hello-world
```

Optionally, add yourself to the `docker` group so you can drop the `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker   # or log out and back in
docker run hello-world
```

**Expect:** a short greeting explaining what just happened. **Disk:** roughly 500 MB for the Docker packages, plus a ~20 KB image.

**Security note, said once and meant:** membership in the `docker` group is equivalent to root on this machine. The daemon runs as root, and anyone who can talk to it can mount your host filesystem into a container. This is fine on your personal laptop and is a real finding on a shared server. Volume 7 explains exactly why, and Volume 8 covers the rootless alternatives.

**Why it's interesting:** notice you already have three separate things installed — `docker-ce` (the daemon), `docker-ce-cli` (the client you type at), and `containerd.io` (a lower-level runtime Docker delegates to). Most people believe they installed one program. Volume 8 is largely about why that's three.

### 0.2 — Watch a container be an ordinary process

Two terminals.

Terminal A:

```bash
docker run --rm --name sleeper alpine sleep 300
```

Terminal B:

```bash
ps -ef | grep "[s]leep 300"
sudo ls -l /proc/$(pgrep -f "sleep 300")/ns/
```

**Expect:** your host's `ps` shows `sleep 300` as a plain process owned by root, with a normal host PID. The second command lists that process's namespace links — `mnt`, `net`, `pid`, `uts`, `ipc`, `cgroup` — each an inode number.

**Why it's interesting:** there is no virtual machine here and nothing to boot. Docker started a process and attached it to a different set of namespaces. That inode list is, almost in its entirety, the thing that makes it "a container." Compare those inode numbers to your own shell's with `ls -l /proc/self/ns/` — the ones that differ are exactly the isolation you're getting.

**Cleanup:** Terminal A exits on its own after five minutes, or press `Ctrl-C`. `--rm` removes the container.

### 0.3 — Watch layer sharing happen in real time

```bash
docker pull python:3.12-slim
docker pull python:3.12-alpine
docker images
docker system df
```

Now pull something that shares a base with one of those:

```bash
docker pull debian:bookworm-slim
docker system df
```

**Expect:** `docker images` reports sizes that, added up, exceed what `docker system df` reports as actually used. The `RECLAIMABLE` column and the shared-layer accounting is where the discrepancy lives.

**Why it's interesting:** the "size" of an image is a lie of convenience. Images are not files; they're references into a shared, content-addressed layer store. This is the mechanism behind Volume 2 and the reason a fifteen-image machine doesn't need fifteen copies of Debian.

**Disk:** roughly 250–350 MB total. **Cleanup:**

```bash
docker rmi python:3.12-slim python:3.12-alpine debian:bookworm-slim
```

### 0.4 — Time it against your intuition

```bash
time docker run --rm alpine echo hello
time (for i in $(seq 1 20); do docker run --rm alpine true; done)
```

**Expect:** the first run, with the image already local, in the low hundreds of milliseconds. Twenty sequential runs in a few seconds — and note that most of that time is the Docker *client* talking to the daemon, not the container itself starting.

**Why it's interesting:** hold this number against the honest alternative. Booting a VM to get a guaranteed environment is 30–90 seconds. You are getting a comparable environmental guarantee for roughly the cost of `fork()` plus some filesystem setup. That ratio — four orders of magnitude — is the entire economic argument for containers, and Volume 1 explains precisely where the saved time went.

**Cleanup:** none; `--rm` handles it. The `alpine` image (~8 MB) stays cached — keep it, you'll use it constantly.

### 0.5 — Meet chroot, the 1979 ancestor

Build the oldest version of a container by hand, with no Docker involved.

```bash
mkdir -p ~/tiny-root/bin
sudo apt install -y busybox-static
cp /bin/busybox ~/tiny-root/bin/
cd ~/tiny-root
for cmd in sh ls ps cat mount; do ln -sf /bin/busybox bin/$cmd; done
sudo chroot ~/tiny-root /bin/sh
```

Inside that shell, try:

```bash
ls /
ps aux
```

**Expect:** `ls /` shows only your tiny tree — the filesystem is successfully confined. But `ps aux` shows... something surprising. Depending on whether `/proc` is visible, you'll either get an error or a view that leaks host information. Exit with `exit`.

**Why it's interesting:** this is exactly the 1979 state of the art, and it demonstrates the gap that took thirty-four more years to close. The filesystem is isolated. The **process table, the network stack, the hostname, the user IDs, and the resource limits are not.** Every one of those gaps is a Linux namespace or a cgroup, and Volume 1 fills them in one at a time.

**Disk:** ~2 MB. **Cleanup:**

```bash
rm -rf ~/tiny-root
```

---

## Send-off

Here's the frame to carry into Volume 1.

You now know that the isolation primitives were sitting in mainline Linux for five years before Docker existed, unused by almost everyone, because they were too hard to hold correctly. You know that Docker's contribution was the layered image, the Dockerfile, the registry, and a one-line UX — that is, packaging and distribution, not kernel engineering. And in exercise 0.5 you built the 1979 version with your own hands and watched exactly where it leaks.

So the obvious next question, and the one Volume 1 answers in full:

**If a container is just a process, what specifically makes it feel like a machine — and where exactly does that illusion break?**

We'll take the namespaces one at a time and derive what each is for by first breaking the system without it. Then cgroups, from the noisy-neighbor problem that forced Google to write them. Then OverlayFS and what copy-on-write really means at the block level. Then the honest VM comparison, including the cases where you should still choose a VM. And we'll close on a well-documented real container escape — a CVE with a CVSS score and a patch — that exploited a specific gap in exactly the model we'll have just built.

Volume 1: **What a Container Actually Is (Not a VM).**
