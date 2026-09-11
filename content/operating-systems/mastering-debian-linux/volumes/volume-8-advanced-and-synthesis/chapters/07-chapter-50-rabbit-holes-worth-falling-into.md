# Chapter 50 — Rabbit Holes Worth Falling Into

Things that didn't fit anywhere else and deserve to exist somewhere.

## 50.1 `/dev/full` — a device that is always out of space

```bash
ls -l /dev/full
echo "hello" > /dev/full; echo "exit status: $?"
```

```
crw-rw-rw- 1 root root 1, 7 /dev/full
bash: echo: write error: No space left on device
exit status: 1
```

*(Verified.)* **A character device whose only behaviour is to return `ENOSPC` on every write.** It
exists so you can test whether your software handles a full disk without filling one. Reading from it
returns an infinite stream of zero bytes, like `/dev/zero`.

```bash
ls -l /dev/null /dev/zero /dev/full /dev/random /dev/urandom
```

Four devices that do nothing, in four different ways, and every one is load-bearing somewhere.

## 50.2 Magic SysRq — the kernel's emergency console

```bash
cat /proc/sys/kernel/sysrq
```

```
1
```

*(Verified — `1` means all functions enabled.)* SysRq is a **direct line to the kernel** that works
even when userspace is completely wedged — no shell, no X, no responding init. Press
**Alt + SysRq (PrintScreen) + a letter**:

| Key | Does |
|---|---|
| **R** | take keyboard control back from X |
| **E** | SIGTERM to all processes except init |
| **I** | SIGKILL to all processes except init |
| **S** | **sync all filesystems** |
| **U** | remount all filesystems read-only |
| **B** | reboot **immediately**, no shutdown |

> **"REISUB"** — the mnemonic is "BUSIER" backwards — is the sequence for a machine that has stopped
> responding entirely. Wait a few seconds between letters. **It is dramatically better than holding
> the power button**, because `S` and `U` get your filesystems to a consistent state first.
>
> Worth knowing *before* you need it, since by definition you won't be able to look it up.

```bash
# to enable if it's 0 (as a drop-in — the seventh appearance of the pattern)
echo 'kernel.sysrq = 1' | sudo tee /etc/sysctl.d/99-sysrq.conf
```

## 50.3 Your machine lies about memory, deliberately

```bash
cat /proc/sys/vm/overcommit_memory
cat /proc/self/oom_score /proc/self/oom_score_adj
free -h
```

```
0
666
0
```

*(Verified — and yes, my shell's OOM score really was 666.)*

> **Linux grants more memory than it has**, because programs routinely allocate far more than they
> touch. Mode `0` is a heuristic: allow anything that isn't obviously absurd.
>
> Which creates the **OOM killer**: when the lie comes due, something must die. The kernel scores
> every process — largely by memory footprint, adjusted by `oom_score_adj` — and kills the highest.
> Famously, this often means the database, because it was using the most memory, which is also why it
> mattered.

```bash
# make a process a preferred victim (range: -1000 protected .. 1000 kill me first)
echo 500 | sudo tee /proc/$$/oom_score_adj
sudo dmesg | grep -i 'killed process' | tail -3
```

Volume 6 §36.5's `MemoryMax=` is the civilised alternative: a cgroup limit fails the allocation *in
that service* rather than letting the kernel pick a victim system-wide.

## 50.4 Programs older than the C language

```bash
sudo apt install dc ed units bsdgames
echo '2 3 + 4 * p' | dc
```

**`dc`** — desk calculator, reverse Polish notation — is among the very oldest surviving Unix
programs. It was written **before C existed**, in B, and `bc` was originally a *front end* that
compiled infix expressions down to `dc`.

> **Confidence: moderate-high** on `dc` predating C and on `bc` originally being a `dc` front end.
> This is well attested in Unix histories, though I'd check a primary source before quoting it.

**`ed`** is "the standard editor" — the joke being that it's the one you're guaranteed to have. It's
also genuinely the ancestor: `ed` → `ex` → `vi` → `vim`. The `:`-commands in vim are `ex` commands,
which are `ed` commands.

```bash
printf 'a\nhello from ed\n.\nw /tmp/ed-demo.txt\nq\n' | ed -s
cat /tmp/ed-demo.txt && rm -f /tmp/ed-demo.txt
```

And **`units`**, which is obscure and immediately useful:

```bash
units -t '25 degC' 'degF'
units -t '1 lightyear' 'km'
units -t '100 km/hour' 'mph'
```

## 50.5 The coreutils nobody uses

```bash
factor 1234567890
rev <<< "Debian"
shuf -i 1-10 -n 3
tac /etc/hostname
numfmt --to=iec 1234567890
seq -s, 1 10
paste <(seq 3) <(echo -e "a\nb\nc")
```

```
1234567890: 2 3 3 5 3607 3803
naibeD
```

*(Both verified.)* `factor` is in coreutils because early Unix was a research OS at a company with a
lot of mathematicians, and nobody ever removed it.

## 50.6 The `man 7` section, which nobody reads

Volume 1 §5.2 listed the manual sections. **Section 7 is the one worth browsing for its own sake** —
it's conventions and overviews rather than commands:

```bash
man 7 hier           # the filesystem hierarchy      (Volume 3 §16)
man 7 signal         # every signal and its number   (Volume 2 §12.4)
man 7 glob           # the wildcard rules            (Volume 1 §3.6)
man 7 capabilities   # every capability, explained   (Volume 2 §11.8)
man 7 namespaces     # the eight, authoritatively    (§46.4)
man 7 credentials    # real/effective/saved UIDs     (Volume 2 §11.3)
man 7 ascii          # the table, right there
man 7 units          # binary vs decimal prefixes
man 7 random         # how the kernel's CSPRNG works (Volume 4 §25)
man 7 inode          # what an inode contains        (Volume 3 §15)
man 7 socket         # the socket API                (Volume 5 §29)
```

```bash
man -k . -s 7 2>/dev/null | head -30
```

> **`man 7 capabilities` and `man 7 namespaces` in particular are better than most of what's written
> about them elsewhere**, because they're maintained alongside the kernel by the people who
> implemented it. Michael Kerrisk maintained the Linux man-pages project for two decades and the
> quality shows.

## 50.7 The documentation you already have

```bash
ls /usr/share/doc/ | wc -l
zless /usr/share/doc/bash/changelog.Debian.gz     # Volume 1 §5.4
find /usr/share/doc -name 'README.Debian*' | head
ls /usr/share/doc/*/examples/ 2>/dev/null | head -20
```

Volume 1 §5.4 established that **Debian Policy requires** every package to ship documentation. So
`/usr/share/doc` contains a few hundred megabytes of material written by the people who packaged
your software, and almost nobody opens it.

```bash
sudo apt install debian-policy developers-reference
ls /usr/share/doc/debian-policy/
sudo apt install linux-doc      # the kernel's own Documentation/ tree
ls /usr/share/doc/linux-doc*/ 2>/dev/null
```

## 50.8 Genuinely fun, and verified real

```bash
apt moo
aptitude -vvvvvv moo
sudo apt install sl cowsay fortune-mod cmatrix bsdgames
sl                          # type it when you meant ls
fortune | cowsay -f tux
fortune debian-hints        # actually useful hints, from fortune-mod
cmatrix
ls /usr/games/              # bsdgames: tetris-bsd, worm, hangman, adventure...
```

Volume 1's TRY THIS #6 started this; `fortune debian-hints` is the one that's both a joke and
genuinely educational.

## 50.9 Where to go from here

| If you want | Read |
|---|---|
| Authoritative kernel interface docs | `man 2 syscalls`, `man 7 *`, the kernel's `Documentation/` |
| How Debian actually works | `debian-policy`, `developers-reference` packages |
| To package something | the **Debian New Maintainers' Guide**; `dh_make`, `lintian` |
| To contribute | `bugs.debian.org`, `reportbug`, the mentors process |
| Deeper kernel | *Linux Kernel Development* (Love); *Understanding the Linux Kernel* (Bovet & Cesati) |
| Deeper Unix history | Kernighan's *Unix: A History and a Memoir*; the Ritchie and Thompson papers |
| To practise | run `testing` in a VM, break it, fix it |

```bash
sudo apt install reportbug lintian devscripts
reportbug --help | head -5
```

> **And the highest-leverage next step is not reading.** Install Debian in a VM, deliberately break
> something from each volume — corrupt `fstab`, lock yourself out of sudoers, install a broken
> initramfs — and recover it. Volume 6 §33.5's `init=/bin/bash` and `emergency.target` are the tools.
> **You will learn more from one recovered system than from another book.**

---

