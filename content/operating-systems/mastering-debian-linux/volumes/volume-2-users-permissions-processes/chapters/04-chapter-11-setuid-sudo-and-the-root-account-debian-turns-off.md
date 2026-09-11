# Chapter 11 — `setuid`, `sudo`, and the Root Account Debian Turns Off

## 11.1 The hook

> **`/etc/shadow` is mode `640`, owned by `root:shadow`. You cannot read it, let alone write it.**
>
> **So how does `passwd` let you change your own password?**

Run it and see the paradox directly:

```bash
cat /etc/shadow                  # Permission denied
ls -l /usr/bin/passwd
```

```
cat: /etc/shadow: Permission denied
-rwsr-xr-x 1 root root 68208 Mar 23  2023 /usr/bin/passwd
```

There is an **`s`** where the owner's `x` should be. That's the whole answer, and it is one of the
most consequential four bits in Unix.

## 11.2 THE PROBLEM, and the three possible answers

Every user must be able to change their own password. Changing a password means writing
`/etc/shadow`. Writing `/etc/shadow` requires root. Pick one:

| Option | Why it fails |
|---|---|
| **Make `/etc/shadow` writable by all** | any user can set root's password. Absurd. |
| **Run a privileged daemon** that users send requests to | works, but in 1973 that means IPC machinery, a protocol, a running process, and error handling — all far heavier than the problem |
| **Let one specific, trusted *program* borrow the file owner's privileges for the duration of its run** | ✔ |

The third is **setuid**, and Dennis Ritchie invented it.

> **Confidence: moderate-high.** Ritchie holds a patent generally cited as US 4,135,240, "Protection
> of Data File Contents," filed in 1973 and granted in 1979, with Bell Labs subsequently placing it
> in the public domain. I'd verify the number before quoting it.

## 11.3 THE MECHANISM: real UID versus effective UID

Every process carries **more than one** user identity:

| Identity | Meaning |
|---|---|
| **Real UID** | who you actually are. Used for signals and accounting. |
| **Effective UID** | **whose privileges you're currently using.** This is what permission checks use. |
| **Saved set-UID** | a stash, so a program can temporarily drop and later regain privilege |
| **Filesystem UID** | Linux-specific legacy, normally equal to the effective UID |

Normally all four are identical. The kernel exposes them:

```bash
grep -E '^(Name|Uid|Gid):' /proc/self/status
```

```
Name:	grep
Uid:	1000	1000	1000	1000
Gid:	1000	1000	1000	1000
```

Four numbers in the order **Real, Effective, Saved, Filesystem**. *(Verified.)*

**What the setuid bit does is one line in `execve()`.** Volume 1 §2.7 walked through exec; here is
the step it skipped:

> When `execve()` loads a binary whose setuid bit is set, the kernel sets the new process's
> **effective UID to the file's owner**, while leaving the **real UID** as the caller's.

So `/usr/bin/passwd`, owned by root with mode `4755`, run by you:

```
   real UID = 1000 (you)          ← the kernel still knows who you are
   effective UID = 0 (root)       ← but permission checks use THIS
```

`passwd` uses its real UID to decide *whose* password you're allowed to change, and its effective UID
to actually write the file. Both facts are needed, which is exactly why there are two.

### See it for yourself, in one command

Rather than trying to catch `passwd` mid-run, make your own setuid binary from a program that
*reports* both identities. *(This entire sequence is verified.)*

```bash
cp /usr/bin/id /tmp/myid
sudo chown root:root /tmp/myid
sudo chmod 4755 /tmp/myid            # ← order matters; see §11.7
ls -l /tmp/myid

/tmp/myid -u        # EFFECTIVE uid
/tmp/myid -ru       # REAL uid
```

```
-rwsr-xr-x 1 root root 39432 Sep 10 06:05 /tmp/myid
0
1000
```

**One binary. Two different answers.** *(Verified.)* You ran it, so your real UID is 1000. The setuid
bit made its effective UID 0. That split — visible in a single command — is the whole of setuid.

Clean up immediately, because a setuid-root copy of anything sitting in `/tmp` is exactly the kind of
thing you don't want lying around:

```bash
sudo rm -f /tmp/myid
```

## 11.4 THE DEBIAN DECISION: why your root account is locked

During installation, Debian asked you for a root password and mentioned you could leave it blank.
Here is what that choice actually did.

```bash
sudo passwd -S root
groups
getent group sudo
```

If you left it blank:

```
root L 01/01/1970 0 99999 7 -1
vishal cdrom floppy sudo audio dip video plugdev users
sudo:x:27:vishal
```

**`L` means locked** (§9.7). The root account has no usable password and **cannot be logged into
directly at all** — not at the console, not via `su`, not over SSH. Instead, your user was placed in
the **`sudo`** group.

> **Confidence: high.** The Debian installer states this explicitly: if you leave the root password
> empty, the root account is disabled and the initial user is given the ability to become root via
> `sudo`. This is a Debian installer decision, not a Linux fact — and it differs from historical
> practice on several other distributions.

### The reasoning, which is better than "it's more secure"

| | Root password | `sudo` |
|---|---|---|
| **The secret** | **shared** among everyone who administers the box | **each person's own** password |
| **Revoking one admin** | change the password, tell everyone the new one | remove them from one group |
| **Attribution in logs** | "someone became root at 03:14" | **"vishal ran `apt install x` at 03:14"** |
| **Default state** | you may be sitting in a root shell out of habit | **unprivileged**; each privileged action is deliberate |
| **Remote brute force** | root is a known username to attack | there is no password to guess |

The attribution point is the strongest one. Watch it happen:

```bash
sudo whoami
sudo journalctl -t sudo -n 10 --no-pager
```

```
root
Sep 10 06:12:03 debian sudo[4711]: vishal : TTY=pts/0 ; PWD=/home/vishal ; USER=root ; COMMAND=/usr/bin/whoami
```

**Your name, your terminal, your working directory, and the exact command.** A shared root password
produces none of that.

### The honest counter-arguments

This book is not a Debian advertisement, and there are real objections:

1. **`sudo` is a large setuid-root C program** — which is to say, it is itself attack surface, and
   Chapter 13 is about what happened when it had a bug. A locked root account plus a vulnerable
   `sudo` is not obviously better than the reverse.
2. **`sudo -i` gives you a root shell anyway**, which throws away the per-command granularity that
   was half the argument. Most people do this constantly.
3. **If you are the only user of a single-user laptop**, the shared-secret and attribution arguments
   both evaporate. What remains is defence in depth, which is real but weaker.
4. **Recovery.** With root locked and `sudo` misconfigured, you may need single-user mode or a rescue
   USB to fix your own machine. §11.5 has a specific way to cause this.

If you *did* set a root password during installation and want to switch to the sudo model:

```bash
sudo usermod -aG sudo "$USER"      # add yourself to the sudo group
# log out and back in for the new group to take effect
sudo passwd -l root                # lock root
sudo passwd -S root                # confirm: should now show L
```

Group membership is established at login (it's baked into your process's credentials at that point),
so **adding yourself to a group has no effect on shells that are already running.** Check with
`id` versus `getent group sudo`.

## 11.5 `/etc/sudoers`

```bash
sudo grep -vE '^\s*(#|$)' /etc/sudoers
```

```
Defaults        env_reset
Defaults        mail_badpass
Defaults        secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Defaults        use_pty
root    ALL=(ALL:ALL) ALL
%sudo   ALL=(ALL:ALL) ALL
@includedir /etc/sudoers.d
```

The rule grammar:

```
    %sudo      ALL      =    (ALL : ALL)      ALL
    └──┬──┘   └─┬─┘         └──┬──┘ └─┬─┘    └─┬─┘
      WHO      on which      as which  as which  may run
   (% = group)  HOSTS         USER     GROUP    WHAT
```

So `%sudo ALL=(ALL:ALL) ALL` reads: *members of group `sudo`, on any host, may run any command as any
user and any group.* The `ALL=` host field is a fossil from when one sudoers file was distributed
across a fleet.

What *you* are permitted:

```bash
sudo -l
```

### Never edit it directly

```bash
sudo visudo
```

> **`visudo` locks the file and syntax-checks it before installing the new version.** A syntax error
> in `/etc/sudoers` makes `sudo` refuse to run **at all** — and if your root account is locked
> (§11.4), you have just removed your only route to privilege and will need single-user mode or a
> rescue disk to recover.
>
> This is the single most common way people lock themselves out of a Debian box. `visudo` exists
> specifically to prevent it, and it costs nothing to use.

Pick your editor for the session:

```bash
sudo EDITOR=nano visudo
```

### `/etc/sudoers.d/` — and a genuine gotcha

```bash
sudo ls -l /etc/sudoers.d/
```

Drop-in files are the right place for local rules — package upgrades won't touch them. Two traps:

1. On older Debian releases the include line reads **`#includedir /etc/sudoers.d`**. That leading `#`
   is **not a comment** — it's part of the directive. Deleting it "to tidy up" silently disables every
   drop-in file. Newer sudo accepts `@includedir`, which is far less confusing.
2. **Files with a `.` or `~` in the name are ignored**, so `myrule.conf` does nothing while `myrule`
   works. This trips up people who add a `.conf` extension out of habit.

Use `visudo -f` for these too:

```bash
sudo visudo -f /etc/sudoers.d/mylocalrule
```

## 11.6 `env_reset` and `secure_path` — Volume 1's loose ends, tied off

Two of those `Defaults` lines are direct answers to problems Volume 1 raised.

### `secure_path` and the `$PATH` trojan

Volume 1 §2.5 explained why `.` is not on your `$PATH`: someone could plant an executable named `ls`
in a directory you visit. Now consider the same attack against `sudo`.

Volume 1 §6.2 noted that Debian's `~/.profile` puts `~/bin` on your `$PATH` if it exists. So:

```
   1. Attacker (or a compromised program running as you) writes ~/bin/apt
   2. You type:  sudo apt update
   3. If sudo inherited YOUR $PATH, it finds ~/bin/apt first — and runs it as ROOT.
```

`secure_path` prevents exactly this. `sudo` **discards your `$PATH` entirely** and substitutes its
own. Prove it:

```bash
mkdir -p ~/bin
printf '#!/bin/sh\necho "I am NOT the real apt, and I am running as $(id -un)"\n' > ~/bin/apt
chmod +x ~/bin/apt
PATH="$HOME/bin:$PATH"

apt --version | head -1        # YOUR fake one runs
sudo apt --version | head -1   # the REAL one runs — secure_path overrode you

rm ~/bin/apt
hash -r
```

```
I am NOT the real apt, and I am running as vishal
apt 2.6.1 (amd64)
```

**Your fake ran as you, and did not run under `sudo`.** That's `secure_path` doing its job.

```bash
sudo sh -c 'echo "$PATH"'      # sudo's PATH, not yours
echo "$PATH"                   # yours
```

### `env_reset` and Shellshock

Volume 1 §7.3 made the point that the environment is inherited transparently across `execve()`, and
that Shellshock turned that feature into remote code execution.

`env_reset` is the general defence: **`sudo` clears the environment** and passes only a small
allowlist through.

```bash
FOO=bar sudo env | grep -c '^FOO=' || echo "FOO was stripped"
sudo env | sort | head -15
```

```
FOO was stripped
```

Consider what `sudo` would be without it. Environment variables that change how a program behaves are
numerous and dangerous when the program runs as root:

| Variable | What it does |
|---|---|
| `LD_PRELOAD` | **load an arbitrary shared library into the process** — instant code execution |
| `LD_LIBRARY_PATH` | change where libraries are found |
| `IFS` | change how the shell splits words (Volume 1 §2.4) |
| `BASH_ENV` | make bash source a file at startup |
| `PS4` | with `set -x`, gets **evaluated** — command substitution and all |

The dynamic linker already refuses to honour `LD_PRELOAD` for setuid binaries, which is a second,
independent layer. But `env_reset` means `sudo` isn't relying on that.

> **The generalisable point.** Volume 1 §7.5 concluded that Shellshock's fix was to make the
> data/code boundary **structural** rather than a matter of careful parsing. `env_reset` and
> `secure_path` are the same move: rather than trying to sanitise a hostile environment, `sudo`
> **throws it away and builds a known-good one.** Allowlist, not blocklist.

## 11.7 A verified surprise: `chown` silently strips the setuid bit

While preparing §11.3's demo I wrote the steps in the wrong order and got a result I didn't expect.
It's worth showing, because it's a security mechanism you'd otherwise never notice.

```bash
cd /tmp && printf '#!/bin/bash\necho hi\n' > su.sh

sudo chown root:root su.sh
sudo chmod 4755 su.sh
ls -l su.sh                     # setuid bit present

sudo chown root:root su.sh      # chown it AGAIN — changing nothing
ls -l su.sh                     # ...and the bit is GONE

rm -f su.sh
```

```
-rwsr-xr-x 1 root root 20 Sep 10 06:05 su.sh
-rwxr-xr-x 1 root root 20 Sep 10 06:05 su.sh
```

*(Verified.)* The second `chown` changed the owner to what it already was, and **cleared the setuid
bit as a side effect**, silently.

**Why:** if `chown` preserved setuid, then handing a file to a new owner would hand over the ability
to *run as* that owner. Someone could prepare a malicious binary, get an administrator to `chown` it
to root, and have a setuid-root backdoor. The kernel closes this by clearing `S_ISUID` and `S_ISGID`
whenever ownership changes. It's documented in `chown(2)`, and it's the reason **you must always
`chmod` after `chown`, never before.**

## 11.8 And why setuid is dangerous in general

Setuid binaries are the smallest, most-scrutinised programs on your system, and they are still where
local privilege escalation lives. The reason is structural:

> **A setuid-root program is a piece of code that starts running with full privilege while under the
> complete control of an unprivileged user** — who chooses its arguments, its environment, its
> working directory, its open file descriptors, its resource limits, its signal dispositions, and
> when to send it signals.

Every one of those is an input, and every input is an attack surface. Which makes the list on your
own machine worth looking at, since it is precisely the list of programs where a single mistake means
root:

```bash
find / -perm -4000 -type f 2>/dev/null | sort
find / -perm -2000 -type f 2>/dev/null | sort
```

On a typical Debian desktop the setuid list is around ten to fifteen entries. Each one exists for a
reason:

| Binary | Why it needs privilege |
|---|---|
| `passwd`, `chfn`, `chsh`, `gpasswd` | write `/etc/shadow` or `/etc/passwd` |
| `su`, `sudo` | become another user — the whole point |
| `mount`, `umount`, `fusermount3` | mount filesystems (limited to `/etc/fstab` entries marked `user`) |
| `newgrp` | change your active group |
| `pkexec` | polkit's `sudo` equivalent, if installed |
| `ssh-keysign` | host-based SSH authentication (Volume 5) |

**Modern Linux has been shrinking this list**, replacing whole-root setuid with **capabilities** —
fine-grained privileges you can grant individually:

```bash
getcap /usr/bin/ping 2>/dev/null || ls -l /usr/bin/ping
```

`ping` used to be setuid root purely so it could open a raw socket. On modern Debian it typically has
`cap_net_raw` instead — one capability rather than all of root. That's the same least-privilege
instinct as the `shadow` group in §9.5, applied to the kernel's privilege model.

> **Confidence: moderate-high** that current Debian ships `ping` with a capability rather than
> setuid; check your own output. If it shows `cap_net_raw=ep`, that's it.

Chapter 13 is what happened when the guard program itself had a bug.

---

