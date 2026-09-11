# Chapter 49 — The Synthesis: One Command, Eight Volumes

## 49.1 The hook

> **`sudo apt install cowsay`**
>
> **Four words. Roughly three seconds. Every single mechanism in this book.**

Let's trace it. Every step names the volume that explained it, and most have a command that lets you
watch that step happen.

## 49.2 The trace

### Steps 1–3: getting the command into bash

**1. Your keystrokes go to the kernel, not to bash.** (Volume 1 §2.3)

The terminal emulator holds a pty master; bash reads the slave. Between them sits the **line
discipline** — kernel code that handles Backspace and turns Ctrl+C into SIGINT. Except bash has
switched it into raw mode so readline can do arrow keys, and will switch it back before running
anything.

```bash
tty; stty -a | head -2
```

**2. Enter. Bash expands, in a defined order.** (Volume 1 §2.4)

Brace, tilde, parameter, command substitution, **word splitting**, globbing, quote removal. Nothing
here needs it — but this is where `"$var"` would have mattered, and where Volume 1 §7.6's Steam bug
lived.

**3. Bash resolves `sudo`.** (Volume 1 §2.5)

Alias → function → builtin → `$PATH`, left to right, first match wins, result cached in the hash
table.

```bash
type -a sudo; hash
```

### Steps 4–6: becoming root

**4. `fork()` — which is really `clone`, syscall 56.** (Volume 1 §2.6, §44.4)

Bash duplicates itself copy-on-write. The child gets the same memory, descriptors, environment and
working directory; only the return value differs.

**5. `execve()`, syscall 59.** (Volume 1 §2.7, §44.4)

The child's memory image is discarded and `/usr/bin/sudo` is mapped in. **The PID survives; the
program doesn't.** Open file descriptors survive too — which §46 and Volume 6 §36.4 both turned into
security mechanisms.

**6. The setuid bit fires.** (Volume 2 §11.3)

```bash
ls -l /usr/bin/sudo
```

```
-rwsr-xr-x 1 root root ... /usr/bin/sudo
```

At `execve` time the kernel sets the **effective UID to 0** while leaving the **real UID** as yours.
Volume 2 §11.3 showed this split with a setuid copy of `id` returning two different answers.

### Steps 7–9: sudo decides, and discards your world

**7. Policy check.** (Volume 2 §11.5) `/etc/sudoers` is consulted, your group membership checked
against `%sudo ALL=(ALL:ALL) ALL`.

**8. `env_reset` and `secure_path`.** (Volume 2 §11.6)

> **sudo throws your entire environment away** and substitutes its own `$PATH`. Volume 1 §7's
> Shellshock exploited transparent environment inheritance; Volume 1 §2.5's trojan exploited `$PATH`
> order. **sudo refuses to trust either** — allowlist, not blocklist.

```bash
FOO=bar sudo env | grep -c '^FOO=' || echo "stripped"
sudo sh -c 'echo "$PATH"'
```

**9. It's logged, with your name.** (Volume 6 §36.7)

```bash
sudo journalctl -t sudo -n 3 --no-pager
```

Not "someone became root." **You, your tty, your working directory, the exact command.** That was
Volume 2 §11.4's strongest argument for the sudo model over a shared root password.

### Steps 10–12: apt thinks

**10. apt reads its configuration.** (Volume 3 §14, §18)

`open()`, `read()`, `close()` — syscalls 257, 0, 3 — against `/etc/apt/sources.list`, the
`sources.list.d` drop-ins, and `/var/lib/dpkg/status`. That last file is **plain text you can grep**
(Volume 4 §21.4), 25,000 lines of RFC-822 stanzas.

```bash
grep -c '^Package:' /var/lib/dpkg/status
```

**11. Dependency resolution.** (Volume 4 §23.2)

apt must find a set of package versions satisfying every `Depends`, violating no `Conflicts`, keeping
everything installed still satisfiable. **This is NP-complete** — reducible from 3-SAT — over roughly
60,000 packages, and it finishes before you've read the prompt.

```bash
apt-cache stats | head -5
apt-get -s install cowsay
```

**12. `Recommends` are pulled in too**, because that's Debian's default (Volume 4 §23.3).

### Steps 13–17: the network

**13. Name resolution.** (Volume 5 §27.4)

`getaddrinfo("deb.debian.org")` → NSS → `/etc/nsswitch.conf` → `files` then `dns` → your resolver →
possibly a full delegation walk from the root servers.

```bash
grep '^hosts:' /etc/nsswitch.conf
getent hosts deb.debian.org
```

**14. Routing decision.** (Volume 5 §26.5) `(dest & mask) == (mine & mask)`? No → the default route.

```bash
ip route get "$(getent hosts deb.debian.org | awk '{print $1; exit}')"
```

**15. ARP for the gateway's MAC.** (Volume 5 §26.6) The IP header names the server; the **ethernet
header names your router**, and will be rewritten at every hop.

**16. TCP handshake, then TLS.** (Volume 5 §28.6–28.7)

SYN, SYN-ACK, ACK. Then **X25519 ephemeral key exchange** — Volume 5 §30.5's Diffie–Hellman on a
curve, which you verified by hand with `p=23, g=5` — and certificate validation against
`/etc/ssl/certs/ca-certificates.crt`, **which arrived via apt** (Volume 5 §28.7).

```bash
curl -s -o /dev/null -w 'dns %{time_namelookup}s  tcp %{time_connect}s  tls %{time_appconnect}s\n' \
  https://deb.debian.org/
```

**17. Signature verification.** (Volume 4 §23.6)

`InRelease` is PGP-signed and contains SHA256 hashes of `Packages`; `Packages` contains the SHA256 of
each `.deb`. **One signature covers the whole archive transitively.** Tamper anywhere and a hash
fails.

```bash
head -12 /var/lib/apt/lists/*InRelease 2>/dev/null
```

### Steps 18–22: dpkg does the work

**18. The `.deb` is opened.** (Volume 4 §22.3)

An **`ar` archive** with three members in a mandated order: `debian-binary`, `control.tar.*`,
`data.tar.*`.

```bash
apt download cowsay && ar t cowsay_*.deb && dpkg-deb -c cowsay_*.deb | head -5
```

**19. Files are written.** (Volume 3 §15, §19; Volume 2 §10)

Each file gets an **inode** — mode bits, owner, timestamps, block pointers, link count. The data
lands in the **page cache as dirty pages** and reaches the disk seconds later, which is Volume 3
§19's entire incident.

```bash
grep -E '^(Dirty|Writeback):' /proc/meminfo
```

**20. Maintainer scripts run as root.** (Volume 4 §21.6)

`preinst`, then unpack, then `postinst configure`. **Arbitrary root code from the internet** — which
is exactly why step 17 is not optional.

**21. Triggers fire.** (Volume 4 §21.8) `Processing triggers for man-db` — the index rebuilt once at
the end rather than per-package.

**22. For a service, systemd takes over.** (Volume 6 §36)

`daemon-reload`, the unit starts in **its own cgroup**, and every process it forks stays there — so
`systemctl stop` reaches all of them and Volume 2 §12.2's PID-reuse hazard never applies.

```bash
systemd-cgls /system.slice 2>/dev/null | head -10
```

### Steps 23–24: afterwards

**23. All of it is in the journal.** (Volume 6 §36.7) With trusted `_PID`, `_UID` and `_SYSTEMD_UNIT`
fields the kernel supplied, not the program.

**24. And next Sunday at 04:00** — plus up to 30 minutes of jitter — **`sysnap` records the change**
(Volume 7 §43): a new entry in `packages-manual.txt`, logged, and an alarm if it fails.

```bash
cowsay "eight volumes"
```

## 49.3 What the trace shows

Read back over those twenty-four steps and three things stand out.

**Every layer hides the one below, and that's what made it buildable.** `apt` doesn't know about
TCP; TCP doesn't know about ethernet; ethernet doesn't know about the files being written. Volume 5
§26.2's layering principle isn't a diagram in a textbook — it's why a single command can traverse
thirty years of independently-developed software without any of it coordinating.

**Every security control in the chain is a *narrowing*, not an addition.** setuid narrows *when*
privilege applies. `env_reset` narrows what's inherited. The hash chain narrows what counts as a
valid package. cgroups narrow what a process may consume. seccomp narrows which of 373 syscalls it
may make. **Nothing in the chain grants capability; everything restricts it** — which is the shape
of a system designed by people who assumed things would go wrong.

**And the whole thing is inspectable.** Every step above has a command. Not a debugger, not vendor
tooling — `cat`, `ls`, `grep` against `/proc` and `/sys` and plain-text databases. That is not an
accident either; it's Volume 3 §14's "everything is a file" cashed out over an entire operating
system.

---

