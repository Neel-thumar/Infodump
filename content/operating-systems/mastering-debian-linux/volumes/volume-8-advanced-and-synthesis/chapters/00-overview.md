# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 8 — Advanced Deep Dives, and the Synthesis

---

### The last volume

Seven volumes have said "the kernel does this" and "ask the kernel for that" without ever explaining
**how you ask**. That's where this one starts, and it's the right place — because once you can see
the boundary, containers stop being magic and become an obvious consequence of things you already
know.

Debts closing here:

| Debt | From | Closed in |
|---|---|---|
| `linux-vdso.so.1` appearing in `ldd` output, unexplained | 1 §2.7 | **§44.7** |
| "Volume 8 returns to bind mounts" | 3 §17.4 | **§46.5** |
| "cgroups are also what containers are built from" | 6 §36.5 | **§46.6** |
| Secure Boot forces module signing | 6 §32.6 | **§45.6** |
| `/var/run/docker.sock` membership ≡ root | 5 §29.7 | **§46.8** |
| "Volume 8 comes back to `sysctl`" | 2 §12.7 | **§48.6** |
| `nosuid`, `noexec`, `nodev` as hardening | 3 §17.7 | **§48.7** |

**Requirements.** Most of this reads rather than changes:

```bash
sudo apt install strace nftables util-linux manpages-dev
sudo apt install linux-headers-$(uname -r)     # only for §45.5 and §47
```

> **Verification note.** My test box is the Firecracker microVM from Volume 6 — **no `strace`, no
> `nft`, no `lsmod`, no loaded modules, and cgroup v1 rather than Debian's v2.** But it does have
> `gcc`, `unshare`, `nsenter`, `lsns` and the kernel headers, which means **§44's syscall material
> and all of §46's namespace demonstrations are verified and reported as real output.** Everything
> involving `strace`, `nft`, `modprobe` or kernel compilation is **described**, and marked.

---

