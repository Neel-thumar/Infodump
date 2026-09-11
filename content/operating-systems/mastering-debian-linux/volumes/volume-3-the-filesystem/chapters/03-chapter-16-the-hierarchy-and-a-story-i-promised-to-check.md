# Chapter 16 — The Hierarchy, and a Story I Promised to Check

## 16.1 The hook

> **Why is a program in `/usr/bin` and its config in `/etc` and its log in `/var/log`, when they're
> all part of the same package? Why not one directory per program, like Windows and macOS do?**

## 16.2 THE PROBLEM: what do you split a filesystem *by*?

There are two coherent answers, and Unix picked the less obvious one.

**Split by application** — everything for a program in one place:
```
    /Applications/Firefox/{bin,config,logs,data}
```
Intuitive. Easy to uninstall. This is what macOS bundles and Windows `Program Files` do.

**Split by *properties of the data*** — group things that need the same *treatment*:
```
    /usr/bin      static, read-only, shareable, replaced by package upgrades
    /etc          small, edited by the admin, must be backed up, machine-specific
    /var/log      grows without bound, rotate it, don't back it up the same way
    /home         the only thing you actually can't recreate
```

Unix picked the second, and the reason is operational:

> **The four categories above want completely different disks, different backup policies, different
> mount options, and different upgrade behaviour.** If they're interleaved per-application, you can't
> express any of that.

Concretely, the second layout lets you:

- Mount `/usr` **read-only** (nothing in it should change between upgrades) — and even share one copy
  over NFS to a lab of machines.
- Put `/var` on a separate disk so a runaway log **cannot fill the root filesystem** and wedge the
  system.
- Back up `/etc` and `/home` and skip everything else, because everything else is reinstallable.
- Mount `/home` with **`nosuid,nodev`** so users can't stash setuid binaries there (Volume 2 §11.8,
  and §17.7 below).

The cost is real and worth naming: **a package's files are scattered across six directories**, so
you need a package manager to keep track. Which Debian has, and Volume 4 is about.

```bash
dpkg -L bash | head -20
dpkg -L bash | sed 's|/[^/]*$||' | sort -u | head
```

## 16.3 The map

FHS — the **Filesystem Hierarchy Standard** — is the written-down version.

> **Confidence: moderate-high.** It began as **FSSTND** in 1993, initiated by Daniel Quinlan, was
> renamed FHS with version 2.0 in the late 1990s, and version 3.0 was released in 2015 under the
> Linux Foundation. **Debian Policy chapter 9 requires Debian packages to comply with FHS**, with a
> short list of documented exceptions — which is a stronger commitment than most distributions make.

```bash
man hier                    # from the `manpages` package — the best summary there is
ls /
```

| Path | Contains | Why it's separate |
|---|---|---|
| **`/etc`** | configuration, **no binaries** | small, hand-edited, machine-specific, **must be backed up** |
| **`/usr`** | the bulk of the OS: `/usr/bin`, `/usr/lib`, `/usr/share` | **static and read-only** between upgrades; historically shareable over NFS |
| **`/usr/local`** | software **you** installed by hand | **§16.6 — the most useful rule in this chapter** |
| **`/var`** | logs, spool, caches, databases, `/var/lib` | **grows unboundedly**; wants its own disk and its own backup policy |
| **`/home`** | user data | **the only thing that isn't reinstallable** |
| **`/root`** | root's home | **deliberately not under `/home`** — so root can log in when `/home` fails to mount |
| **`/opt`** | self-contained third-party software, `/opt/vendor/...` | vendors who ship one tree and don't want to play by FHS |
| **`/srv`** | data this machine *serves* (web roots, ftp) | added in FHS 2.3; sparsely used in practice |
| **`/tmp`** | temporary, **may be wiped at boot** | world-writable + sticky (Volume 2 §10.6) |
| **`/var/tmp`** | temporary that **survives reboot** | the distinction most people don't know exists |
| **`/run`** | runtime state: PID files, sockets | **a tmpfs** — empty on every boot, by design |
| **`/boot`** | kernel, initramfs, GRUB | must be readable by the bootloader **before** LVM/LUKS come up (Volume 6) |
| **`/dev`, `/proc`, `/sys`** | devices and kernel state | **virtual** — no disk behind them (Ch 14) |
| **`/media`, `/mnt`** | auto-mounted removable / manual mounts | convention, not enforced |
| **`/lost+found`** | orphaned inodes recovered by `fsck` | **one per ext filesystem**, not one per system |

Two you can verify immediately:

```bash
ls -ld /var/run /var/lock
```

```
lrwxrwxrwx 1 root root 4 Apr 10 02:20 /var/run -> /run
lrwxrwxrwx 1 root root 9 Apr 10 02:20 /var/lock -> /run/lock
```

*(Verified.)* `/var/run` used to be a real directory on disk, which meant stale PID files survived a
crash and confused init scripts on the next boot. Moving it to a **tmpfs** at `/run` means it is
guaranteed empty at boot, every time. The old paths remain as symlinks so nothing breaks.

```bash
findmnt /run -o TARGET,SOURCE,FSTYPE,SIZE
ls /run
```

And find your `lost+found` directories — note there's one **per filesystem**, at each mount point:

```bash
sudo find / -maxdepth 3 -name 'lost+found' -type d 2>/dev/null
```

## 16.4 THE STORY: does `/usr` exist because a disk filled up?

I said in Volume 2's closing that I'd check this rather than repeat it. Here's what I found and how
confident I am in each part.

**The story as usually told:** at Bell Labs, the Unix root filesystem lived on an RK05 disk pack.
It filled up. So Thompson and Ritchie let the operating system spill onto the *second* pack — which
held **user home directories**, and was therefore mounted at `/usr`. They recreated `/bin`, `/lib`,
`/tmp` and so on underneath it. Later, a third disk arrived, home directories moved to `/home`, and
the OS kept both original packs — leaving `/usr/bin` and friends as a permanent fossil of a disk that
ran out of space around 1971.

Taking it apart:

| Claim | My assessment |
|---|---|
| **`usr` originally meant "user"** — home directories lived there | **Confidence: high.** Early Unix documentation shows home directories as `/usr/ken`, `/usr/dmr`. This part is solidly attested. |
| **"Unix System Resources"** | **Confidence: high that this is a later backronym**, not the origin. |
| An RK05 pack held roughly 2.5 MB | **Confidence: moderate-high.** Consistent with the hardware of the era. |
| **The specific causal narrative** (root filled → OS spilled onto the home disk → homes later moved to `/home`) | **Confidence: moderate.** Plausible, consistent with the hardware, and universally repeated — but see below. |

**The sourcing is the part worth knowing.** As far as I can tell, the detailed narrative traces
primarily to a **2010 post by Rob Landley to the BusyBox mailing list**, arguing against the
`/bin` versus `/usr/bin` split. It is a well-argued reconstruction by someone who knows the history,
and essentially every retelling since — including in distribution documentation — descends from it.

**What I have not found is a contemporaneous primary document** — a memo, a paper, or a direct
quotation from Thompson or Ritchie — stating the disk-full causation. That doesn't make it false. It
does mean the honest description is *"a widely-accepted account with a single well-known modern
source"* rather than *"a documented fact."*

> **So: use the story, but say "the usual account is" rather than "what happened was."** The `usr` =
> `user` etymology you can state flatly. The disk-full causation you should hedge.

## 16.5 The coda: Debian undid the split

Here is the genuinely interesting part, and it happened recently enough that you can see it on your
own machine.

The `/bin` versus `/usr/bin` split outlived its original cause by fifty years — but it survived for
a *different* reason: **`/usr` might be a separate filesystem that isn't mounted yet.** So `/bin`
held the minimum needed to boot far enough to mount `/usr`, and to repair a system in single-user
mode. That's a real argument and it held for decades.

**Then initramfs made it obsolete.** A modern boot unpacks an initramfs into RAM containing
everything needed to find and mount the real root — including `/usr` — *before* `init` ever runs
(Volume 6 covers this in detail). By the time anything in `/bin` executes, `/usr` is already there.
The split now protects against nothing.

So Debian merged them:

```bash
ls -ld /bin /sbin /lib /lib64 2>/dev/null
```

```
lrwxrwxrwx 1 root root 7 Apr 22  2024 /bin -> usr/bin
lrwxrwxrwx 1 root root 8 Apr 22  2024 /sbin -> usr/sbin
lrwxrwxrwx 1 root root 7 Apr 22  2024 /lib -> usr/lib
```

*(Verified.)* **`/bin` is a symlink.** There is exactly one directory; the old path still resolves.

```bash
readlink -f /bin/ls
ls -li /bin/ls /usr/bin/ls        # same inode — it's literally the same file
```

> **Confidence: moderate-high** that merged-`/usr` is standard for Debian 12 (bookworm), having been
> the default for new installs somewhat earlier; **moderate** on the further plan to merge
> `/usr/sbin` into `/usr/bin` in a later release. Your own `ls -ld` output is authoritative for your
> machine.

> **This is a nice arc to notice.** A split created by a hardware limitation in 1971, preserved for a
> boot-ordering reason through the 1990s and 2000s, and finally removed in the 2020s when that second
> reason evaporated. **Debian did not remove it when the first reason went away, because there was
> still a second one.** That's how infrastructure actually ages.

## 16.6 `/usr/local`: the most useful rule in this chapter

**Debian Policy forbids packages from installing anything into `/usr/local`.** It is reserved
entirely for the local system administrator — you.

> **Confidence: high.** This is Debian Policy §9.1.2. Packages may create empty directories there,
> but must not place files in them.

The practical consequence:

| You did | Put it in | Because |
|---|---|---|
| `apt install foo` | `/usr/bin/foo` | dpkg owns it; upgrades manage it |
| `./configure && make install` | **`/usr/local/bin/foo`** ← the default | **no package will ever overwrite it** |
| Vendor tarball, self-contained | `/opt/vendor/` | it wants its own tree |
| A script you wrote | `~/bin` (Volume 1 §6.2) or `/usr/local/bin` | yours vs system-wide |

And this is why `/usr/local/bin` comes **before** `/usr/bin` in your `$PATH`:

```bash
echo "$PATH" | tr ':' '\n' | nl
```

```
     1	/usr/local/bin
     2	/usr/bin
     3	/bin
```

**Your locally installed software deliberately shadows the packaged version** (Volume 1 §2.5's search
order, now with a purpose). Install a newer `python3` into `/usr/local/bin` and it wins — without
fighting dpkg, and without a package upgrade silently reverting you.

```bash
ls /usr/local/bin /usr/local/lib /usr/local/share 2>/dev/null
dpkg -S /usr/local/bin/* 2>&1 | head -3     # dpkg owns nothing here
```

## 16.7 `/etc` — and Debian's opinion about it

```bash
ls /etc | head -20
find /etc -type f | wc -l
find /etc -type d -name '*.d' | head -10
```

Two conventions worth knowing:

**The `.d` directory pattern.** Rather than one monolithic config file that every package fights
over, Debian favours a directory of drop-in fragments:

```bash
ls /etc/apt/sources.list.d/ /etc/sudoers.d/ /etc/systemd/system/ 2>/dev/null
```

You met this with `/etc/sudoers.d/` in Volume 2 §11.5. The advantage is that a package can add and
remove *its own* file without ever parsing or editing yours.

**Conffiles.** Debian tracks which files in `/etc` are configuration, and `dpkg` will **not silently
overwrite one you've edited** — it asks. That's Volume 4's material, but you can see the registry
now:

```bash
dpkg-query -W -f='${Conffiles}\n' bash | head
grep -c . /var/lib/dpkg/info/*.conffiles 2>/dev/null | head -5
```

**And FHS says `/etc` contains no binaries:**

```bash
find /etc -maxdepth 2 -type f -executable | head
```

You'll find shell scripts (init scripts, network hooks) but no compiled programs. Scripts are
configuration in a real sense; binaries belong in `/usr`.

---

