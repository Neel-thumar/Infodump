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

