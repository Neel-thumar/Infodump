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

