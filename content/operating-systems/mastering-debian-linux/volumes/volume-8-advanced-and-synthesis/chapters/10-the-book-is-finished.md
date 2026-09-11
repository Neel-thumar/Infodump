# The Book Is Finished

**File: `volume-8-advanced-and-synthesis.md`**

Eight volumes, fifty chapters, and a machine you can now read.

## What ran through all of it

**Six incidents, one shape.** Shellshock's `() {` prefix, Steam's empty variable, Baron Samedit's
trailing backslash, ext4's write-that-wasn't, Debian's 32,768 keys, Kaminsky's transaction ID,
regreSSHion's signal handler, and Toy Story 2's backup. Every one is the same failure: **something
was assumed to guarantee a property it never actually provided**, and the code behaved perfectly
right up until it mattered. That pattern is worth more than any individual fact in this book.

**Debian's answer to "how do I change this without fighting the package manager" is always a drop-in
directory.** `/etc/sudoers.d`, `/etc/apt/sources.list.d`, `/etc/ssh/sshd_config.d`, `/etc/grub.d`,
`/etc/systemd/system/*.d`, `/etc/modprobe.d`, `/etc/sysctl.d`. Seven appearances, one idea.

**And there's a validation tool for every file that can lock you out.** `visudo`,
`findmnt --verify`, `sshd -t`, `systemd-analyze verify`, `systemd-analyze calendar`, `shellcheck`,
`nft -c`. **Use them.** The whole category exists because people learned the hard way, repeatedly.

**A bit that is set is not a bit that is honoured.** `chown` strips setuid silently; the kernel
ignores it on scripts; `nosuid` disables it wholesale. The `s` in `ls -l` means "this bit is set,"
not "this will work."

## On being wrong

Something worth saying plainly, because it shaped the book.

I was wrong repeatedly while writing this, and caught it only by running the commands. `/proc/PID/environ`
turned out to be a snapshot rather than live state. `chown` silently stripped a setuid bit I'd set in
the wrong order. `fs.protected_symlinks` didn't have the uniform default I expected. In Volume 7 my
test harness for `set -e` was disabled by the very rule it was testing — and then, twenty minutes
after documenting that class of bug, I wrote one into the capstone script.

Every one of those is still in the text, with the mistake visible.

> **That's the actual method, and it's the most transferable thing here.** The documentation tells you
> what should happen. `/proc`, `strace`, `stat`, `nft list ruleset` and `echo $?` tell you what does.
> **When they disagree, the machine is right.**

You now have the tools to check anything in this book on your own system. Several claims here carry
confidence flags precisely because I couldn't verify them in my environment and you can in yours.
**Go and check them.** Finding one of them wrong would be the best possible outcome.

## What to do next

Install Debian in a VM. Break it — corrupt `/etc/fstab`, remove yourself from `sudo`, ship a bad
initramfs, write a firewall rule that locks you out. Then recover it, using `init=/bin/bash`,
`emergency.target`, and a rescue USB.

**You will learn more from one system you broke and fixed than from a second reading of this.**

```bash
cowsay "Good luck."
```
