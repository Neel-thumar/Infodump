# Volume 8 Retrospective

**1. There are 373 syscalls, and that's the whole interface.** Everything privileged your machine
does goes through one CPU instruction, one kernel-chosen entry address, and a numbered table. Once
you see that, the security mechanisms stop being a grab-bag: **seccomp filters which entries,
capabilities subdivide what's behind them, namespaces change what they return.**

**2. `linux-vdso.so.1` is not a file.** It's kernel code mapped into every process so that frequent,
unprivileged calls like `clock_gettime()` never trap at all. Volume 1 §2.7's unexplained `ldd` line,
resolved.

**3. A kernel module doesn't run *in* the kernel — it *becomes* the kernel.** No isolation, no memory
protection, ring 0. That's why `vermagic` refuses mismatched builds, why Secure Boot must cover
modules or achieve nothing, and why DKMS exists.

**4. A container is not a lightweight VM. It's a process with different tables.** Five namespaces, a
cgroup, and `pivot_root` — assembled by hand in §46.7. Docker's real contributions are the image
format, the registry, and the *default* capability and seccomp restrictions, which are stronger than
what `unshare` gives you.

**5. Namespace membership is an inode comparison.** `readlink /proc/PID/ns/pid`. Two processes are in
the same namespace if and only if the numbers match — verified, `4026531836` outside and
`4026532209` inside.

**6. Docker group membership is root**, and now for a specific reason: the socket's permissions are
the entire authentication, and a `--privileged` container bind-mounting `/` has all capabilities and
no seccomp filter. Volume 2 §14.3's `disk` group, again.

**7. Build kernels with `make bindeb-pkg`, never `make install`** — because then Volume 4's dpkg
tracks it, Volume 6's hooks run `update-initramfs` and `update-grub`, DKMS rebuilds against it, and
`apt purge` removes it. And keep the old kernel until the new one boots.

**8. iptables was replaced for five concrete reasons**, not fashion: four tools duplicating kernel
code, non-atomic O(n) updates, a kernel module per match type, no native sets, and inconsistent
syntax. nftables answers each with one tool, transactions, a bytecode VM, and native sets. **Debian
10 made `iptables` a shim** — check with `iptables -V` for `(nf_tables)`, and remember `nft list
ruleset` is the authoritative view.

**9. A network namespace is the right place to learn firewalling**, because the blast radius is
exactly zero.

**10. And the synthesis holds up.** Four words — `sudo apt install cowsay` — traverse the line
discipline, expansion order, fork/exec, setuid, sudoers, env_reset, the dpkg database, an NP-complete
solver, DNS, routing, ARP, TCP, X25519, a hash chain, an `ar` archive, inode allocation, the page
cache, maintainer scripts, triggers, cgroups and the journal. **Every layer hides the one below,
every security control is a narrowing rather than an addition, and every single step is inspectable
with `cat` and `grep`.**

---

