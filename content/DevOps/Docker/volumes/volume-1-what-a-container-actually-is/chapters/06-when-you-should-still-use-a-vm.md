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

