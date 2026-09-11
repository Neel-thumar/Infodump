# Chapter 36 — systemd: The Problem It Was Built to Solve

## 36.1 The hook

> **SysVinit booted Unix machines for roughly thirty years. It is simple, it is shell scripts, and
> everybody understood it.**
>
> **In about four years, essentially every major Linux distribution replaced it — over loud
> objection.**
>
> **What was actually wrong with it? Not "it was old." What specifically failed?**

## 36.2 THE PROBLEM: five concrete failures

SysVinit's model was:

```
   /etc/inittab              defines runlevels
   /etc/init.d/apache2       a shell script taking start|stop|restart|status
   /etc/rc2.d/S20apache2  →  ../init.d/apache2      a SYMLINK, named for ORDER
   /etc/rc2.d/K20apache2  →  ../init.d/apache2      the Kill link for shutdown
```

At boot, `rc` ran every `S*` link in the current runlevel's directory **in lexical order, one at a
time, waiting for each to finish**.

You may still have the remnants:

```bash
ls /etc/init.d/ 2>/dev/null
ls /etc/rc2.d/ 2>/dev/null
runlevel 2>/dev/null
```

> **A Debian-specific note on runlevels:** Red Hat used runlevel 3 for multi-user text and 5 for
> graphical. **Debian traditionally used runlevel 2 as its default and made 2 through 5 identical**,
> configuring the display manager separately. So cross-distribution runlevel advice has always been
> wrong on Debian. **Confidence: moderate-high.**

Here is what actually broke.

### Failure 1 — strictly sequential, and mostly *waiting*

Sixty init scripts, run one after another. But look at what each one spends its time on:

| Script does | Time | CPU busy? |
|---|---|---|
| start a daemon | 20 ms | briefly |
| **wait for the network interface to get a DHCP lease** | **2–5 s** | **no** |
| **wait for a daemon to write its PID file** | **0.5 s** | **no** |
| **wait for a disk to be ready** | **1 s** | **no** |

**Most of a SysVinit boot is one CPU core idling while a single script blocks.** The other cores do
nothing. Twelve seconds of boot time might contain half a second of computation.

### Failure 2 — ordering encoded in filenames

`S20apache2` means "twentieth." Insert something between 20 and 21 and you renumber. Debian
mitigated this properly with **`insserv`** and **LSB dependency headers** — the block at the top of
every init script:

```bash
head -12 /etc/init.d/* 2>/dev/null | head -20
```

```
### BEGIN INIT INFO
# Provides:          apache2
# Required-Start:    $local_fs $remote_fs $network
# Required-Stop:     $local_fs $remote_fs $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
### END INIT INFO
```

That is a **declared dependency graph**, and `insserv` computed the `S##` numbers from it. Debian
solved the *authoring* problem years before systemd. **But the runtime was still sequential** —
knowing the correct order doesn't help if you can only do one thing at a time.

> **Worth being fair about: Debian had already done real work here.** `insserv`, LSB headers, and
> `startpar` (which ran independent scripts concurrently) meant Debian's SysVinit was considerably
> better than the caricature. The remaining failures are the ones that couldn't be fixed by bolting
> more on.

### Failure 3 — PID files, and Volume 2's debt comes due

This is the strongest technical failure, and Volume 2 §12.2 set it up.

A daemon starts, **double-forks** to detach from the terminal, and writes its final PID to
`/run/apache2.pid`. Init reads that file to manage it.

```bash
ls /run/*.pid 2>/dev/null | head
```

Volume 2 §12.2 established, and verified, that **`pid_max` is 32768** and PIDs are reused. So:

```
   1. apache2 starts, PID 4021, writes /run/apache2.pid containing "4021"
   2. the machine crashes.  The PID FILE SURVIVES on disk.
   3. reboot.  PIDs are allocated from 1 again.
   4. eventually some unrelated process — your text editor — is assigned PID 4021
   5. you run:  /etc/init.d/apache2 stop
   6. init reads the stale PID file, gets 4021, and SIGTERMs YOUR EDITOR
```

**And there is no reliable fix**, because there's no way to ask "is PID 4021 the process that wrote
this file?" A creation timestamp comparison is a heuristic, not an answer.

It gets worse for daemons that fork children:

```
   init knows ONE PID — the one in the file.
   The daemon's twelve worker processes are invisible to init.
   `stop` kills the parent.  The twelve workers keep running, orphaned,
   reparented to PID 1 (Volume 2 §12.5), still holding the port.
   Then `start` fails because the port is in use.
```

**Every experienced Linux administrator has debugged that.** It is not a rare edge case; it is the
normal failure mode of PID-file supervision.

### Failure 4 — no way to say "start when needed"

Every service that might conceivably be used had to start at boot, because there was no mechanism
for lazy activation. A machine with a rarely-used CUPS printing daemon paid its startup cost on every
single boot.

### Failure 5 — every script reimplemented everything

Start, stop, restart, reload, status, PID file handling, privilege dropping, output redirection,
`nice` levels, `ulimit`s — **50 to 200 lines of shell per service**, written independently, behaving
subtly differently. Debian shipped `start-stop-daemon` to factor out the worst of it, which helped
and did not solve it.

```bash
wc -l /etc/init.d/* 2>/dev/null | tail -5
```

## 36.3 THE MECHANISM: five answers

| Failure | systemd's answer |
|---|---|
| 1. sequential | **dependency graph + aggressive parallelism** |
| 2. filename ordering | declared `Before=`/`After=`, order computed |
| 3. **PID files** | **cgroups** — §36.5 |
| 4. no lazy start | **socket activation** — §36.4 |
| 5. shell boilerplate | **declarative unit files** — 10 lines of ini |

### Parallelism

systemd builds a directed graph of units and dependencies, then starts everything whose
prerequisites are met — **concurrently**. Instead of 60 scripts × mostly-waiting, you get 60 units
starting as soon as each becomes eligible, with the CPU and the I/O queue actually saturated.

Measure your own:

```bash
systemd-analyze
systemd-analyze blame | head -15
systemd-analyze critical-chain
```

*(Describing.)*

```
Startup finished in 3.107s (firmware) + 2.891s (loader) + 1.204s (kernel)
                    + 2.847s (userspace) = 10.051s
graphical.target reached after 2.834s in userspace
```

> **`systemd-analyze blame` and `critical-chain` answer different questions**, and the difference is
> the whole point of the parallelism:
>
> - **`blame`** sorts units by **how long each took**. A unit taking 8 seconds looks terrible.
> - **`critical-chain`** shows the **longest dependency path** — the chain that actually determined
>   your boot time.
>
> **A slow unit that nothing waits for costs you nothing.** Optimising the top of `blame` is often
> pointless; optimising `critical-chain` is what shortens the boot.

### Declarative units

Compare Failure 5's 150 lines of shell with:

```ini
[Unit]
Description=A demonstration service
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mydaemon --foreground
Restart=on-failure
User=mydaemon

[Install]
WantedBy=multi-user.target
```

Nine meaningful lines, and you get start, stop, restart, status, automatic restart on failure,
privilege dropping, and log capture — **none of which you wrote.**

**And you can validate a unit file without a running systemd** *(verified — this genuinely works
offline)*:

```bash
mkdir -p /tmp/units
cat > /tmp/units/demo.service <<'EOF'
[Unit]
Description=A demonstration service
After=network.target
Wants=network.target
[Service]
Type=simple
ExecStart=/bin/sleep 3600
[Install]
WantedBy=multi-user.target
EOF
systemd-analyze verify /tmp/units/demo.service && echo "  valid (no output = no problems)"

cat > /tmp/units/bad.service <<'EOF'
[Unit]
Description=Broken
[Service]
Type=nonsense
ExecStart=/bin/true
EOF
systemd-analyze verify /tmp/units/bad.service
rm -rf /tmp/units
```

```
  valid (no output = no problems)
/tmp/units/bad.service:4: Failed to parse service type, ignoring: nonsense
```

*(Both verified.)* This is `visudo` for units (Volume 2 §11.5), `sshd -t` for units (Volume 5
§30.9), `findmnt --verify` for units (Volume 3 §17.5). **Same lesson, fourth mechanism: validate
before you activate.**

## 36.4 Socket activation — Volume 5's debt

Volume 5 §29.3 called this "the elegant one" and deferred. Here it is.

> **systemd creates the listening socket itself, at boot, before the service starts.** Then it either
> starts the service immediately and hands over the file descriptor, or waits until a client
> connects and starts it then.

```bash
systemctl list-units --type=socket
systemctl cat ssh.socket 2>/dev/null
```

```ini
[Socket]
ListenStream=22
Accept=no

[Install]
WantedBy=sockets.target
```

**Two consequences, and the first is deeper than it looks.**

**Consequence 1 — ordering between services largely stops mattering.**

```
   Service A talks to service B over a socket.

   WITHOUT socket activation:
      A must not start until B is listening
      → you must DECLARE that dependency
      → and B's startup blocks A's
      → and if you get the declaration wrong, you get a race that
        manifests once a month on a slow disk

   WITH socket activation:
      systemd creates B's socket FIRST, before either service runs
      → A connects immediately, whenever it likes
      → the connection sits in the ACCEPT QUEUE (Volume 5 §29.2)
      → B starts whenever it gets round to it, inherits the socket,
        and finds A's connection already waiting
      → NO ORDERING DEPENDENCY IS NEEDED AT ALL
```

**The accept queue absorbs the race.** That's the trick — and it's the single largest source of
systemd's parallelism, because it removes dependencies rather than merely satisfying them faster.

**Consequence 2 — the privileged bind moves out of the service.**

Volume 5 §29.3 showed that binding port 80 requires root or `CAP_NET_BIND_SERVICE`. With socket
activation:

```
   PID 1 (root) calls socket() + bind(80) + listen()      ← the privileged part
        │
        │  fork(), setuid(www-data), execve()
        │  ↑ the file descriptor SURVIVES execve  (Volume 1 §2.7)
        ▼
   the service starts as an UNPRIVILEGED USER,
   already holding a listening socket on port 80,
   and never had any privilege at all
```

> **That is Volume 1 §2.7's "what survives exec" table doing real security work.** Open file
> descriptors survive `execve()`; privileges are dropped before it. So the capability to bind a
> privileged port is exercised once, by PID 1, and the *result* — not the *permission* — is what the
> service receives.

```bash
systemctl show ssh.socket -p Listen -p Accept 2>/dev/null
sudo ss -tlnp | grep -i systemd 2>/dev/null
```

## 36.5 cgroups — and Volume 2's PID-reuse debt, finally paid

§36.2's Failure 3 is the one that couldn't be patched. systemd's answer doesn't improve PID-file
handling; it **eliminates the concept**.

> **Every service gets its own control group. Every process it forks inherits that cgroup and cannot
> escape it** — however many times it double-forks, whatever it does with `setsid()`.

Which turns three unanswerable questions into lookups:

| Question | SysVinit | systemd |
|---|---|---|
| Is the service running? | read a PID file, hope | **does its cgroup contain processes?** |
| What processes belong to it? | **unanswerable** | **list the cgroup** |
| How do I stop all of it? | kill the PID in the file and pray | **signal every process in the cgroup** |
| Does PID reuse matter? | **yes, dangerously** | **no. Tracking is by cgroup membership.** |

See it:

```bash
systemd-cgls
systemd-cgls /system.slice 2>/dev/null | head -20
systemctl status ssh 2>/dev/null
```

*(Describing.)* `systemctl status` shows the cgroup and **every process in it**:

```
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled)
     Active: active (running) since Wed 2026-09-10 09:12:03 UTC; 4h ago
   Main PID: 812 (sshd)
      Tasks: 3 (limit: 9403)
     Memory: 5.2M
        CPU: 214ms
     CGroup: /system.slice/ssh.service
             ├─812 sshd: /usr/sbin/sshd -D [listener]
             ├─4127 sshd: vishal [priv]
             └─4139 sshd: vishal@pts/0
```

**`Tasks: 3` and three processes listed.** No PID file was consulted. And `systemctl stop ssh` will
signal all three — there is no orphan case.

The same mechanism gives resource control for free, because that's what cgroups were built for:

```bash
systemd-cgtop 2>/dev/null            # like top, but per-service
systemctl show ssh -p MemoryMax -p CPUQuota -p TasksMax 2>/dev/null
```

```ini
[Service]
MemoryMax=512M
CPUQuota=50%
TasksMax=100
```

> **This is the argument that won**, and it's worth saying plainly: even people who dislike systemd
> for other reasons generally concede the cgroup-based supervision point. It solved a real,
> longstanding, unfixable-in-place problem — and Volume 2 §12.2's PID-reuse hazard, which I flagged
> there as "a real hazard," is simply not a hazard for systemd-managed services.

Volume 8 covers cgroups properly, since they're also what containers are built from.

## 36.6 Units, and the mistake everybody makes once

```bash
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service | head -20
systemctl cat ssh.service 2>/dev/null
systemctl show ssh.service 2>/dev/null | head -30
```

Unit types:

| Suffix | Manages |
|---|---|
| `.service` | a process |
| `.socket` | a listening socket (§36.4) |
| **`.target`** | **a synchronisation point** — replaces runlevels |
| `.mount` / `.automount` | a mount point; **generated from `/etc/fstab`** |
| `.timer` | scheduled activation — Volume 7's cron replacement |
| `.path` | activation on filesystem change |
| `.device` | a device, from udev |
| `.slice` / `.scope` | cgroup hierarchy for resource control |

> **`.mount` units are generated from your `fstab`**, which is a nice illustration of how systemd
> absorbed existing configuration rather than replacing it:
>
> ```bash
> systemctl list-units --type=mount
> systemctl cat -- '-.mount' 2>/dev/null | head -20
> ```

### The Requires/After distinction

```bash
systemctl list-dependencies multi-user.target | head -20
systemctl list-dependencies --reverse ssh.service 2>/dev/null
```

| Directive | Axis | Means |
|---|---|---|
| **`Requires=`** | **whether** | pull it in; **fail if it fails** |
| **`Wants=`** | **whether** | pull it in; **carry on if it fails** |
| `BindsTo=` | whether | stronger — **stop if it stops** |
| **`After=` / `Before=`** | **when** | ordering **only** |
| `Conflicts=` | exclusion | can't both be active |
| `PartOf=` | propagation | stop/restart cascade downward |

> **These two axes are orthogonal, and confusing them is the single most common systemd authoring
> mistake.**
>
> `Requires=postgresql.service` **without** `After=postgresql.service` says: *"start postgres too,
> but I don't care when."* systemd will start them **in parallel** — and your service will try to
> connect to a database that isn't listening yet.
>
> It will work on your laptop, where postgres starts in 200 ms, and fail intermittently on a loaded
> server. **Almost always you want both directives**, and `Wants=` + `After=` is the usual safe
> pairing, since it degrades rather than cascading failures.

### Overriding without editing

```bash
systemctl edit ssh.service              # creates a DROP-IN, doesn't touch the package's file
systemctl cat ssh.service               # shows the package unit AND all drop-ins
ls /etc/systemd/system/*.d/ 2>/dev/null
```

`systemctl edit` writes to `/etc/systemd/system/ssh.service.d/override.conf`. **The package's file
in `/lib/systemd/system/` is never touched**, so upgrades don't conflict.

> **Same pattern, fifth appearance:** `/etc/sudoers.d` (Volume 2 §11.5), `/etc/apt/sources.list.d`
> (Volume 4 §23.7), `/etc/ssh/sshd_config.d` (Volume 5 §30.9), `/etc/grub.d` (§33.4), and now
> `/etc/systemd/system/*.d`. **Debian's answer to "how do I change a package's config without
> fighting the package manager" is always a drop-in directory.**

### Targets replace runlevels

| SysV runlevel | systemd target |
|---|---|
| 0 | `poweroff.target` |
| 1 | `rescue.target` |
| **2–5 (Debian)** | **`multi-user.target`** |
| 5 | `graphical.target` |
| 6 | `reboot.target` |
| — | **`emergency.target`** — more minimal than rescue: root shell, read-only root, almost nothing started |

```bash
systemctl get-default
systemctl list-units --type=target
```

`emergency.target` is the systemd equivalent of §33.5's `init=/bin/bash` trick, and you reach it by
appending `systemd.unit=emergency.target` to the kernel command line at the GRUB menu. Worth knowing
before you need it.

## 36.7 journald

> **THE PROBLEM with text logs.** `/var/log/syslog` is a sequence of lines. To find "all errors from
> `sshd` during the previous boot," you `grep`, then parse timestamps yourself, then work out where
> the previous boot ended — and every program's line format is different.

journald stores **structured records** instead of lines. Each entry is a set of key-value fields, and
much of the metadata is captured by journald rather than supplied by the program:

```bash
journalctl -o json-pretty -n 1
```

*(Describing.)*

```json
{
    "__REALTIME_TIMESTAMP" : "1789025707123456",
    "_BOOT_ID" : "a1b2c3d4e5f6...",
    "_UID" : "0",
    "_PID" : "812",
    "_COMM" : "sshd",
    "_SYSTEMD_UNIT" : "ssh.service",
    "_SYSTEMD_CGROUP" : "/system.slice/ssh.service",
    "PRIORITY" : "6",
    "SYSLOG_IDENTIFIER" : "sshd",
    "MESSAGE" : "Accepted publickey for vishal from 192.0.2.5 port 51234"
}
```

> **Note which fields begin with an underscore.** Those are **trusted** — journald obtained them from
> the kernel via the socket's peer credentials, not from what the program claimed. So `_PID`, `_UID`,
> `_COMM` and `_SYSTEMD_UNIT` cannot be forged by the logging process.
>
> With classic syslog, a program says *"I am sshd"* and syslog writes it down. **With journald, the
> kernel says who the sender is.** That's a genuine security improvement and it's rarely mentioned.
>
> **Confidence: moderate-high** on the peer-credential mechanism.

Which makes queries into queries rather than `grep`:

```bash
journalctl -b                        # this boot
journalctl -b -1                     # PREVIOUS boot — see §36.8's Debian gotcha
journalctl -u ssh --since "1 hour ago"
journalctl -p err -b                 # priority error and above
journalctl -k                         # kernel only — equivalent to dmesg
journalctl _UID=1000                  # everything from your user
journalctl -f                          # follow, like tail -f
journalctl --disk-usage
journalctl --verify
journalctl --list-boots
```

## 36.8 Debian's systemd, specifically — including one real gotcha

> **Confidence: high** on jessie being the switch; **moderate-high** on the journal-persistence
> default.

**Debian 8 (jessie, 2015) made systemd the default init.** The packaging keeps the alternatives real:

```bash
dpkg -l systemd systemd-sysv sysvinit-core 2>/dev/null | tail -4
ls -l /sbin/init
```

| Package | Role |
|---|---|
| `systemd` | the binaries |
| **`systemd-sysv`** | **provides `/sbin/init`** — this is what makes it the init |
| `sysvinit-core` | **still available**; installing it swaps the init back |
| `orphan-sysvinit-scripts` | init scripts for packages that dropped them |

**And your old init scripts still work**, via a generator:

```bash
ls /etc/init.d/ 2>/dev/null
systemctl list-units --type=service | grep -i 'LSB:' 2>/dev/null
systemctl cat <some-lsb-service> 2>/dev/null | head
```

`systemd-sysv-generator` reads `/etc/init.d/*`, parses the **LSB headers from §36.2's Failure 2**,
and synthesises a unit at boot. Debian's decade of LSB dependency annotation turned out to be
exactly the metadata systemd needed.

**Debian also declines several optional systemd components** (Volume 5 §27.4 hit this):

```bash
systemctl is-active systemd-resolved systemd-networkd systemd-timesyncd 2>/dev/null
```

Debian generally leaves these disabled in favour of NetworkManager / `ifupdown` / `ntpsec`, where
Ubuntu enables them. **This is the single largest source of Debian-versus-Ubuntu advice mismatch.**

### The gotcha: your journal is probably not persistent

```bash
ls -ld /var/log/journal 2>/dev/null || echo "  /var/log/journal does NOT exist"
grep -iE '^\s*#?\s*Storage' /etc/systemd/journald.conf
journalctl --list-boots 2>/dev/null | head -3
```

journald's `Storage=` default is **`auto`**, which means: *persist to `/var/log/journal` if that
directory exists; otherwise keep logs only in `/run/log/journal`* — which is a **tmpfs** (Volume 3
§17.6), and therefore **lost at every reboot.**

> **On a default Debian install, `/var/log/journal` does not exist.** So `journalctl -b -1` — "show
> me the previous boot," which is exactly what you want after an unexplained crash — **fails**,
> because there is no previous boot on disk.
>
> **Confidence: moderate-high** on this being Debian's default. Your `ls -ld /var/log/journal` above
> settles it for your machine.

Fix it now, before you need it:

```bash
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
journalctl --list-boots
```

Or explicitly, in `/etc/systemd/journald.conf.d/persistent.conf` — a drop-in, per §36.6:

```ini
[Journal]
Storage=persistent
SystemMaxUse=500M
```

**And note Debian runs `rsyslog` as well**, so you have both:

```bash
systemctl is-active rsyslog 2>/dev/null
ls -l /var/log/syslog /var/log/auth.log 2>/dev/null
```

That's Debian hedging deliberately: journald's structured queries **and** traditional text logs that
`grep`, `logrotate` and every existing tool understand. It costs some disk and it means the "binary
logs" objection (§37.3) largely doesn't bite Debian users.

---

