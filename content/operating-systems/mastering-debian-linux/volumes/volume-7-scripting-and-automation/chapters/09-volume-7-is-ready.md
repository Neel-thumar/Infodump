# Volume 7 is ready

**File: `volume-7-scripting-and-automation.md`**

## What Volume 8 will cover: ADVANCED DEEP DIVES, AND THE SYNTHESIS

The final volume, and it closes the book.

- **Syscalls as the boundary.** Volume 1 §2.7 walked through `execve()` without ever saying what a
  system call *is* mechanically — the CPU privilege transition, the `syscall` instruction, the kernel
  entry path. We'll count them, trace them, and look at what `strace` is actually doing.
- **Kernel modules and drivers** — what `.ko` files are, how `modprobe` resolves dependencies, why
  Secure Boot forces module signing (Volume 6 §32.6), and building one.
- **Containers demystified** — **namespaces and cgroups are the whole trick**, and you'll build a
  container by hand with `unshare` and `nsenter`, no Docker involved. Volume 6 §36.5's cgroups and
  Volume 3 §17.4's bind mounts turn out to be two of the three ingredients.
- **Compiling your own kernel** — why you'd ever want to, and Debian's `make deb-pkg` path that
  produces a real `.deb` (Volume 4) rather than a pile of files in `/`.
- **Firewalls**: `nftables`, why Debian moved from `iptables`, and building one rule you can verify —
  flagged clearly, since it can affect network access.
- **The synthesis**: one page-load traced through **every volume at once** — shell, permissions,
  filesystem, packages, network, boot, and automation, all visible in a single action.
- **And a "rabbit holes worth falling into" section** — the genuinely obscure and delightful corners
  of Linux and Debian that didn't fit anywhere else.

Say **continue** when you'd like Volume 8.
