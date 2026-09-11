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

