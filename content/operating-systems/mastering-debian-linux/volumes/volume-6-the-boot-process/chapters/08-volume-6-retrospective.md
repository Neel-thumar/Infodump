# Volume 6 Retrospective

**1. Bootstrapping is broken with hardware.** The CPU starts at a fixed reset vector aliased to a
flash chip, because that's the only code on the machine that doesn't need loading. Everything else in
the boot chain is a consequence of that one physical fact.

**2. Legacy BIOS gives a bootloader 440 bytes, and that single number explains GRUB's
architecture.** You cannot fit a filesystem driver in 440 bytes, so stage 1 loads stage 2 from a
**hardcoded sector number**, and stage 2 has the drivers to read stage 3 by path. UEFI deleted all of
that complexity by being able to read FAT32 — which is why the ESP exists, and why FAT32 was chosen
for interoperability rather than quality.

**3. Debian ships a Microsoft-signed file, and the reason is trust distribution, not technology.**
`shim` exists because consumer firmware ships Microsoft's CA and essentially nobody else's. Debian
signs its own GRUB and kernel; it just needs one universally-trusted stepping stone. And Secure Boot
plus kernel lockdown means **root is no longer absolute** — unusual, and a real departure from
Volume 2's model.

**4. GRUB's 28-backspace bug is a lesson about scrutiny, not about bounds checking.** Bootloader code
runs with full hardware access, before any memory protection, privilege separation, or supervisor
exists — every protection from Volumes 2 and 3 is *not yet running*. And BootHole showed the harder
problem: **signing is easy; revocation is where trust chains break**, because the revocation list
lives in space-limited NVRAM where a mistake bricks the machine.

**5. The initramfs exists because a modular kernel needs modules that live on the filesystem it's
trying to mount.** The fix moves the problem from the bootloader (no facilities) to userspace (all of
them) at the cost of a few megabytes. And it closes Volume 3's usr-merge debt precisely: once a
complete rescue environment runs before the real root, **"the minimal set of tools that works without
`/usr`" has no consumer.**

**6. `rdinit=` versus `init=` is the boot's sharpest boundary**, and my test machine happened to
demonstrate it — a real `/proc/cmdline` saying "never switch to a real root; just run this from the
initramfs, forever."

**7. LUKS's two-level key structure is derived, not arbitrary.** A random master key encrypts the
data; your passphrase only unlocks a *copy* of it in a keyslot. Which is why you can change a
passphrase instantly, have eight of them, and revoke one — **and why destroying the header destroys
the data permanently, even if you know the passphrase.**

**8. The passphrase prompt comes from the initramfs, in the unencrypted `/boot`** — which is the
whole of the evil-maid attack, and the reason Secure Boot and TPM sealing exist. And FDE protects
exactly one threat model: **the powered-off machine.** A sleeping laptop, a hibernate to unencrypted
swap, or an attacker with root on the running system all defeat it completely.

**9. XTS gives confidentiality and not integrity**, because a 512-byte sector must encrypt to 512
bytes and there's nowhere to put a MAC. Most explanations of disk encryption omit this.

**10. SysVinit's real failure was PID files, and cgroups eliminated the concept rather than improving
it.** Volume 2 §12.2's PID-reuse hazard — verified there, with `pid_max` at 32768 — is simply not a
hazard for a systemd service, because tracking is by cgroup membership. That's the argument that won,
and even systemd's critics concede it.

**11. Socket activation removes dependencies rather than satisfying them faster.** The accept queue
absorbs the race, so A can connect before B has started. And the privileged `bind()` happens in PID
1 while the service runs unprivileged — Volume 1 §2.7's "file descriptors survive `execve()`", doing
security work.

**12. `Requires=` and `After=` are orthogonal**, and confusing them produces a service that works on
your laptop and fails intermittently on a loaded server. Nearly always you want both.

**13. Your Debian journal is probably not persistent**, so the single most useful post-crash command
will fail. Fix it before you need it.

**14. And the systemd argument was never mainly about whether the core design was good.** It was
good, and it's vindicated. The serious objections were about **scope, coupling and governance** — and
udev's absorption and forking is the concrete proof that at least one of them was right. The
Unix-philosophy argument was the weakest and should be retired; the discussion was conducted badly by
both sides; and **Debian's nuanced answer — adopt the core, decline the optional parts, keep the
alternative installable, vote in public — was only expressible because of the governance machinery
in Volume 4 §20.5.**

---

