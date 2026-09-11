# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 2 — Users, Permissions, and Processes

---

### Where Volume 1 left off

Volume 1 treated your laptop as though you were the only person on it. Every command ran as you,
every file was yours, and the only boundary that mattered was between the shell and the kernel.

That is not the machine Unix was designed for, and almost every design decision in this volume only
makes sense once you drop the assumption.

Volume 1 also left three specific loose ends that get resolved here:

| Loose end | Where |
|---|---|
| `143 = 128 + 15` — what a signal actually *is* | §12.4 |
| Why `.` isn't on your `$PATH` — the trojan risk | §11.6, where `sudo` fixes it properly |
| Shellshock's environment inheritance being a *feature* | §11.6, where `sudo` deliberately breaks it |

**Everything in this volume runs on a stock Debian install.** A few demonstrations need `sudo` (you
have it if you left the root password blank during installation — §11.4 explains why). Nothing here
is destructive; every file created lives in `/tmp` or your home directory and is cleaned up.

One command worth installing for §12:

```bash
sudo apt install psmisc      # provides pstree
```

**A note on verification.** Where a demonstration in this volume shows expected output, I ran it on a
live Debian-derived system while writing. Two of them behaved differently from how I first wrote them
— §11.3 and §11.7 — and both corrections are left visible in the text, because the reason they
surprised me is more useful than the demo I originally intended.

---

# Chapter 8 — Why Your Laptop Pretends to Be a 1970s Mainframe

## 8.1 The hook

> **You are the only person who uses your laptop. So why does every single file on it record an
> owner, a group, and nine separate permission bits — and why does the machine maintain a list of
> forty-odd "users" who are not you?**

Run this and look at what's there:

```bash
cut -d: -f1,3 /etc/passwd | column -t -s:
wc -l /etc/passwd
```

```
root            0
daemon          1
bin             2
sys             3
sync            4
games           5
man             6
...
systemd-network 998
messagebus      100
sshd            104
you             1000
```

Forty or so accounts. One of them is you. **None of the others is a person**, and yet the system
maintains passwords, home directories and login shells for all of them.

The answer to the hook is historical and then, surprisingly, becomes contemporary again.

## 8.2 THE PROBLEM: computers were shared, because they were unaffordable

In 1970 a PDP-11 cost roughly the price of a house and occupied a rack. **The idea of one computer
per person was economically absurd.** A department bought one machine and everybody used it at once,
through terminals.

That model is called **timesharing**, and it was the dominant research direction of the era:

- **CTSS** — the Compatible Time-Sharing System, MIT, first demonstrated around 1961–1962, led by
  Fernando Corbató. One of the first working timesharing systems.
- **Multics** — CTSS's ambitious successor (Volume 1 §1.2), designed explicitly as a *computing
  utility*: you'd buy computing the way you buy electricity, and the system would keep strangers'
  data separate as a matter of course.
- **Unix** — built by people who had just spent years on Multics and had absorbed its assumptions,
  while rejecting its size.

> **Confidence: high** on CTSS's existence, Corbató's leadership and the early-1960s timeframe;
> **moderate** on the precise first-demonstration date, which is variously given as 1961 or 1962.

So the requirement Unix inherited was not "protect the user from mistakes." It was:

> **Twenty people are logged in right now. Some of them are undergraduates. None of them should be
> able to read, modify, or delete each other's work, and none of them should be able to take down the
> machine.**

Every permission bit in this volume exists to answer that sentence.

## 8.3 THE INCIDENT: the CTSS password file, 1966

The best evidence that this was a real problem — not a theoretical one — is that the first documented
password disaster happened before Unix existed at all.

CTSS had a text editor which, when invoked, wrote its working file to a **fixed temporary filename in
a common directory**. One afternoon two administrators were editing simultaneously: one had the
**password file** open, the other had the **message-of-the-day** file open.

The temporary files collided. The password file's contents ended up in the message file.

**And the message of the day is printed to every user at login.**

> **Confidence: moderate-high on the incident, moderate on the date.** The story is recounted by
> Fernando Corbató himself in interviews and retrospectives, and 1966 is the year usually given.
> The precise mechanism is described slightly differently in different tellings. I would treat it as
> substantially true and the details as approximate.

Two things about that incident echo through this entire volume:

1. **The passwords were stored in plaintext.** Once the file leaked, every account was compromised
   immediately, with no further work required. §9.4 is the direct response to this.
2. **The failure was not an attack.** Nobody broke in. Two ordinary operations interacted badly. The
   permission model has to survive *accidents*, not just adversaries — which is a much harder
   requirement, and one that Volume 1 §7's Steam incident showed is still not solved.

## 8.4 THE MECHANISM: how Unix simplified Multics into nine bits

Multics had genuine **access control lists** — for each object, an arbitrary list of principals and
what each may do. Fully general. Also variable-length, requiring storage per file and a search on
every access.

Unix, running on a machine with 64 KB of address space, could not afford that. So it made a radical
simplification that we still live with:

> **Instead of an arbitrary list of who may do what, record three *classes* of person and three
> *operations*.**
>
> **Classes:** the file's **owner**, the file's **group**, and **everyone else**.
> **Operations:** **read**, **write**, **execute**.
>
> 3 × 3 = **nine bits.**

That's it. That is the entire model, and Chapter 10 derives everything else from those nine bits.

The cost of the simplification is real: you cannot say "Alice and Bob may read this, but not Carol"
without creating a group containing exactly Alice and Bob. In exchange you get a permission check
that is a handful of bitwise operations against a value already in the inode, with no allocation and
no search — which is why it was affordable in 1971 and why it is still the fast path today.

> Linux *does* now have real ACLs (`setfacl`, `getfacl`) layered on top, and SELinux/AppArmor on top
> of that. Debian ships AppArmor enabled by default as of recent releases. But the nine bits remain
> the primary mechanism, checked first, on every single file access on your machine.

## 8.5 And why it still matters on a single-user laptop

The historical answer is only half of it. The reason your laptop has forty users is **contemporary**,
and it's a genuinely good idea:

> **Every network-facing service on your machine runs as its own unprivileged user, so that
> compromising the service does not compromise the machine.**

Look at who owns what's actually running:

```bash
ps -eo user,comm --sort=user | uniq -c -f1 | sort -rn | head -15
```

```
     35 root            systemd
      8 you             bash
      2 systemd-resolve systemd-resolve
      1 messagebus      dbus-daemon
      1 systemd-timesync systemd-timesyn
      ...
```

And see the deliberate un-loginability of those accounts:

```bash
grep -E 'nologin|/bin/false' /etc/passwd | head -10
```

```
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
...
```

**Their login shell is `/usr/sbin/nologin`.** Volume 1 §2.7 explained that `execve()` runs whatever
the login process asks it to; `nologin` is a program whose entire job is to print a message and exit
with a failure status. These accounts exist to *own things*, not to be logged into.

```bash
cat /usr/sbin/nologin > /dev/null; file /usr/sbin/nologin
/usr/sbin/nologin; echo "exit status: $?"
```

```
This account is currently not available.
exit status: 1
```

That is the whole program.

> **The reframing worth keeping:** the multi-user model was built to separate *people*. It is now
> used overwhelmingly to separate *programs*. Same nine bits, completely different threat model, and
> it worked for the second job without modification — which is a decent argument that the 1971
> simplification was the right one.

---

# Chapter 9 — `/etc/passwd`, `/etc/shadow`, and the Password That Wasn't Secret

## 9.1 The hook

> **`/etc/passwd` is readable by everyone on the system. Run `cat /etc/passwd` and see. So where is
> your password — and why was it ever acceptable for the password file to be world-readable in the
> first place?**

## 9.2 What's actually in `/etc/passwd`

```bash
grep "^$USER:" /etc/passwd
```

```
vishal:x:1000:1000:Vishal,,,:/home/vishal:/bin/bash
```

Seven colon-separated fields:

| # | Field | Example | What it's for |
|---|---|---|---|
| 1 | Username | `vishal` | the human-readable name |
| 2 | **Password** | **`x`** | historically the hash; now a placeholder — §9.4 |
| 3 | **UID** | `1000` | **the number the kernel actually uses** |
| 4 | GID | `1000` | primary group |
| 5 | **GECOS** | `Vishal,,,` | full name and contact info — see below |
| 6 | Home directory | `/home/vishal` | where login puts you |
| 7 | Login shell | `/bin/bash` | what `login` executes (Volume 1 §2.7) |

**Field 3 is the one that matters.** The kernel does not know your name. It knows a **UID**, an
integer. Names exist for humans and are resolved by *libraries*, not by the kernel:

```bash
ls -ln /etc/passwd     # -n : show NUMERIC ids
ls -l  /etc/passwd     # translated to names by ls, via getpwuid()
```

```
-rw-r--r-- 1 0 0 2953 Sep  1 09:12 /etc/passwd
-rw-r--r-- 1 root root 2953 Sep  1 09:12 /etc/passwd
```

**This is why `/etc/passwd` has to be world-readable.** Every time `ls -l` prints an owner name, it
calls `getpwuid(0)` and needs to read that mapping. So does `ps`, so does `find -user`, so does every
program that displays a filename with an owner. A world-readable name-to-number map is not optional.

Which sets up the entire problem of this chapter.

> **The GECOS field is a fossil, and a good one.** It stands for **General Electric Comprehensive
> Operating System** — later Honeywell's GCOS. In early Unix at Bell Labs, some jobs were submitted
> from the Unix machine to a neighbouring GECOS mainframe, and this field held the accounting
> information that submission required. The GECOS machines are long gone; the field is still called
> that, and now holds your full name.
>
> **Confidence: high.** This is well documented and consistently told.

```bash
chfn --help 2>&1 | head -8      # the tool that edits the GECOS field
getent passwd "$USER"           # the correct way to query — see below
```

Note `getent` rather than `grep`. On a machine using LDAP, Active Directory, or systemd's
`systemd-homed`, users may not be in `/etc/passwd` at all. `getent` asks the **Name Service Switch**
(`/etc/nsswitch.conf`), which is the actual interface:

```bash
cat /etc/nsswitch.conf
```

## 9.3 Groups

```bash
id
groups
getent group sudo
```

```
uid=1000(vishal) gid=1000(vishal) groups=1000(vishal),24(cdrom),25(floppy),27(sudo),29(audio),30(dip),44(video),46(plugdev),100(users)
```

Two distinct things here:

- **The primary group** (field 4 of `/etc/passwd`) — the group assigned to files you create.
- **Supplementary groups** (from `/etc/group`) — additional memberships, checked on access.

**A Debian-specific detail:** notice your primary group is `vishal`, not `users`. Debian's `adduser`
creates a **per-user group** with the same name as the user, a scheme called *user private groups*.

```bash
grep -E "^(USERGROUPS|USERS_GID)" /etc/adduser.conf /etc/login.defs 2>/dev/null
getent group "$USER"
```

The reason is that it makes a **relaxed umask safe** (§10.6). If everyone's primary group were
`users`, then a umask of `002` — which grants group write — would let every user on the system write
every other user's new files. With per-user groups, `002` grants write only to a group containing
one person: you. It's a small structural choice that makes a whole class of configuration safe by
default.

> **Confidence: high** that Debian's `adduser` creates per-user groups by default; **moderate-high**
> on the umask reasoning being the stated motivation, which is the standard explanation.

The groups you're in are what grant you hardware and administrative access. `sudo` is the important
one; `audio`, `video`, `plugdev`, `cdrom` are legacy device-access groups largely superseded by
systemd and udev on a modern desktop.

## 9.4 THE PROBLEM: how do you check a password without storing it?

Back to the hook. `/etc/passwd` must be world-readable. Field 2 is called "password." How was that
ever acceptable?

### Stage 1 — plaintext, in a protected file

Earliest Unix stored passwords **in the clear**, in a file readable only by root. The CTSS incident
(§8.3) is exactly the failure mode of that design: **any** breach of file protection — a bug, an
editor mishap, a backup tape, a misconfigured permission — is instantly a total compromise of every
account. There is no second line of defence.

Morris and Thompson judged this too fragile and replaced it.

### Stage 2 — one-way hashing, in a world-readable file

The insight: **you don't need to store the password. You need to store something you can check a
guess against.**

Store `H(password)` where `H` is one-way. At login, compute `H(guess)` and compare. The stored value
is useless to an attacker who can't invert `H`.

This is documented in one of the genuinely important papers in computer security:

> **Robert Morris and Ken Thompson, "Password Security: A Case History", *Communications of the ACM*
> 22(11), November 1979.**
>
> **Confidence: high** on the paper, its authors, and its main contents.

What that paper describes, and why each piece is there:

**The first attempt used a software simulation of the M-209**, a WWII-era mechanical cipher machine,
with the password as the key. It was abandoned because it was **fast** — fast enough that an attacker
could try an entire dictionary in reasonable time.

*(Confidence: moderate-high. This detail is in the paper; I am recalling rather than quoting it.)*

**The replacement used DES**, but deliberately misused: rather than encrypting the password, they
used the **password as the key** to encrypt a constant block, **iterated 25 times**. Iterating was
the point — it made each guess expensive.

**And they added the salt**, which is the enduring contribution. A 12-bit value (4096 possibilities),
originally derived from the time of day when the password was set, stored alongside the hash in
plaintext. It does two things:

| Salt prevents | How |
|---|---|
| **Spotting duplicate passwords** | two users with the same password get different hashes, so you can't tell by looking |
| **Precomputation** | an attacker cannot build one dictionary of hashes and test it against everyone — they must redo the work **for each salt**, multiplying the cost by 4096 |

There is a further detail that shows how carefully they thought about it: **the salt was used to
perturb the DES E-box expansion**, deliberately making the computation incompatible with off-the-shelf
DES hardware. Fast DES chips existed; they made sure you couldn't point one at a Unix password file.

*(Confidence: moderate-high on the E-box perturbation; it is described in the paper and in `crypt(3)`
documentation.)*

The paper also reports an experiment collecting real passwords from a range of systems and showing
that a large fraction fell to a modest dictionary — **the first published demonstration that users
choose guessable passwords**, in 1979.

*(Confidence: high that the experiment is in the paper; **low** on any specific percentage, which I
would not quote from memory.)*

### Stage 3 — and then Moore's law caught up

The Stage 2 design was good for its era and had two limits baked in:

- **8-character maximum**, because a DES key is 56 bits = 7 bits × 8 characters.
- **12-bit salt** = only 4096 variants.
- And critically: **the hashes were still in a world-readable file.**

That last one was fine when computing 4096 × dictionary hashes took a week. By the late 1980s it took
an afternoon. Any user on the machine could copy `/etc/passwd`, walk away, and crack it offline **at
their leisure, with no failed-login attempts to trigger any alarm.**

## 9.5 THE MECHANISM: splitting the file

The fix is almost embarrassingly simple, which is why it's a good design.

**The name-to-UID map must be world-readable. The hashes must not. So put them in different files.**

```bash
ls -l /etc/passwd /etc/shadow
```

```
-rw-r--r-- 1 root root   2953 Sep  1 09:12 /etc/passwd
-rw-r----- 1 root shadow 1531 Sep  1 09:12 /etc/shadow
```

| | `/etc/passwd` | `/etc/shadow` |
|---|---|---|
| Mode | `644` — **world-readable** | `640` — **not** |
| Owner:group | `root:root` | **`root:shadow`** |
| Contains | names, UIDs, homes, shells | **hashes** and ageing policy |

Prove it:

```bash
cat /etc/shadow
```

```
cat: /etc/shadow: Permission denied
```

The `x` in field 2 of `/etc/passwd` now means *"the real thing is in shadow."*

> **The Shadow Password Suite** is generally credited to **Julianne Frances Haugh**, from around
> 1987–1988, and was adopted across Unix systems through the 1990s. On Debian the relevant packages
> are `passwd` and `login`.
>
> **Confidence: moderate-high** on Haugh and the late-1980s timeframe.

```bash
dpkg -S /usr/bin/passwd /usr/bin/chage
```

### The `shadow` group — a design detail worth noticing

Why is `/etc/shadow` owned by `root:shadow` rather than `root:root`?

Because some programs need to *read* ageing information without needing to *be root*. Instead of
making them setuid root — maximum privilege — they can be **setgid `shadow`**, which grants exactly
one capability: read that file.

```bash
find /usr/bin -perm -2000 -type f 2>/dev/null
```

```
/usr/bin/chage
/usr/bin/expiry
```

*(Verified on a live system.)* `chage` reports and changes password ageing; `expiry` checks it.
Neither can do anything else privileged, because it was never given anything else. That is **least
privilege**, implemented with one group.

Compare with the programs that genuinely must *write* the file:

```bash
find /usr/bin -perm -4000 -type f 2>/dev/null
```

```
/usr/bin/chfn
/usr/bin/chsh
/usr/bin/gpasswd
/usr/bin/newgrp
/usr/bin/passwd
/usr/bin/su
/usr/bin/mount
/usr/bin/umount
/usr/bin/fusermount3
```

*(Verified; `sudo` will also appear on your system.)* Chapter 11 is about what that `s` bit does, and
Chapter 13 is about what happens when one of these programs has a bug.

## 9.6 What a shadow entry actually contains

```bash
sudo grep "^$USER:" /etc/shadow
```

```
vishal:$y$j9T$F5Jx...$wYq...:19876:0:99999:7:::
```

Nine fields:

| # | Field | Meaning |
|---|---|---|
| 1 | Username | |
| 2 | **Hash** | `$id$salt$hash` — see below |
| 3 | Last change | **days since 1 January 1970** |
| 4 | Min age | days before it *may* be changed again |
| 5 | Max age | days before it *must* be changed |
| 6 | Warning | days of warning before expiry |
| 7 | Inactive | grace days after expiry |
| 8 | Expire | account expiry date (days since epoch) |
| 9 | Reserved | |

Decode field 3 for yourself:

```bash
DAYS=$(sudo awk -F: -v u="$USER" '$1==u{print $3}' /etc/shadow)
echo "last changed: $(date -d "1970-01-01 +${DAYS} days" '+%Y-%m-%d')"
chage -l "$USER"
```

### The hash field, and Debian's current choice

The format is `$id$salt$hash`, and the `id` names the algorithm:

| Prefix | Algorithm | Era |
|---|---|---|
| *(no `$`, 13 chars)* | the original DES `crypt` | 1979 |
| `$1$` | MD5-crypt | 1990s |
| `$2a$` / `$2b$` / `$2y$` | bcrypt | 1999– |
| `$5$` | SHA-256-crypt | 2000s |
| `$6$` | SHA-512-crypt | 2000s |
| **`$y$`** | **yescrypt** | current Debian default |
| `$7$` | scrypt | |
| `$gy$` | gost-yescrypt | |

Check yours:

```bash
sudo awk -F: -v u="$USER" '$1==u{print substr($2,1,4)}' /etc/shadow
grep -i '^ENCRYPT_METHOD' /etc/login.defs
grep -n 'pam_unix.so' /etc/pam.d/common-password
```

**Debian defaults to `yescrypt`** for recent releases. yescrypt is **memory-hard**, designed by
Alexander Peslyak (Solar Designer) — meaning it deliberately requires a substantial amount of RAM per
guess, which is the modern defence, because GPUs and ASICs have plenty of compute and comparatively
little memory bandwidth per core. Morris and Thompson made guessing expensive in *time*; yescrypt
makes it expensive in *space*, because that's what today's attack hardware is short of.

> **Confidence: moderate-high** that yescrypt is the default in Debian 11 (bullseye) and 12
> (bookworm), with Debian 10 (buster) using SHA-512 (`$6$`). **High** on Solar Designer as yescrypt's
> author. Your own `ENCRYPT_METHOD` output above is authoritative for your machine.

You can compute one yourself, to see the shape:

```bash
mkpasswd --method=yescrypt 'correct horse battery staple'
mkpasswd --method=yescrypt 'correct horse battery staple'
```

Run it twice. **The two outputs differ**, because the salt is random each time — which is exactly the
property Morris and Thompson introduced in 1979, still doing the same job.

*(`mkpasswd` comes from the `whois` package on Debian, which is a genuinely odd bit of packaging:
`sudo apt install whois`.)*

## 9.7 Locked, disabled, and empty — three different things

```bash
sudo passwd -S root
sudo passwd -S "$USER"
```

```
root L 01/01/1970 0 99999 7 -1
vishal P 06/24/2024 0 99999 7 -1
```

| Code | Field 2 of shadow looks like | Meaning |
|---|---|---|
| **`P`** | a real hash | usable password |
| **`L`** | starts with `!` | **locked** — no password can ever match |
| **`NP`** | empty | **no password at all** — logs in with nothing. Dangerous. |

**`L` is worth understanding mechanically.** Locking prepends `!` to the hash. Since `!` is not a
valid hash prefix, *no* input can produce a matching result — the comparison can never succeed. The
original hash is still there underneath, which is why unlocking restores the old password rather than
clearing it.

On a default Debian install where you left the root password blank, `passwd -S root` will show **`L`**.
Chapter 11 explains why that's the recommended configuration and what it buys you.

---

# Chapter 10 — Nine Bits, Derived

## 10.1 The hook

> **Why is it `chmod 755` and not `chmod 493`?** 493 is the same number in decimal. Why does every
> Unix book give you a table of octal values to memorise instead of explaining where they come from?

Because octal isn't a convention. It's a **consequence**, and once you see why, you'll never look up
the table again.

## 10.2 The derivation

Start from §8.4's simplification. Three classes, three operations:

```
        ┌─────── owner ───────┬─────── group ───────┬─────── other ───────┐
        │  read  write  exec  │  read  write  exec  │  read  write  exec  │
        └─────────────────────┴─────────────────────┴─────────────────────┘
             1     1     1         1     0     1         1     0     1

                      = the file mode "rwxr-xr-x"
```

Nine independent yes/no answers, so **nine bits**. Now:

> **Three bits is exactly one octal digit.** An octal digit ranges 0–7, which is exactly the range of
> a 3-bit number. So each of the three classes maps to exactly one digit, with no leftovers and no
> overlap.
>
> **That is the entire reason permissions are written in octal.** In decimal, the boundary between
> "owner" and "group" would fall in the middle of a digit and the notation would be useless. In hex,
> one digit is four bits — one too many.

Within each 3-bit group, the bits have place values 4, 2, 1:

| Bit | Place value | Meaning |
|---|---|---|
| leftmost | **4** | **r**ead |
| middle | **2** | **w**rite |
| rightmost | **1** | e**x**ecute |

So you don't memorise the combinations, you **add**:

| Want | Arithmetic | Digit |
|---|---|---|
| `rwx` | 4 + 2 + 1 | **7** |
| `rw-` | 4 + 2 | **6** |
| `r-x` | 4 + 1 | **5** |
| `r--` | 4 | **4** |
| `-wx` | 2 + 1 | **3** |
| `-w-` | 2 | **2** |
| `--x` | 1 | **1** |
| `---` | 0 | **0** |

And the common modes stop being magic incantations:

| Mode | Reads as | Typical use |
|---|---|---|
| **`644`** | `rw-` `r--` `r--` | an ordinary file: I edit it, everyone reads it |
| **`755`** | `rwx` `r-x` `r-x` | a program or a directory: I change it, everyone uses it |
| **`600`** | `rw-` `---` `---` | private — SSH keys, credentials |
| **`700`** | `rwx` `---` `---` | a private directory |
| **`666`** | `rw-` `rw-` `rw-` | everyone can write. Almost always a mistake. |
| **`777`** | `rwx` `rwx` `rwx` | **never do this.** It is the answer to "I don't know what's wrong." |

## 10.3 Where the bits actually live

They're not stored separately. The file type and the permissions share **one 16-bit word** in the
inode, called `st_mode`:

```
  bit:  15 14 13 12 │ 11 10  9 │  8  7  6 │  5  4  3 │  2  1  0
       ┌────────────┼──────────┼──────────┼──────────┼──────────┐
       │ file type  │ setuid   │  owner   │  group   │  other   │
       │ (reg/dir/  │ setgid   │  r  w  x │  r  w  x │  r  w  x │
       │  chr/blk/  │ sticky   │          │          │          │
       │  link/fifo)│          │          │          │          │
       └────────────┴──────────┴──────────┴──────────┴──────────┘
          4 bits       3 bits     3 bits     3 bits     3 bits    = 16 bits
```

Sixteen bits — **exactly one word on a PDP-11.** Volume 1 §1.2's constraint, visible in a data
structure you use every day.

See the raw value:

```bash
stat -c '%n  octal=%a  symbolic=%A  raw=0x%f' /etc/passwd /tmp /usr/bin/passwd /dev/null
```

```
/etc/passwd      octal=644   symbolic=-rw-r--r--  raw=0x81a4
/tmp             octal=1777  symbolic=drwxrwxrwt  raw=0x43ff
/usr/bin/passwd  octal=4755  symbolic=-rwsr-xr-x  raw=0x89ed
/dev/null        octal=666   symbolic=crw-rw-rw-  raw=0x21b6
```

*(Verified on a live system.)* Take those apart:

| File | Raw | Type bits | Permission bits |
|---|---|---|---|
| `/etc/passwd` | `0x81a4` | `0x8000` = **regular file** | `0x1a4` = `0644` |
| `/tmp` | `0x43ff` | `0x4000` = **directory** | `0x3ff` = `01777` |
| `/usr/bin/passwd` | `0x89ed` | `0x8000` = regular file | `0x9ed` = **`04755`** ← that leading 4 is Chapter 11 |
| `/dev/null` | `0x21b6` | `0x2000` = **character device** | `0x1b6` = `0666` |

The leading character in the `%A` column (`-`, `d`, `c`, `l`, `b`, `p`, `s`) is just those top four
bits, rendered.

## 10.4 Directories: the same three letters, three different meanings

Here is where the model stops being obvious. `r`, `w` and `x` on a **directory** mean something
completely different from what they mean on a file:

| Bit | On a file | On a **directory** |
|---|---|---|
| **r** | read the contents | **list the names** in it |
| **w** | modify the contents | **add, remove, or rename entries** |
| **x** | execute it as a program | **traverse it** — use it as a component of a path |

That `x`-means-traverse is the one that catches people. Watch it, as your **normal user** (root
bypasses all of this, so don't use `sudo`):

```bash
mkdir -p /tmp/rx && touch /tmp/rx/alpha /tmp/rx/beta

echo "--- mode 400 : read, but NOT traverse ---"
chmod 400 /tmp/rx
ls /tmp/rx                    # names appear
ls -l /tmp/rx                 # but nothing can be stat'd
cat /tmp/rx/alpha             # and nothing can be opened

echo "--- mode 100 : traverse, but NOT read ---"
chmod 100 /tmp/rx
ls /tmp/rx                    # cannot list at all
cat /tmp/rx/alpha             # but this WORKS
stat -c '%n %s bytes' /tmp/rx/alpha

chmod 755 /tmp/rx && rm -rf /tmp/rx
```

Expected output *(verified)*:

```
--- mode 400 : read, but NOT traverse ---
alpha  beta
ls: cannot access '/tmp/rx/alpha': Permission denied
ls: cannot access '/tmp/rx/beta': Permission denied
cat: /tmp/rx/alpha: Permission denied
--- mode 100 : traverse, but NOT read ---
ls: cannot open directory '/tmp/rx': Permission denied
/tmp/rx/alpha 0 bytes
```

Read that carefully, because both halves are surprising:

- **With `r` but no `x`:** you can see *that* `alpha` exists, but you cannot look at it, stat it, or
  open it. The name is public; the file is unreachable.
- **With `x` but no `r`:** you cannot discover what's inside, but if you already know a name, you can
  use it perfectly normally.

That second mode is genuinely useful and widely deployed: a directory at `711` lets anyone reach
files whose paths they were given while preventing them from enumerating the contents. Home
directories on shared systems are often `700` or `711` for exactly this reason.

```bash
ls -ld /home/*
```

## 10.5 The deletion surprise

> **Which permission do you need to delete a file?**

The obvious answer is "write permission on the file." The obvious answer is wrong.

```bash
mkdir -p /tmp/deltest && cd /tmp/deltest
touch victim.txt
chmod 000 victim.txt         # no permissions at all, for anyone
ls -l victim.txt
rm victim.txt                # and yet...
cd /tmp && rm -rf /tmp/deltest
```

```
---------- 1 vishal vishal 0 Sep 10 06:05 victim.txt
```

**The file was deleted.** *(Verified.)* `rm` may print a prompt asking you to confirm removal of a
write-protected file — say yes, or use `rm -f`. Either way it works.

Now the reverse:

```bash
mkdir -p /tmp/ro && touch /tmp/ro/f.txt
chmod 555 /tmp/ro            # read + traverse, but NOT write
rm /tmp/ro/f.txt
chmod 755 /tmp/ro && rm -rf /tmp/ro
```

```
rm: cannot remove '/tmp/ro/f.txt': Permission denied
```

*(Verified.)* The file is `644` and owned by you. You cannot delete it.

> **The rule, and the reason:** deleting a file means **removing a name from a directory**. That is a
> modification of the *directory*, not of the file. So the permission checked is **write on the
> containing directory** — and the file's own mode is irrelevant.
>
> This falls straight out of Volume 1 §3.4: `rm` calls `unlink()`, which removes a directory entry.
> The file's data isn't touched at all. Volume 3 takes this apart properly.

## 10.6 The fourth digit

You've seen `4755` and `1777`. Those leading digits are the three bits at positions 9–11:

| Bit | Value | Name | On a file | On a directory |
|---|---|---|---|---|
| 11 | **4000** | **setuid** | run as the file's **owner** (Ch 11) | *(no effect on Linux)* |
| 10 | **2000** | **setgid** | run as the file's **group** | **new files inherit the directory's group** |
| 9 | **1000** | **sticky** | *(historical; no modern effect)* | **only the owner may delete entries** |

### The sticky bit, and why `/tmp` isn't a disaster

```bash
ls -ld /tmp
```

```
drwxrwxrwt 6 root root 4096 Sep 10 06:07 /tmp
```

`1777` — world-writable, which it must be, since every program needs somewhere to put temporary
files. Without further protection, **any user could delete any other user's temporary files**,
including root's.

The `t` at the end is the sticky bit, and here is a controlled A/B test *(both halves verified)*:

```bash
# WITH the sticky bit — /tmp itself
sudo touch /tmp/roots-file
ls -l /tmp/roots-file
rm /tmp/roots-file                         # as YOU, not root
```

```
-rw-r--r-- 1 root root 0 Sep 10 06:09 /tmp/roots-file
rm: cannot remove '/tmp/roots-file': Operation not permitted
```

```bash
# WITHOUT the sticky bit — same permissions on the directory, one bit different
mkdir -p /tmp/nosticky && chmod 777 /tmp/nosticky
sudo touch /tmp/nosticky/roots-file
ls -ld /tmp/nosticky
rm /tmp/nosticky/roots-file                # as YOU
ls /tmp/nosticky/roots-file
```

```
drwxrwxrwx 2 root root 4096 Sep 10 06:09 /tmp/nosticky
ls: cannot access '/tmp/nosticky/roots-file': No such file or directory
```

**You just deleted root's file.** *(Verified.)* Same directory permissions, one bit of difference.

Clean up and note the fix:

```bash
sudo rm -rf /tmp/nosticky
```

By §10.5's rule you had write permission on the directory, so deletion was legal. The sticky bit adds
one extra condition on top: **in a sticky directory, you may only remove an entry if you own the
entry, or own the directory, or are root.** It exists solely to make shared writable directories
survivable.

> The name is a fossil. On very early Unix, the bit on an *executable* meant "keep this program's
> text segment in swap after it exits, so it starts faster next time" — it *stuck* in memory. That
> meaning is long dead; the directory meaning was added later and is all that survives.
>
> **Confidence: moderate-high** on the historical meaning; it's consistently reported and is why
> `S_ISVTX` (the constant's actual name) stands for "save text."

### setgid on directories

```bash
mkdir -p /tmp/shared && chmod 2775 /tmp/shared
ls -ld /tmp/shared
touch /tmp/shared/f && ls -l /tmp/shared/f
rm -rf /tmp/shared
```

Files created inside a setgid directory inherit **the directory's group**, not your primary group.
This is the standard way to build a collaborative directory: create a group, `chgrp` the directory to
it, set `2775`, and everything created inside is automatically group-accessible without anyone having
to remember.

## 10.7 `umask`, derived

> **When you `touch` a new file, where does mode `644` come from? You didn't ask for it.**

Two things combine:

**1. The creating program requests a mode.** `touch`, and most programs creating an ordinary file,
pass `0666` to `open()`. Note: **not `0777`.** Programs essentially never request the execute bit on
a new data file — that has to be an explicit, separate decision, which is a quiet safety property.
Programs creating a *directory* request `0777`, since a directory without `x` is useless.

**2. The kernel subtracts your `umask`.** The umask is a per-process mask of bits to **remove**:

$$
\text{final mode} = \text{requested mode} \;\text{AND NOT}\; \text{umask}
$$

```bash
umask
```

```
0022
```

Work it through, then check it *(all verified)*:

```
  file:   requested 666   minus umask 022   →   644
  dir:    requested 777   minus umask 022   →   755
```

```bash
mkdir -p /tmp/um && cd /tmp/um
for m in 022 002 077; do
  ( umask $m; touch "f$m"; mkdir -p "d$m"
    printf "umask %s -> file %s  dir %s\n" "$m" "$(stat -c%a f$m)" "$(stat -c%a d$m)" )
done
cd /tmp && rm -rf /tmp/um
```

```
umask 022 -> file 644  dir 755
umask 002 -> file 664  dir 775
umask 077 -> file 600  dir 700
```

| umask | Effect | When you'd want it |
|---|---|---|
| `022` | group and other can read, not write | the default; sane for a general system |
| `002` | **group can write** | collaborative work — safe on Debian because of per-user groups (§9.3) |
| `077` | **nobody but you, at all** | a machine handling sensitive data |

Note the subshells in that loop: `umask` is a **per-process** property inherited across `fork()`, so
setting it inside `( ... )` doesn't affect your shell. Same inheritance rules as the environment
(Volume 1 §6.4).

**Debian's setting:**

```bash
grep -i '^UMASK' /etc/login.defs
grep -rn 'umask' /etc/profile /etc/bash.bashrc 2>/dev/null
```

> **Confidence: moderate.** Debian sets `UMASK 022` in `/etc/login.defs`, and there is additionally a
> PAM mechanism (`pam_umask` with the `usergroups` option) that can relax it to `002` when your UID
> equals your GID — which, thanks to §9.3's per-user groups, is normally true. Whether that's active
> varies by configuration; your own `umask` output is the answer for your machine.

## 10.8 `chmod` and `chown` in practice

Two notations, and the symbolic one is often clearer:

```bash
cd /tmp && touch modedemo

chmod 644 modedemo          ; stat -c '%a %A' modedemo
chmod u+x modedemo          ; stat -c '%a %A' modedemo    # add execute for owner
chmod go-r modedemo         ; stat -c '%a %A' modedemo    # remove read for group+other
chmod a=r modedemo          ; stat -c '%a %A' modedemo    # SET all classes to exactly r
chmod +t modedemo           ; stat -c '%a %A' modedemo    # sticky (no effect on a file)

rm -f modedemo
```

The symbolic grammar is `[who][op][perms]`:

| Part | Options |
|---|---|
| **who** | `u` owner, `g` group, `o` other, `a` all |
| **op** | `+` add, `-` remove, **`=` set exactly** |
| **perms** | `r`, `w`, `x`, and `X` — "execute **only if it's a directory or already executable**" |

That `X` is genuinely useful and almost unknown:

```bash
mkdir -p /tmp/Xdemo/sub && touch /tmp/Xdemo/plainfile /tmp/Xdemo/script.sh
chmod +x /tmp/Xdemo/script.sh
chmod -R a+rX /tmp/Xdemo               # note the CAPITAL X
stat -c '%a %n' /tmp/Xdemo /tmp/Xdemo/sub /tmp/Xdemo/plainfile /tmp/Xdemo/script.sh
rm -rf /tmp/Xdemo
```

Directories and the already-executable script get `x`; the plain data file doesn't. With lowercase
`-R a+x` you'd have marked every data file in the tree executable, which is the standard way people
make a mess of a source directory.

**`chown` and `chgrp`:**

```bash
cd /tmp && touch ownerdemo
ls -l ownerdemo
sudo chown root ownerdemo       ; ls -l ownerdemo
sudo chown root:root ownerdemo  ; ls -l ownerdemo
chgrp "$(id -gn)" ownerdemo     # fails — you no longer own it
sudo rm ownerdemo
```

> **Only root can give a file away.** An unprivileged user cannot `chown` a file to someone else,
> even one they own. If they could, you could exhaust another user's disk quota by dumping files on
> them, or plant a file they'd be held responsible for.

---

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

# Chapter 12 — Processes, Signals, and `/proc`

## 12.1 The hook

> Volume 1 §2.8 ended with a number nobody explained: **killing a background job gave `$?` = 143.**
>
> **What is 143, and why is it 128 + 15?**

Answering that properly requires understanding what a process actually is to the kernel.

## 12.2 What a PID is

A **PID** is an integer the kernel assigns to a process. Not a handle, not a pointer — a number,
allocated sequentially and wrapped when it hits a ceiling:

```bash
cat /proc/sys/kernel/pid_max
echo $$
sleep 1 & echo "next PID allocated: $!"
```

```
32768
4021
next PID allocated: 4022
```

*(Verified.)* `32768` is the traditional default; 64-bit systems often raise it to 4194304. When the
counter wraps, the kernel skips PIDs still in use — **PIDs are reusable, and that's a real hazard.**
If you record a PID, wait, and later signal it, you may hit a completely different process. It's why
`kill` on a stale PID from a script is dangerous, and why systemd tracks services by **cgroup** rather
than by PID (Volume 6).

Two PIDs are special:

| PID | What |
|---|---|
| **1** | **`init`** — on Debian, **systemd**. Started by the kernel; parent of everything. |
| 0 | the scheduler/idle task. Not a real process; never appears in `/proc`. |

```bash
ps -p 1 -o pid,comm,args
ls -l /sbin/init
```

```
  PID COMMAND         COMMAND
    1 systemd         /sbin/init
lrwxrwxrwx 1 root root 20 ... /sbin/init -> /lib/systemd/systemd
```

PID 1 is genuinely special in the kernel: **signals with default actions are not delivered to it
unless it has installed a handler**, so you cannot accidentally `kill -9 1` your way to an instant
halt. It's also where orphans go (§12.5).

## 12.3 The process tree

Every process except PID 1 has a **parent** — the process that `fork()`ed it (Volume 1 §2.6). That
makes the whole system a tree.

```bash
pstree -p | head -25              # needs: sudo apt install psmisc
ps -ef --forest | head -25
```

Find your own ancestry:

```bash
pstree -s -p $$
```

```
systemd(1)───gnome-terminal-(2841)───bash(4021)───pstree(4530)
```

**That is your entire lineage**, and it's the fork/exec chain from Volume 1 made visible: systemd
forked and exec'd your terminal; your terminal forked and exec'd bash; bash forked and exec'd
`pstree`.

Walk it by hand through `/proc`, which is the same information the tools are reading:

```bash
pid=$$
while [ "$pid" -ne 1 ]; do
    printf '%6s  %s\n' "$pid" "$(cat /proc/$pid/comm)"
    pid=$(awk '/^PPid:/{print $2}' /proc/$pid/status)
done
printf '%6s  %s\n' 1 "$(cat /proc/1/comm)"
```

## 12.4 Signals

> **THE PROBLEM.** A process is running. You want to tell it something — stop, reload your config,
> quit cleanly, die now. It isn't reading from anywhere. How do you interrupt it?

A **signal** is an asynchronous notification delivered by the kernel. Each has a number, a name, and
a default action.

```bash
kill -l
```

```
 1) SIGHUP	 2) SIGINT	 3) SIGQUIT	 4) SIGILL	 5) SIGTRAP
 6) SIGABRT	 7) SIGBUS	 8) SIGFPE	 9) SIGKILL	10) SIGUSR1
11) SIGSEGV	12) SIGUSR2	13) SIGPIPE	14) SIGALRM	15) SIGTERM
16) SIGSTKFLT	17) SIGCHLD	18) SIGCONT	19) SIGSTOP	20) SIGTSTP
...
```

*(Verified.)* The ones that matter day to day:

| # | Name | Default action | Where you meet it |
|---|---|---|---|
| 1 | **SIGHUP** | terminate | terminal closed; **or, by convention, "reload your config"** |
| 2 | **SIGINT** | terminate | **Ctrl+C** (from the line discipline — Volume 1 §2.3) |
| 3 | SIGQUIT | terminate + core dump | Ctrl+\\ |
| 9 | **SIGKILL** | terminate | **cannot be caught, blocked, or ignored** |
| 11 | SIGSEGV | terminate + core | invalid memory access |
| 13 | **SIGPIPE** | terminate | **wrote to a pipe with no reader** — §12.4.1 |
| 15 | **SIGTERM** | terminate | **the polite default of `kill`** |
| 17 | SIGCHLD | ignored | a child changed state — how bash learns to reap (§12.5) |
| 18 | SIGCONT | continue | resume a stopped process (`fg`, `bg`) |
| 19 | **SIGSTOP** | stop | **cannot be caught, blocked, or ignored** |
| 20 | SIGTSTP | stop | **Ctrl+Z** |

> **SIGKILL and SIGSTOP are uncatchable by kernel guarantee.** Every other signal can be handled or
> ignored by the process. If SIGKILL could be caught, you could write a process nobody could ever
> stop — so the kernel reserves exactly two that always work. That's why `kill -9` is the last resort
> and why it's also *rude*: the process gets no chance to flush buffers, remove lock files, or close
> connections.

**And now 143.** When a process is killed by signal *N*, the shell reports `128 + N`:

```bash
sleep 300 & kill %1 ; wait %1 ; echo "SIGTERM  → $?"
sleep 300 & kill -9 %1 ; wait %1 ; echo "SIGKILL  → $?"
sleep 300 & kill -2 %1 ; wait %1 ; echo "SIGINT   → $?"
```

```
SIGTERM  → 143      (128 + 15)
SIGKILL  → 137      (128 +  9)
SIGINT   → 130      (128 +  2)
```

The reason for the offset is that the exit status is 8 bits (Volume 1 §2.8), and normal exit codes
occupy 0–127. Values ≥ 128 encode "didn't exit normally; here's the signal." Volume 1's loose end,
closed.

### 12.4.1 SIGPIPE, and why `yes | head` doesn't run forever

```bash
yes | head -1 > /dev/null
echo "${PIPESTATUS[@]}"
```

```
141 0
```

*(Verified.)* **141 = 128 + 13 = SIGPIPE.**

`yes` produces infinite output. `head -1` prints one line and exits, closing its end of the pipe.
`yes` writes again — into a pipe with no reader — and the kernel sends it **SIGPIPE**, whose default
action is to terminate.

> **This is how every pipeline in Unix knows when to stop.** `yes` contains no logic for it. Neither
> does `head`. The mechanism lives in the kernel, and it's why `find / | head -5` returns instantly
> instead of traversing your whole filesystem. Volume 1 §1.4 said adding pipes required no changes to
> existing programs; **this is part of why that was true.**

### Sending signals

```bash
sleep 300 &
kill %1              # SIGTERM to job 1 (bash job spec)
sleep 300 &
kill -TERM $!        # by PID
sleep 300 &
kill -s SIGKILL $!   # by name

pkill -f 'sleep 300' # by command-line pattern — careful with this
pgrep -a sleep       # what would pkill match?
```

**Always run `pgrep` before `pkill`.** The pattern matches more than you expect surprisingly often.

## 12.5 Zombies and orphans

Volume 1 §2.8 mentioned zombies in passing. Here they are.

> **THE PROBLEM.** A child exits. The parent wants its exit status. But the parent might not call
> `wait()` for another ten seconds. Where does the status live in the meantime?

The kernel keeps the process's **entry** — PID and exit status — while discarding everything else:
memory, file descriptors, all of it. That husk is a **zombie**.

Make one *(verified)*:

```bash
python3 -c '
import os, time
if os.fork():      # parent
    time.sleep(10) # ...deliberately does NOT wait()
else:              # child
    os._exit(0)    # exits immediately
' &
sleep 1
ps -eo pid,ppid,stat,cmd | awk 'NR==1 || $3 ~ /^Z/'
```

```
  PID  PPID STAT CMD
  483   481 Z    [python3] <defunct>
```

**State `Z`, and `<defunct>` in place of a command line** — because there's no memory left to hold
one.

Now the thing that makes zombies memorable:

```bash
kill -9 483      # substitute the PID you actually saw
ps -eo pid,stat,cmd | awk '$2 ~ /^Z/'
```

**Nothing happens. It's still there.** You cannot kill a zombie, because it is already dead — there
is nothing left to deliver a signal to. The only way to remove it is for the **parent** to call
`wait()`, or for the parent to die:

```bash
kill 481         # kill the PARENT (substitute your PPID)
sleep 1
ps -eo pid,stat,cmd | awk '$2 ~ /^Z/' ; echo "(gone)"
```

**Orphans** are the reverse case: the parent dies while the child lives. The child is **reparented to
PID 1** (or to the nearest ancestor registered as a *subreaper*, which is how systemd tracks service
processes). Since PID 1's job includes reaping, orphans always eventually get cleaned up.

```bash
bash -c 'sleep 30 & echo "child PID: $!"' 
sleep 1
# find that PID and look at its PPid — the bash that started it is gone
```

> **When zombies are a real problem:** a long-running daemon that forks children and never reaps them
> leaks PID table entries until the table is exhausted and no new process can start anywhere on the
> system. A handful of zombies in `ps` is harmless. Thousands means a broken parent — and the fix is
> to restart or fix **the parent**, never to try killing the zombies.

## 12.6 Job control, process groups, and why Ctrl+C kills the whole pipeline

> **You run `find / | grep foo | head`. You press Ctrl+C. All three die. But you only pressed one
> key, and the terminal is only connected to one of them. How?**

The kernel groups processes at two levels above the process itself:

| Level | What it is |
|---|---|
| **Process group (PGID)** | a set of related processes — **a shell pipeline is one process group** |
| **Session (SID)** | a set of process groups attached to one terminal, with one *session leader* |

The terminal has exactly one **foreground process group** at a time. When the line discipline
(Volume 1 §2.3) sees Ctrl+C, it sends SIGINT **to every process in that group** — which is the whole
pipeline.

See the structure:

```bash
sleep 300 | cat &
jobs -l
ps -o pid,ppid,pgid,sid,stat,comm --ppid $$
kill %1
```

```
[1]+  4610 Running                 sleep 300 | cat &
  PID  PPID  PGID   SID STAT COMMAND
 4610  4021  4610  4021 S    sleep
 4611  4021  4610  4021 S    cat
```

**Both members share PGID 4610**, distinct from the shell's, and both are in the shell's session. One
signal to the group hits both.

> **A note if you try this in a script or a non-interactive shell:** job control is off there, and
> everything shares the shell's process group. The separate PGID only appears in an **interactive**
> shell. *(I hit exactly this while verifying — the container's non-interactive bash showed one PGID
> for everything.)*

### The job control commands

```bash
sleep 300           # now press Ctrl+Z
jobs
bg %1               # resume it in the BACKGROUND (sends SIGCONT)
jobs -l
fg %1               # bring it to the FOREGROUND
                    # Ctrl+C to finish
```

| Action | Mechanism |
|---|---|
| `cmd &` | start in a background process group |
| **Ctrl+Z** | line discipline sends **SIGTSTP** to the foreground group |
| `bg` | sends **SIGCONT**; the group stays in the background |
| `fg` | sends SIGCONT **and** makes the group the terminal's foreground group |
| `jobs` | bash's own bookkeeping — not a kernel concept |
| `disown %1` | bash forgets the job, so it won't send SIGHUP at exit |

The `STAT` column decoder, which is worth knowing:

| Code | Meaning |
|---|---|
| `R` | running or runnable |
| `S` | interruptible sleep (waiting for something) |
| `D` | **uninterruptible sleep** — usually blocked on I/O; **`kill -9` won't work** |
| `T` | stopped (by SIGTSTP/SIGSTOP) |
| `Z` | zombie |
| `+` | in the **foreground** process group |
| `s` | session leader |
| `l` | multi-threaded |
| `<` / `N` | high / low priority |

`D` state is the one that surprises people: a process blocked in the kernel waiting on a dead NFS
mount or a failing disk **cannot be killed at all**, because signals are delivered on the way back to
userspace and it never gets there. That's not a bug; it's the price of not corrupting an in-flight
I/O operation.

### SIGHUP and `nohup`

When your terminal closes, the kernel sends **SIGHUP** to the session's foreground process group —
historically "the modem hung up." Default action: terminate. Which is why closing a terminal kills
what's running in it.

```bash
nohup sleep 300 &        # ignore SIGHUP; output goes to nohup.out
jobs -l
disown -h %1             # or: tell bash not to send HUP itself
rm -f nohup.out
```

For anything you actually want to survive, use `systemd-run --user`, `tmux`, or `screen` rather than
`nohup` — Volume 6 covers the first.

## 12.7 `/proc`, properly

You've been using it since Volume 1. Here's what it is: a **virtual filesystem** with no disk behind
it. Every read is a function call into the kernel that generates the answer on the spot.

```bash
mount | grep ' /proc '
ls -l /proc/$$/status        # size 0 — there is no file
wc -c < /proc/$$/status      # ...and yet it has content
```

```
proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)
-r--r--r-- 1 vishal vishal 0 Sep 10 06:20 /proc/4021/status
1443
```

**Zero bytes, 1443 bytes of content.** That's the tell: `/proc` files are generated on read.

The per-process entries worth knowing:

```bash
sleep 300 & P=$!
ls /proc/$P/
```

| Entry | What it gives you |
|---|---|
| `status` | human-readable: state, PPid, **Uid/Gid** (§11.3), threads, memory, signal masks |
| `cmdline` | the full argv, **NUL-separated** |
| `environ` | the environment at exec time (Volume 1 §6.4) |
| `fd/` | **symlinks to every open file descriptor** |
| `cwd`, `exe`, `root` | magic symlinks to the working directory, the binary, the root |
| `limits` | every `ulimit`, soft and hard |
| `maps`, `smaps` | the memory map |
| `stat`, `io`, `sched` | machine-readable counters |
| `cgroup` | which cgroup it's in — Volume 8 |

```bash
grep -E '^(Name|State|PPid|Uid|Gid|Threads|VmRSS):' /proc/$P/status
tr '\0' ' ' < /proc/$P/cmdline; echo
head -5 /proc/$P/limits
ls -l /proc/$P/fd/
kill $P
```

And system-wide:

```bash
cat /proc/loadavg          # 1/5/15-min load, running/total procs, last PID
cat /proc/uptime           # seconds up, seconds idle (summed across CPUs)
head -5 /proc/meminfo
grep 'model name' /proc/cpuinfo | head -1
cat /proc/sys/kernel/hostname
```

`/proc/sys/` is different in kind — it is **writable**, and writing to it changes kernel behaviour
live. That's what `sysctl` is:

```bash
sysctl kernel.pid_max
cat /proc/sys/kernel/pid_max        # the same value, same source
```

Volume 8 comes back to this.

---

# Chapter 13 — The Incident: When `sudo` Itself Was the Hole

## 13.1 The hook

> **`sudo` is one of the most heavily audited programs in existence.** It is setuid root, it is
> installed on essentially every Linux system, it is deliberately small, and it has been reviewed for
> forty years.
>
> **In January 2021 it was discovered that a bug had been sitting in it since July 2011 — ten years
> — that let any local user become root. You didn't need to be in `sudoers`. You didn't need any
> `sudo` privileges at all.**

## 13.2 CVE-2021-3156, "Baron Samedit"

> **Confidence: high** on the CVE number, the January 2021 disclosure by the Qualys Research Team,
> the ten-year window, and the impact. **Moderate** on my rendering of the exact C code below, which
> I am reconstructing rather than quoting, and on the Debian advisory number.

The name is Qualys's pun on Baron Samedi, the loa of the dead, and **`sudoedit`** — because that's
the command that reaches the bug.

| | |
|---|---|
| **Discovered by** | Qualys Research Team |
| **Disclosed** | 26 January 2021 |
| **Introduced** | July 2011, in a commit usually cited as `8255ed69` |
| **Affects** | sudo 1.8.2 – 1.8.31p2, and 1.9.0 – 1.9.5p1 |
| **Requires** | **a local shell account. Nothing else.** |
| **Gives** | **root** |
| **Debian fix** | a security advisory issued the same day (DSA-4839-1 is the commonly cited number) |

## 13.3 THE MECHANISM: an escaping loop that runs off the end of a string

This bug is worth understanding in detail, because it lives exactly in the machinery Volume 1 taught
you.

**The setup.** When you run `sudo -s` or `sudo -i`, sudo is going to hand your command to a shell.
Shell metacharacters therefore need **escaping** — a space in an argument must become `\ ` so the
shell doesn't split on it (Volume 1 §2.4's word splitting, defended against).

So sudo does two things:

1. In `parse_args()` — **escape** metacharacters in the arguments, when shell mode is set.
2. Later, in `set_cmnd()` — **un-escape** them again when building the command string for the
   sudoers policy check.

The un-escaping loop looked substantially like this:

```c
for (to = user_args, av = NewArgv + 1; (from = *av); av++) {
    while (*from) {
        if (from[0] == '\\' && !isspace((unsigned char)from[1]))
            from++;                    /* skip the backslash */
        *to++ = *from++;               /* copy the escaped character */
    }
    *to++ = ' ';
}
```

Now feed it an argument that **ends with a lone backslash**:

```
   argument in memory:      ...  'x'  '\\'  '\0'
                                        ↑
                              from points here
```

Step through it:

| Check | Result |
|---|---|
| `*from` is `'\\'` → loop body runs | ✔ |
| `from[0] == '\\'` | **true** |
| `isspace(from[1])` where `from[1]` is `'\0'` | **false** — NUL is not whitespace |
| so: `from++` | **`from` now points AT the terminating NUL** |
| then: `*to++ = *from++` | **copies the NUL and advances PAST the end of the string** |
| loop condition `while (*from)` | now reads **whatever memory follows** |

**The loop has escaped the string.** It keeps copying — past the end of the argument, through
whatever else is on the heap — writing all of it into a buffer that was sized for the original
arguments. A classic **heap buffer overflow**, with the attacker controlling both how far it runs and
what gets written.

**Why it wasn't triggered for a decade:** the escaping in step 1 normally guarantees no argument ends
in an unescaped backslash. But `sudoedit` (i.e. `sudo -e`) sets a different mode, and the combination
**`sudoedit -s`** set the shell flag while skipping the escaping — leaving the un-escaper to process
input that was never escaped.

Qualys built working exploits for Ubuntu 20.04, Debian 10, and Fedora 33.

## 13.4 Check your own machine

The check Qualys published is non-destructive — `sudoedit` just errors out either way:

```bash
sudoedit -s /
```

| Output begins with | Means |
|---|---|
| **`usage:`** | **patched** |
| **`sudoedit:`** | vulnerable |

> **Confidence: moderate-high** on this being the published check. On any currently-supported Debian
> you will see `usage:`. If you want a second opinion:

```bash
sudo --version | head -1
dpkg -l sudo | tail -1
```

## 13.5 Why this one is worth dwelling on

Three things, and they're all uncomfortable:

**1. The program whose entire purpose is guarding a boundary was the way through it.** §11.8 argued
that a setuid binary is code running with full privilege under an unprivileged user's complete
control — arguments, environment, descriptors, everything. Baron Samedit is that argument's proof:
the attack came in through **`argv`**, the most ordinary input there is, prepared by the shell exactly
as Volume 1 §2.6 described.

**2. Ten years, in the most-audited setuid binary on Linux.** Not obscure code. Not a rarely-used
feature. Reachable by a mode combination nobody had thought to test together. If that can hide for a
decade in `sudo`, the base rate for less-scrutinised setuid programs is not encouraging — which is
the real argument for shrinking the setuid list (§11.8's capabilities note) rather than auditing it
harder.

**3. Memory safety.** The bug is a C pointer walking off the end of a NUL-terminated string. It is not
a logic error, a policy mistake, or a misconfiguration — nothing in `/etc/sudoers` could have
prevented it. This is a substantial part of why there is now serious work on memory-safe
reimplementations of core system tools, including a Rust `sudo`.

> **The pattern, and it should look familiar.** Volume 1 §7.5 concluded that Shellshock's real fix
> was to make the data/code boundary **structural** rather than a matter of parsing carefully. Baron
> Samedit is the same shape one layer down: **a string was assumed to have a form (properly escaped)
> that it did not have, and the code did exactly what it was told with the bytes it actually got.**
>
> Volume 1 §7's Steam incident, Shellshock, and Baron Samedit are three instances of one bug.

## 13.6 A design-level companion: why setuid doesn't work on scripts

Not every sharp edge is a coding bug. Here is one the Unix designers had to close by **removing a
feature**, and you can observe the rule on your own machine.

Try to make a setuid shell script *(fully verified)*:

```bash
cd /tmp
printf '#!/bin/bash\necho "real=$(id -ru)  effective=$(id -u)"\n' > suid-test.sh
sudo chown root:root suid-test.sh
sudo chmod 4755 suid-test.sh          # chmod AFTER chown — §11.7
ls -l suid-test.sh
./suid-test.sh
sudo rm -f suid-test.sh
```

```
-rwsr-xr-x 1 root root 55 Sep 10 06:05 suid-test.sh
real=1000  effective=1000
```

**The `s` bit is right there in `ls`, and the kernel ignored it completely.** Compare with §11.3's
setuid copy of `id`, which gave `0` — the difference is that one is a binary and one is a script.

**Why:** Volume 1 §2.7 described the `#!` mechanism. It is a **two-step** operation:

```
   1. kernel opens the script, reads "#!/bin/bash"
   2. kernel execs /bin/bash, passing THE SCRIPT'S PATH as an argument
   3. bash then OPENS THAT PATH ITSELF
```

Between step 1 and step 3 there is a window in which **the path can be made to point at a different
file** — classically by replacing a symlink. The kernel resolved the path and granted privilege based
on file A; bash then opens the path and executes file B, **with the privilege granted for A.**

That is a time-of-check-to-time-of-use race, it is inherent to the two-step design, and it cannot be
fixed without changing how `#!` works. So **Linux simply ignores the setuid and setgid bits on
interpreted scripts.** It's documented in `execve(2)`:

```bash
man 2 execve | grep -A6 -i 'set-user-ID'
```

If you genuinely need a script to run with privilege, the answer is a `sudoers` rule for that
specific script — which puts the decision in a policy file that `visudo` will check, rather than in a
permission bit that lies to you.

---

# TRY THIS ON YOUR MACHINE

Six things that make Volume 2's machinery visible. **All of these were run and verified while
writing.** Everything is confined to `/tmp` and your home directory, nothing needs a reboot, and
cleanup is included in every block.

> **One safety note:** items 1 and 2 create a **setuid-root file in `/tmp`**. Each block removes it at
> the end. Don't skip that step, and don't leave one lying around.

---

## 1. Build a setuid binary and watch one command give two answers

**Needs:** `sudo`.

```bash
cp /usr/bin/id /tmp/myid
sudo chown root:root /tmp/myid
sudo chmod 4755 /tmp/myid        # chmod AFTER chown — see item 2
ls -l /tmp/myid

echo -n "effective UID: "; /tmp/myid -u
echo -n "real UID:      "; /tmp/myid -ru

sudo rm -f /tmp/myid             # ← do not skip
```

**What you should see:** `-rwsr-xr-x`, then `0` and then your own UID (usually `1000`).

**Why it's interesting:** the same binary, invoked once, reports two different identities. That split
— real UID says who you are, effective UID says whose privileges you're borrowing — is the entire
mechanism behind `passwd`, `su`, `mount` and `sudo`, and it's normally invisible because for ordinary
programs the two numbers are equal. Cross-check with `grep Uid: /proc/self/status`, which shows all
four (real, effective, saved, filesystem) at once.

---

## 2. Watch `chown` silently disarm a setuid bit

**Needs:** `sudo`. This is the mistake I made while writing §11.3.

```bash
cd /tmp && printf '#!/bin/bash\necho hi\n' > su.sh

sudo chown root:root su.sh
sudo chmod 4755 su.sh
echo -n "after chmod:          "; ls -l su.sh | awk '{print $1}'

sudo chown root:root su.sh       # change the owner to what it already is
echo -n "after a second chown: "; ls -l su.sh | awk '{print $1}'

rm -f su.sh
```

**What you should see:**

```
after chmod:          -rwsr-xr-x
after a second chown: -rwxr-xr-x
```

**Why it's interesting:** a `chown` that changed *nothing* silently removed the setuid bit. This is a
deliberate kernel defence: if ownership transfer preserved setuid, an attacker could prepare a
malicious binary and trick an admin into `chown root`-ing it, creating a setuid-root backdoor out of
someone else's file. It's also the reason for a rule you'll otherwise learn the hard way — **always
`chmod` after `chown`, never before.**

---

## 3. Delete root's file, then fail to — the sticky bit, A/B

**Needs:** `sudo`.

```bash
# WITHOUT the sticky bit
mkdir -p /tmp/nosticky && chmod 777 /tmp/nosticky
sudo touch /tmp/nosticky/roots-file
ls -ld /tmp/nosticky ; ls -l /tmp/nosticky/roots-file
rm /tmp/nosticky/roots-file          # as YOU
ls /tmp/nosticky/                     # gone?
sudo rm -rf /tmp/nosticky

# WITH the sticky bit — /tmp itself, mode 1777
ls -ld /tmp
sudo touch /tmp/roots-file
rm /tmp/roots-file                    # as YOU
sudo rm -f /tmp/roots-file
```

**What you should see:** in the first case, you delete a root-owned file you have no write access to.
In the second, `rm: cannot remove '/tmp/roots-file': Operation not permitted`.

**Why it's interesting:** identical directory permissions (`777` vs `1777`), one bit of difference,
and the difference is whether any user on the system can wipe out any other user's temporary files —
including root's. It also demonstrates §10.5's rule concretely: **deletion is governed by the
directory, not the file.** The `t` in `drwxrwxrwt` is the only thing standing between `/tmp` and
chaos.

---

## 4. Make a directory you can enter but not list

**Needs:** nothing. **Run as your normal user — `sudo` bypasses all permission checks.**

```bash
mkdir -p /tmp/rx && touch /tmp/rx/alpha /tmp/rx/beta

echo "--- 400: readable, not traversable ---"
chmod 400 /tmp/rx
ls /tmp/rx ; ls -l /tmp/rx ; cat /tmp/rx/alpha

echo "--- 100: traversable, not readable ---"
chmod 100 /tmp/rx
ls /tmp/rx ; stat -c '%n is %s bytes' /tmp/rx/alpha

chmod 755 /tmp/rx && rm -rf /tmp/rx
```

**What you should see:** with `400`, `ls` prints the names but `ls -l` and `cat` both fail with
Permission denied. With `100`, `ls` fails outright but `stat` on a known filename succeeds.

**Why it's interesting:** `r` and `x` on a directory are genuinely independent capabilities —
*knowing what's there* and *being able to reach it* — and you can have either without the other. The
`x`-without-`r` mode is deployed in the real world: a `711` directory lets people use paths you gave
them without letting them enumerate what else is in there. Check `ls -ld /home/*` on a multi-user
box and you'll often find it.

---

## 5. Create a zombie and discover you can't kill it

**Needs:** `python3` (present on a default Debian install).

```bash
python3 -c '
import os, time
if os.fork(): time.sleep(15)   # parent deliberately never wait()s
else: os._exit(0)              # child exits at once
' &

sleep 1
ps -eo pid,ppid,stat,cmd | awk 'NR==1 || $3 ~ /^Z/'
```

Note the zombie's PID from that output, then:

```bash
kill -9 <ZOMBIE_PID>                              # try to kill it
ps -eo pid,ppid,stat,cmd | awk '$3 ~ /^Z/'        # still there

kill <PARENT_PID>                                  # kill the PARENT instead
sleep 1
ps -eo pid,stat,cmd | awk '$2 ~ /^Z/' ; echo "(gone)"
```

**What you should see:** `Z` state and `[python3] <defunct>`. `kill -9` does nothing. Killing the
parent makes it vanish instantly.

**Why it's interesting:** `kill -9` is supposed to be the thing that always works, and here it does
nothing at all — because there is nothing left to signal. A zombie is a **PID and an exit status and
nothing else**; its memory, descriptors and command line are already gone (hence `<defunct>`). It
exists purely because the exit status has to survive until the parent asks for it. When it's
reparented to PID 1 on the parent's death, systemd reaps it immediately, which is why the last step
works.

---

## 6. Debian-specific: audit your privilege surface

**Needs:** `sudo`. Nothing here changes anything.

```bash
echo "=== is root locked? ==="
sudo passwd -S root

echo; echo "=== what am I allowed to do? ==="
sudo -l

echo; echo "=== every setuid binary on this system ==="
find / -perm -4000 -type f 2>/dev/null | sort

echo; echo "=== every setgid binary ==="
find / -perm -2000 -type f 2>/dev/null | sort

echo; echo "=== capabilities instead of setuid ==="
getcap -r /usr/bin /usr/sbin 2>/dev/null

echo; echo "=== sudo throws your environment away ==="
FOO=bar sudo env | grep '^FOO=' || echo "FOO stripped by env_reset"
echo "your PATH:  $PATH"
sudo sh -c 'echo "sudo PATH: $PATH"'
```

**What you should see:** `root L` if you left the root password blank at install; a setuid list of
roughly ten to fifteen entries; `chage` and `expiry` as setgid `shadow`; `ping` (and possibly others)
carrying `cap_net_raw` instead of being setuid; and `FOO` stripped, with a `PATH` that isn't yours.

**Why it's interesting:** that setuid list is the complete inventory of programs on your machine
where a single bug means root — Chapter 13's list, for your specific system. It's short, which is the
point. And the last two commands show `sudo` actively refusing to trust two things Volume 1 taught
you are inherited by default: the environment (Shellshock's vector) and `$PATH` (the trojan vector).
Both are thrown away and rebuilt, because **allowlisting is the only defence that scales.**

---

# Volume 2 Retrospective

**1. The multi-user model was built to separate people and is now used to separate programs.** Your
laptop has forty users because every network-facing service runs as its own unprivileged account with
`/usr/sbin/nologin` as its shell. Same nine bits, completely different threat model, no modification
required — which is a decent argument that the 1971 simplification was the right one.

**2. Nine bits, because three classes × three operations, and octal because three bits is exactly one
octal digit.** That's the whole derivation. `r`=4, `w`=2, `x`=1 are bit positions, so you add rather
than memorise. And the type bits plus the permission bits together are exactly sixteen — one PDP-11
word, visible in `stat -c %f` today.

**3. `r`, `w` and `x` mean different things on directories, and the deletion rule follows.** `x` means
*traverse*, not execute — so a `100` directory is enterable but unlistable. And **deleting a file
requires write permission on the directory, not the file**, because deletion removes a name from a
directory. A mode-`000` file you own deletes fine; a `644` file in a `555` directory won't.

**4. Passwords have been hashed and salted since 1979, and the reasoning still holds.** Morris and
Thompson made guessing expensive in *time* and made precomputation useless with a salt. yescrypt
makes it expensive in *memory*, because that's what today's attack hardware is short of. `/etc/passwd`
must stay world-readable so `ls -l` can print owner names — which is precisely why the hashes had to
move to `/etc/shadow`.

**5. Setuid is one line in `execve()` and it's the foundation of the whole privilege model.** Real
UID says who you are; effective UID says whose privileges you're using. You can see both from one
binary in one command. And `chown` silently strips the bit, deliberately, which is why you always
`chmod` last.

**6. Debian's locked root account is an attribution decision more than a security one.** No shared
secret, revocation by group membership, and — the strongest argument — `journalctl -t sudo` tells you
*who* ran *what*. The honest counterweights: `sudo` is itself a large setuid-root C program, and
`sudo -i` throws away the granularity anyway.

**7. `sudo`'s `env_reset` and `secure_path` are direct answers to Volume 1.** Shellshock exploited
transparent environment inheritance; `sudo` discards the environment. The `$PATH` trojan exploited
search order; `sudo` discards your `$PATH`. Both are **allowlists replacing trust**, which is the
same structural fix as Shellshock's `BASH_FUNC_` namespace.

**8. `128 + N` is closed.** A signal is an asynchronous kernel notification; SIGKILL and SIGSTOP are
uncatchable by guarantee; and `yes | head` terminates because the kernel sends SIGPIPE — which is
part of why pipes needed no changes to existing programs in 1973.

**9. Three incidents, one shape.** Steam's empty variable, Shellshock's `() {` prefix, and Baron
Samedit's trailing backslash are all the same bug: **a string was assumed to have a form it didn't
have, and the code did exactly what it was told with the bytes it actually received.**

---

# Volume 2 is ready

**File: `volume-2-users-permissions-processes.md`**

## What Volume 3 will cover: THE FILESYSTEM, DEEPLY

Volume 2 kept bumping into the filesystem and deferring. Volume 3 stops deferring.

- **"Everything is a file"** — where the philosophy came from, and what it actually buys you. You've
  already used it without naming it: `/proc/$$/environ` is a *process's memory* read as a file,
  `/proc/$$/fd/3` is an *open descriptor* read as a file, and `/dev/null` is a character device with
  permission bits (§10.3). Volume 3 explains why sockets, devices and kernel state are all
  addressable by the same three syscalls.
- **Inodes** — what one actually stores, and hard links versus symlinks explained through what an
  inode *number* is. Volume 1 §3.4's two-names-one-file demo gets taken apart properly, including why
  the link count matters and why deleting an open file frees no space.
- **The Filesystem Hierarchy Standard** — why `/etc`, `/var`, `/usr`, `/home` and `/opt` are separate
  concepts, plus the historical reasons for some of the splits. Including the widely-repeated claim
  that `/usr` exists because a disk filled up at Bell Labs — **which I'll actually check rather than
  repeat**, since it's exactly the kind of story that improves with retelling.
- **Mounting, disks and partitions** — the things you clicked through during installation, explained
  now: what a partition table is, what `/etc/fstab` does, what a UUID is for, and why your `/boot`
  is separate.
- **File descriptors and redirection** — the general concept of a **stream**, why stdin/stdout/stderr
  are three separately numbered channels rather than two, and what `2>&1` is really doing. Volume 1
  §2.6 showed `dup2()` making redirection work; Volume 3 shows why the design has held up for fifty
  years.
- **TRY THIS ON YOUR MACHINE** — including watching a file survive its own deletion, filling and
  recovering an inode table, and finding out what's actually holding your disk space hostage.

Say **continue** when you'd like Volume 3.
