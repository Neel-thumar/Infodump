# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 3 — The Filesystem, Deeply

---

### Where Volumes 1 and 2 left off

You have already used the filesystem as something other than a place to keep documents, three times,
without it being explained:

| What you did | Volume | What it really was |
|---|---|---|
| `tr '\0' '\n' < /proc/$$/environ` | 1 §6.3 | reading **a process's memory** as a file |
| `cat /proc/$$/fd/3` after deleting the file | 1 §3.4 | reading **an open file descriptor** as a file |
| `stat -c '%f' /dev/null` → `0x21b6` | 2 §10.3 | a **character device** with ordinary permission bits |

None of those are documents. All of them opened with `open()`, read with `read()`, and obeyed the
nine permission bits from Volume 2 §10. **That is not an accident, and this volume is about why.**

Volume 3 also settles three specific debts:

| Debt | Where |
|---|---|
| Why deleting an open file frees no space (V1 §3.4) | §15.6 |
| Why `rm` needs write permission on the *directory* (V2 §10.5) | §15.3 |
| The claim that `/usr` exists because a disk filled up — which I said I'd **check** | §16.4 |

**Requirements.** Everything here runs on a stock Debian install. A few demonstrations need `sudo`.
Two optional packages make things nicer:

```bash
sudo apt install manpages       # for `man hier`
sudo apt install strace         # if you skipped it in Volume 1
```

**As in Volume 2, every demonstration in this volume was run before it was written down.** One of
them produced a result I would otherwise have asserted incorrectly — §19.6 — and that correction is
left visible.

---

# Chapter 14 — "Everything Is a File," and Where That Stops Being True

## 14.1 The hook

> **`/dev/null` has permission bits. `/proc/1234/environ` has an owner. You can `cat` a keyboard and
> `>` into a hard disk.**
>
> **Why would an operating system deliberately make a keyboard look like a text file?**

## 14.2 THE PROBLEM: how many interfaces should a system have?

Imagine designing an OS in 1970. Programs need to interact with:

- documents on disk
- terminals
- tape drives
- printers
- other programs
- the system's own state

The obvious approach — the approach most systems of the era took — is a **separate API for each**.
Reading a file uses one set of calls, reading a terminal uses another, writing to tape uses a third.
Each is tuned to its device.

The cost only becomes visible when you try to compose things:

```
   Want to send a program's output to a printer instead of a file?
        → rewrite the program, against the printer API.

   Want to feed one program's output into another?
        → invent an inter-program communication API, and rewrite both.

   Want a program to read from a terminal instead of a file?
        → a third code path.
```

**Every combination of source and destination needs its own code, in every program.** With *n*
kinds of thing, you have *n²* problems.

## 14.3 THE MECHANISM: one namespace, one small set of calls

Unix's answer was to make **almost everything reachable through a single hierarchical namespace**,
manipulated by a handful of system calls:

```
    open()   read()   write()   close()   lseek()   stat()
```

If your program reads from a file descriptor and writes to a file descriptor, **it does not need to
know what is behind them.** The *n*² problem collapses.

Look at the range of things this covers. The type character in `ls -l` is the top four bits of
`st_mode` (Volume 2 §10.3), rendered:

```bash
for f in /etc/passwd /etc /bin /dev/null /dev/sda /run/systemd/private; do
  [ -e "$f" ] && stat -c '%A  %-22F %n' "$f"
done
```

```
-rw-r--r--  regular file           /etc/passwd
drwxr-xr-x  directory              /etc
lrwxrwxrwx  symbolic link          /bin
crw-rw-rw-  character special file /dev/null
brw-rw----  block special file     /dev/sda
srwxrwxrwx  socket                 /run/systemd/private
```

*(Verified; your exact set will differ.)*

| Char | Type | Example |
|---|---|---|
| `-` | regular file | `/etc/passwd` |
| `d` | directory | `/etc` |
| `l` | symbolic link | `/bin` — that's the usr-merge, §16.5 |
| `c` | **character device** — byte stream | `/dev/null`, `/dev/random`, your terminal |
| `b` | **block device** — addressable blocks | `/dev/sda`, `/dev/nvme0n1` |
| `p` | **named pipe (FIFO)** | §14.4 |
| `s` | **socket** | `/run/systemd/private` |

### The three things this buys you

**1. Composability — this is Volume 1 §1.4's pipes, explained.** Volume 1 claimed that adding pipes
in 1973 required changing *zero* existing programs. This is why: those programs already read fd 0
and wrote fd 1 without asking what was behind them. Pipes just put something new behind them.

```bash
wc -l < /etc/passwd            # fd 0 is a FILE
ls /etc | wc -l                # fd 0 is a PIPE
wc -l                          # fd 0 is your TERMINAL (Ctrl+D to end)
```

**Same program, three completely different kinds of thing, no conditional code.**

**2. The permission model applies to everything, for free.** Volume 2 spent a chapter deriving nine
bits for files. Those same nine bits govern who may read your microphone:

```bash
ls -l /dev/null /dev/sda /dev/snd/* 2>/dev/null | head -5
```

```
crw-rw-rw- 1 root root    1, 3 Sep 10 07:00 /dev/null
brw-rw---- 1 root disk    8, 0 Sep 10 07:00 /dev/sda
```

`/dev/null` is `666` — anyone may write to it. `/dev/sda` is `660 root:disk` — **which is why being
in the `disk` group is equivalent to being root**, since you could read and rewrite the raw
filesystem. Volume 2 §11.8's "audit your privilege surface" should have included `getent group disk`.

**3. Kernel state becomes shell-scriptable.** `/proc` and `/sys` are entire filesystems that are not
backed by any disk. Volume 2 §12.7 covered `/proc`; here's its sibling:

```bash
cat /sys/class/power_supply/BAT0/capacity 2>/dev/null   # battery %
cat /sys/class/net/*/operstate                           # link up/down
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null
ls /sys/class/
```

No API, no library, no bindings. `cat`.

### The two numbers on a device file

Notice `1, 3` and `8, 0` where a file size would be. Those are the **major** and **minor** device
numbers:

```bash
stat -c '%n: major=%t minor=%T (hex)' /dev/null /dev/zero /dev/random
```

- **Major** selects the *driver* in the kernel.
- **Minor** selects *which device* that driver should handle.

The file in `/dev` contains no data at all. It's a **name in the filesystem carrying a pair of
numbers**, which is how a name in a directory becomes a route into a driver.

## 14.4 A file that is a pipe: FIFOs

Volume 1's `|` creates an anonymous pipe that only the shell's children can see. A **named pipe** is
the same kernel object with a name in the filesystem, so unrelated programs can meet at it.

```bash
cd /tmp
mkfifo mypipe
ls -l mypipe
```

```
prw-r--r-- 1 vishal vishal 0 Sep 10 07:20 mypipe
```

**Type `p`.** Size 0 — there is no storage. Use it:

```bash
cat < /tmp/mypipe &          # blocks, waiting for a writer
sleep 0.5
echo "hello through a filesystem object" > /tmp/mypipe
rm /tmp/mypipe
```

```
hello through a filesystem object
```

Two unrelated processes just communicated, using `cat` and `echo` — programs with no IPC code
whatsoever — because the meeting point had a filename.

## 14.5 Where the abstraction leaks, honestly

"Everything is a file" is a slogan, and slogans are lossy. Three genuine exceptions:

### Sockets are not really files

You cannot `open("/some/tcp/connection")`. Network sockets require their own calls — `socket()`,
`bind()`, `listen()`, `connect()`, `accept()` — and only *after* that do you get a descriptor you can
`read()` and `write()`. Even Unix-domain sockets, which *do* have a filesystem path, cannot be
usefully `open()`ed; the path is a rendezvous point, not a file.

```bash
ls -l /run/systemd/private          # type 's' — it has a name
cat /run/systemd/private            # ...but you can't just read it
```

Volume 5 covers why networking needed its own API.

### `ioctl()` is the admission that it leaks

Some operations simply cannot be expressed as reading or writing bytes. "Rewind this tape." "Set
this terminal to 9600 baud." "Eject." So Unix added `ioctl()` — *I/O control* — a catch-all:

```
    ioctl(fd, REQUEST_NUMBER, argument)
```

You already used it. Volume 1 §2.3's line-discipline demo:

```bash
strace -e trace=ioctl stty -a 2>&1 | grep -c ioctl
```

`stty` is a thin wrapper around `ioctl()` on your terminal. Every `ioctl` request number is a
device-specific escape from the uniform interface — which is why `ioctl` is often described as the
place where Unix's elegance goes to hide.

### Plan 9 shows how far it *could* have gone

The same Bell Labs group — Rob Pike, Ken Thompson and others — later built **Plan 9 from Bell Labs**,
which took the idea seriously: network connections, the window system, process control, and even the
graphics display were all file hierarchies you could `cat` and `echo` into. Unix never went that far.

> **Confidence: high** that Plan 9 exists, came from the same group, and radicalised this principle.
> Linux borrowed pieces back — `/proc`, `/sys`, and the `9p` protocol (used by some VMs and by WSL2)
> are all Plan 9 influence.

> **The honest summary:** "everything is a file" is not literally true and never was. What *is* true,
> and what matters, is that **the default assumption is that a thing should be reachable by name in
> one hierarchy and manipulated with `read` and `write`** — and you need a reason to deviate. That
> default is why `cat`, `grep` and `>` work on a range of objects their authors never imagined.

---

# Chapter 15 — Inodes: The File That Has No Name

## 15.1 The hook

> **Delete a file and its data can survive. Rename a 40 GB file and nothing moves. Two different
> filenames can be the *same file*, indistinguishable in every way.**
>
> **All three follow from one fact: a file's name is not part of the file.**

## 15.2 THE PROBLEM: where do you keep a file's metadata?

A file needs a name, permissions, an owner, timestamps, a size, and a list of which disk blocks hold
its data. The naive design puts all of that in the directory entry.

That design makes three things impossible or awkward:

- A file can only have **one** name, in **one** place.
- Renaming means rewriting metadata, not just an entry.
- Two programs referring to "the same file" have no way to know they mean the same object.

Unix separates them:

> **The *inode* holds everything about a file except its name.**
> **The *directory* holds nothing but names and inode numbers.**

## 15.3 THE MECHANISM: two structures, one number

```
   DIRECTORY /home/vishal              INODE TABLE (per filesystem)
   ┌─────────────────┬─────────┐       ┌──────────────────────────────────┐
   │ name            │ inode # │       │ inode 2801667                    │
   ├─────────────────┼─────────┤       │   type: regular file             │
   │ .               │  524289 │       │   mode: 0644                     │
   │ ..              │       2 │       │   uid: 1000   gid: 1000          │
   │ notes.txt       │ 2801667 │──────►│   size: 29 bytes                 │
   │ backup.txt      │ 2801667 │──────►│   LINK COUNT: 2                  │
   │ report.pdf      │ 2801902 │       │   atime / mtime / ctime / btime  │
   └─────────────────┴─────────┘       │   → data block pointers          │
                                       └──────────────────────────────────┘
              ↑                                      ↑
      names live HERE                    everything else lives HERE
                                         and there is NO NAME in it
```

Three consequences fall straight out, and each explains something you've already met:

**1. `mv` within a filesystem moves no data** (Volume 1 §3.4). It edits directory entries. The inode
is untouched, and so are the data blocks.

**2. Deleting requires write permission on the *directory*** (Volume 2 §10.5). Deletion removes a
*name*, which is a modification of the directory. The file's own mode is irrelevant — that's now not
a quirk but a definition.

**3. One inode can have several names.** That's a hard link.

## 15.4 Seeing it: hard links

`ls -i` prints the inode number. *(This whole sequence is verified.)*

```bash
cd /tmp && rm -rf idemo && mkdir idemo && cd idemo

echo "original content" > a.txt
ln a.txt b.txt                # HARD link — a second name
ln -s a.txt c.txt             # SYMBOLIC link — a different thing entirely

ls -li a.txt b.txt c.txt
```

```
2801667 -rw-r--r-- 2 vishal vishal 17 Sep 10 07:17 a.txt
2801667 -rw-r--r-- 2 vishal vishal 17 Sep 10 07:17 b.txt
2801668 lrwxrwxrwx 1 vishal vishal  5 Sep 10 07:17 c.txt -> a.txt
```

Read that carefully:

- `a.txt` and `b.txt` have **the same inode number** (2801667) and **link count 2**.
- `c.txt` has a **different inode** (2801668), type `l`, and **size 5** — which is the length of the
  string `"a.txt"`. **A symlink's data is the path it points to.**

Now the demonstration that they are genuinely the same file:

```bash
echo "added via b" >> b.txt
cat a.txt
```

```
original content
added via b
```

Not a copy. Not synchronised. **The same file, reached by two names.**

```bash
stat a.txt | head -4
```

```
  File: a.txt
  Size: 29        	Blocks: 8          IO Block: 4096   regular file
Device: 254,0	Inode: 2801667     Links: 2
Access: (0644/-rw-r--r--)  Uid: (    0/    root)   Gid: (    0/    root)
```

And the payoff — delete one name:

```bash
rm a.txt
ls -li b.txt c.txt
cat b.txt
cat c.txt
```

```
2801667 -rw-r--r-- 1 vishal vishal 29 Sep 10 07:17 b.txt
2801668 lrwxrwxrwx 1 vishal vishal  5 Sep 10 07:17 c.txt -> a.txt
original content
added via b
cat: c.txt: No such file or directory
```

> **Link count dropped from 2 to 1. `b.txt` is fine — the data was never "in" `a.txt`. And the
> symlink is now dangling**, because it stores the *string* `a.txt`, and that name no longer resolves.

That is the whole difference, in one output.

```bash
cd /tmp && rm -rf idemo
```

## 15.5 Hard links versus symlinks

| | **Hard link** | **Symbolic link** |
|---|---|---|
| What it is | **another directory entry** for an existing inode | **its own inode**, containing a path string |
| Inode number | **same** as the target | different |
| Increments link count | **yes** | no |
| Survives target's deletion | **yes** — it *is* the file | **no** — it dangles |
| Can cross filesystems | **no** | **yes** |
| Can point to a directory | **no** | **yes** |
| Can be created before the target exists | no | **yes** |
| Costs disk space | nothing (one directory entry) | one inode + the path string |
| `ls -l` shows | nothing special | `-> target` |

### Why hard links can't cross filesystems

Because **an inode number is only meaningful within one filesystem.** Inode 2801667 exists on your
root filesystem; a different inode 2801667 probably exists on your USB stick. A directory entry
stores only a number, with no room for "and on which device."

Verified:

```bash
df --output=source,target /tmp /dev/shm
ln /tmp/somefile /dev/shm/xlink
```

```
ln: failed to create hard link '/dev/shm/xlink' => '/tmp/somefile':
    Invalid cross-device link
```

`EXDEV` — the same error Volume 1 §3.4 said forces `mv` to fall back to copy-and-delete.

### Why hard links to directories are forbidden

```bash
mkdir -p /tmp/dcount/one
ln /tmp/dcount/one /tmp/dcount/hl
```

```
ln: /tmp/dcount/one: hard link not allowed for directory
```

*(Verified.)* If it were allowed, you could create a **cycle** — a directory containing a link to one
of its own ancestors. Then:

- The filesystem stops being a tree and becomes a general graph.
- `find`, `du`, `rm -r` and every recursive tool loops forever unless it tracks visited inodes.
- `..` becomes ambiguous — which parent?
- Reference counting can never reach zero for a cycle, so the space is never freed.

The tree structure is load-bearing, and this restriction is what preserves it.

### The directory link count, finally explained

Here's a number you've seen a thousand times and probably never decoded:

```bash
cd /tmp && rm -rf dcount && mkdir dcount
stat -c 'links=%h  %n' dcount
mkdir dcount/one; stat -c 'links=%h  %n' dcount
mkdir dcount/two; stat -c 'links=%h  %n' dcount
stat -c 'links=%h  %n' dcount/one
rm -rf dcount
```

```
links=2  dcount
links=3  dcount
links=4  dcount
links=2  dcount/one
```

*(Verified.)* **An empty directory has link count 2, and gains one per subdirectory.** Why:

```
    dcount's inode is pointed at by:
      1. the entry "dcount" in its PARENT             ─┐
      2. the entry "."  inside dcount itself           ├─ that's 2, always
                                                      ─┘
      3. the entry ".." inside dcount/one              ─┐
      4. the entry ".." inside dcount/two               ├─ +1 per subdirectory
                                                       ─┘
```

**`.` and `..` are real hard links**, which is the one place directory hard links exist — created by
the kernel, never by you. So `links = 2 + (number of subdirectories)`, and you can count a
directory's children without listing it:

```bash
stat -c '%h - 2 = %n has that many subdirectories' /etc
ls -d /etc/*/ | wc -l
```

## 15.6 The debt from Volume 1: deleting an open file

Volume 1 §3.4 showed that deleting a file a process still has open doesn't really delete it, and
promised an explanation. Here it is, with the mechanism now visible.

> **Data is freed when the link count reaches zero *and* no process has the file open.**

The kernel tracks both. `unlink()` decrements the link count; the last `close()` checks whether both
conditions hold.

*(Verified.)*

```bash
cd /tmp
dd if=/dev/zero of=big.bin bs=1M count=50 2>/dev/null
df -h /tmp | tail -1

exec 9< big.bin              # open it on descriptor 9 in this shell
rm big.bin                   # remove the ONLY name
ls big.bin                   # gone from the directory

ls -l /proc/$$/fd/9
stat -Lc 'still %s bytes' /proc/$$/fd/9
df -h /tmp | tail -1         # space NOT reclaimed

exec 9<&-                    # close it — NOW the space is freed
df -h /tmp | tail -1
```

```
lr-x------ 1 vishal vishal 64 Sep 10 07:18 /proc/483/fd/9 -> /tmp/big.bin (deleted)
still 52428800 bytes
```

**Look at that symlink target: `/tmp/big.bin (deleted)`.** The kernel is telling you exactly what
happened — the name is gone, the inode is not, and the descriptor still reaches it.

> **This is the single most useful piece of sysadmin knowledge in this volume.** You delete a 40 GB
> log file, `df` shows no change, and you conclude the filesystem is broken. It isn't: some daemon
> still has it open. Find it:
>
> ```bash
> sudo lsof +L1                  # files with link count < 1 (needs: apt install lsof)
> sudo ls -l /proc/*/fd/* 2>/dev/null | grep '(deleted)'
> ```
>
> The fix is to restart or signal the holder — or, if it's a log, truncate it in place with
> `: > /var/log/thing.log` rather than deleting it, which keeps the inode alive and frees the blocks.

## 15.7 What else is in an inode

```bash
cd /tmp && echo hello > st.txt && stat st.txt
```

```
  File: st.txt
  Size: 6         	Blocks: 8          IO Block: 4096   regular file
Device: 254,0	Inode: 2801667     Links: 1
Access: (0644/-rw-r--r--)  Uid: ( 1000/ vishal)   Gid: ( 1000/ vishal)
Access: 2026-09-10 07:17:51.552297470 +0000
Modify: 2026-09-10 07:17:51.546928403 +0000
Change: 2026-09-10 07:17:51.546928403 +0000
 Birth: 2026-09-10 07:17:51.534928402 +0000
```

**Four timestamps, and they are not what people assume:**

| Shown as | Real name | Updated when |
|---|---|---|
| **Access** | `atime` | the file's **contents are read** |
| **Modify** | `mtime` | the file's **contents change** |
| **Change** | `ctime` | **the inode changes** — contents *or* permissions, owner, link count |
| **Birth** | `btime`/`crtime` | creation. ext4 records it; older tools can't show it |

The `ctime` distinction catches people out:

```bash
chmod 600 st.txt && stat -c 'mtime=%y%nctime=%z' st.txt
```

`chmod` changed **ctime but not mtime** — the contents didn't change, the inode did. And **you cannot
set `ctime`**; `touch -d` can forge atime and mtime, but ctime is maintained by the kernel, which is
why forensics cares about it.

> `atime` is expensive — reading a file would mean *writing* to update it. Modern Linux mounts
> default to **`relatime`**, which only updates atime if it's older than mtime or more than a day
> stale. Check yours:
>
> ```bash
> findmnt -no OPTIONS /
> ```

**And note `Size: 6` versus `Blocks: 8`.** Those are independent, which leads to the strangest thing
in this chapter.

## 15.8 Sparse files: a gigabyte that occupies nothing

```bash
truncate -s 1G /tmp/sparse
ls -lh /tmp/sparse | awk '{print "ls -lh says: "$5}'
du -h  /tmp/sparse | awk '{print "du -h  says: "$1}'
stat -c 'size=%s bytes   blocks allocated=%b' /tmp/sparse
rm /tmp/sparse
```

```
ls -lh says: 1.0G
du -h  says: 0
size=1073741824 bytes   blocks allocated=0
```

*(Verified.)* **A one-gigabyte file occupying zero blocks.**

The inode records a *size* and, separately, a list of *allocated blocks*. Nothing requires them to
agree. A **hole** is a region with no allocated block; reading it returns zeros, generated on the
fly. Blocks are allocated only when you actually write.

This is why `ls -l` and `du` disagree, and it is genuinely used:

- **Virtual machine disk images** — a "100 GB" qcow2 or raw image that occupies 8 GB.
- **Database and log files** preallocated to a size they'll grow into.
- **Core dumps** of processes with large sparse address spaces.

And it's a real trap when copying: naive tools *fill in* the holes.

```bash
truncate -s 1G /tmp/sparse
cp /tmp/sparse /tmp/dense                    # may expand to a real gigabyte
cp --sparse=always /tmp/sparse /tmp/still-sparse
du -h /tmp/sparse /tmp/dense /tmp/still-sparse
rm -f /tmp/sparse /tmp/dense /tmp/still-sparse
```

`tar`, `rsync -S`, and `cp --sparse` all have sparse-awareness options. Without them, backing up a
sparse VM image can produce a backup many times larger than the original.

## 15.9 Inodes are a finite resource

Here is a failure that confuses experienced people. On ext4, **the number of inodes is fixed when the
filesystem is created** and cannot be increased afterwards.

```bash
df -h /       # space
df -i /       # INODES
```

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda        256G   45G  198G  19% /

Filesystem       Inodes  IUsed    IFree IUse% Mounted on
/dev/vda       16777216 194005 16583211    2% /
```

*(Verified.)* Two independent budgets. **You can exhaust either one.**

Run out of inodes with plenty of space free and every attempt to create a file fails with
`No space left on device` — while `df -h` cheerfully reports 80% free. It is one of the most
misleading error messages in Unix, and the usual causes are millions of tiny files: a mail spool, a
session-file directory, an unrotated cache, or a build system.

```bash
# where are the files, as opposed to the bytes?
sudo find /var -xdev -type f 2>/dev/null | wc -l
for d in /var/*/; do printf '%8s  %s\n' "$(sudo find "$d" -xdev 2>/dev/null | wc -l)" "$d"; done | sort -rn | head
```

> **When you hit it, `df -i` is the diagnosis and there is no quick cure** — you delete files, or you
> recreate the filesystem with `mkfs.ext4 -N` or a smaller `-i` bytes-per-inode ratio. Some other
> filesystems (XFS, Btrfs) allocate inodes dynamically and don't have this failure mode at all, which
> is a genuine argument for them on file-server workloads.

---

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

# Chapter 17 — Disks, Partitions, and Mounting: Your Install, Explained

## 17.1 The hook

> **During installation you clicked through a partitioning screen, possibly chose "guided," possibly
> ticked a box about encryption, and moved on.**
>
> **What did you actually agree to?**

Let's find out, top down.

## 17.2 Block devices

```bash
lsblk
```

```
NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS
nvme0n1     259:0    0 476.9G  0 disk
├─nvme0n1p1 259:1    0   512M  0 part /boot/efi
├─nvme0n1p2 259:2    0   488M  0 part /boot
└─nvme0n1p3 259:3    0 475.9G  0 part
  └─nvme0n1p3_crypt 253:0 0 475.9G 0 crypt
    ├─vg--main-root 253:1 0    30G  0 lvm  /
    └─vg--main-home 253:2 0 445.9G 0 lvm  /home
```

*(A typical encrypted-LVM Debian install; yours will differ.)* Read it as a stack:

```
   PHYSICAL DISK        nvme0n1          the actual hardware
        │
   PARTITIONS           p1, p2, p3       a table at the start of the disk saying
        │                                 "bytes X to Y are region 1"
        │
   ENCRYPTION           p3_crypt         LUKS — Volume 6
        │
   VOLUME MANAGER       vg--main-*       LVM — resizable logical volumes
        │
   FILESYSTEMS          ext4             inodes, directories, Chapter 15
        │
   MOUNT POINTS         /, /boot, /home  grafted into one tree
```

**Each layer presents a block device to the layer above and doesn't care what's below.** That is
Chapter 14's uniform-interface idea, applied to storage.

Naming conventions:

| Pattern | Means |
|---|---|
| `/dev/sda`, `/dev/sdb` | SCSI/SATA/USB disks — `a`, `b`, … **in discovery order** |
| `/dev/nvme0n1` | NVMe: controller 0, **n**amespace 1 |
| `/dev/vda` | **v**irtio — you're in a VM |
| `...p1` / `...1` | partition 1 on that disk |
| `/dev/mapper/*` | device-mapper: LVM, LUKS, RAID |

**Note "in discovery order."** That phrase is the whole reason §17.5 exists.

## 17.3 Partition tables

A partition table is a small structure at the very start of a disk saying "region 1 is bytes X to Y,
of type Z." Two formats:

| | **MBR** (Master Boot Record) | **GPT** (GUID Partition Table) |
|---|---|---|
| From | 1983, IBM PC DOS | late 1990s, part of the UEFI spec |
| Max disk | **2 TB** | ~9.4 ZB |
| Partitions | **4 primary** (extended/logical as a workaround) | 128 by default |
| Redundancy | one copy — corrupt it and you're guessing | **primary + backup at the end of the disk**, both with CRCs |
| Required by | legacy BIOS boot | **UEFI boot** |

```bash
sudo fdisk -l /dev/nvme0n1 2>/dev/null || sudo fdisk -l | head -20
sudo parted -l 2>/dev/null | head -20
```

Look for `Disklabel type: gpt` or `dos`. Any machine installed with UEFI in the last decade is GPT.

> **Confidence: high** on the MBR/GPT properties and dates.

**If you have a `/boot/efi` partition, that's the ESP** — EFI System Partition. It's a small FAT32
volume, because UEFI firmware is required to understand FAT32 and nothing else:

```bash
findmnt /boot/efi -o TARGET,SOURCE,FSTYPE,SIZE 2>/dev/null
ls /boot/efi/EFI/ 2>/dev/null
sudo ls /boot/efi/EFI/debian/ 2>/dev/null
```

Volume 6 walks the boot chain properly. For now: **there is a FAT32 partition on your disk because
1990s firmware standardisation said so.**

## 17.4 Mounting: grafting a tree onto a tree

> **THE PROBLEM.** You have several filesystems. Windows gives each a letter — `C:`, `D:`. Unix
> gives them **no name at all.** Where do they go?

A filesystem is **grafted onto a directory** in the existing tree. That directory becomes its root.
There is exactly one hierarchy, always, and you often cannot tell by looking where one filesystem
ends and another begins.

```bash
findmnt
findmnt -t ext4,vfat,tmpfs -o TARGET,SOURCE,FSTYPE,OPTIONS
```

```
TARGET           SOURCE   FSTYPE OPTIONS
/                /dev/vda ext4   rw,relatime
|-/sys/fs/cgroup tmpfs    tmpfs  rw,relatime
`-/dev/shm       tmpfs    tmpfs  rw,relatime,size=4093780k
```

*(Verified.)* `findmnt` draws it as the tree it is. Three views of the same information:

```bash
mount | column -t | head -10        # traditional
cat /proc/mounts | head -10         # the kernel's own list — the authoritative one
findmnt --df                        # with usage, tree-shaped
```

### The demo that makes mounting click

*(Fully verified.)*

```bash
mkdir -p /tmp/mnt
echo "I was here first" > /tmp/mnt/underneath.txt
ls /tmp/mnt

sudo mount -t tmpfs none /tmp/mnt          # graft a new, empty filesystem here
ls -a /tmp/mnt                             # where did the file go?
echo "hello from tmpfs" > /tmp/mnt/newfile.txt
ls /tmp/mnt

sudo umount /tmp/mnt
ls /tmp/mnt                                # and back
rm -rf /tmp/mnt
```

```
underneath.txt
--- after mounting tmpfs over it ---
.  ..
--- after writing to the tmpfs ---
newfile.txt
--- after unmounting ---
underneath.txt
```

**`underneath.txt` was never deleted.** It was **shadowed** — the directory's *contents* were
replaced by the mounted filesystem's root for as long as the mount lasted. The inode was there the
whole time, unreachable, because nothing in the namespace pointed at it.

> **This is a real operational trap.** Write 40 GB into `/mnt/backup` while the backup disk is *not*
> mounted, and it lands on your root filesystem. Mount the disk later and the data vanishes from
> view — while still consuming root's space. `df` says root is full; `du /mnt/backup` says it's
> empty. Diagnose it by unmounting, or with `sudo du -x /` which stays on one filesystem.

### Bind mounts

You can graft a directory that's already in the tree at a second place:

```bash
mkdir -p /tmp/bindsrc /tmp/binddst && echo content > /tmp/bindsrc/f.txt
sudo mount --bind /tmp/bindsrc /tmp/binddst
ls /tmp/binddst
findmnt /tmp/binddst -o TARGET,SOURCE,FSTYPE
sudo umount /tmp/binddst && rm -rf /tmp/bindsrc /tmp/binddst
```

```
f.txt
TARGET       SOURCE                 FSTYPE
/tmp/binddst /dev/vda[/tmp/bindsrc] ext4
```

*(Verified.)* Note the `SOURCE` notation: `device[/subtree]`. This is **not** a symlink — it's a
genuine second mount of the same subtree, and it's the foundation of containers. Volume 8 comes back
to it.

## 17.5 `/etc/fstab`, and why it says `UUID=`

```bash
cat /etc/fstab
```

```
# <file system>                            <mount point> <type> <options>        <dump> <pass>
UUID=8f3a9c21-4d5e-4b0a-9c1f-2e3d4a5b6c7d  /             ext4   errors=remount-ro 0      1
UUID=1a2b-3C4D                             /boot/efi     vfat   umask=0077        0      1
/dev/mapper/vg--main-home                  /home         ext4   defaults          0      2
```

Six fields:

| Field | Meaning |
|---|---|
| 1 | **what to mount** — `UUID=`, `LABEL=`, or a device path |
| 2 | **where** |
| 3 | filesystem type (`auto` to guess) |
| 4 | options, comma-separated (§17.7) |
| 5 | `dump` — legacy backup flag; **effectively always 0** |
| 6 | **`fsck` order**: 0 = never, **1 = root**, 2 = everything else |

### Why `UUID=` and not `/dev/sda1`

Because **`/dev/sda1` is not a stable name.** Device letters are assigned in *discovery order*, which
depends on which controller responds first, which USB port you used, and kernel timing. Plug in a
USB stick before boot and yesterday's `/dev/sdb` can become today's `/dev/sdc`.

A **UUID** is written *inside the filesystem's superblock* when it's created. It travels with the
data, across cables, ports, and enclosures.

```bash
lsblk -f
sudo blkid
```

```
NAME   FSTYPE FSVER LABEL UUID                                 MOUNTPOINTS
vda    ext4   1.0         8f3a9c21-4d5e-4b0a-9c1f-2e3d4a5b6c7d /
```

Note the ESP's UUID is short (`1a2b-3C4D`) — FAT32 has a 32-bit volume serial, not a real UUID, so
`blkid` reports what there is.

The Debian installer writes `UUID=` entries for you. This is why moving your disk to a new machine
generally just works.

**Test an fstab change before you reboot** — a syntax error here can leave the machine unbootable:

```bash
sudo findmnt --verify --verbose
sudo mount -a          # mount everything in fstab that isn't mounted; errors surface NOW
```

> **This is the filesystem equivalent of `visudo` (Volume 2 §11.5).** An unbootable machine and a
> `sudo`-less machine are both recovered from a rescue USB, and both are avoidable with one command
> beforehand.

## 17.6 tmpfs and swap

Some of your filesystems have no disk at all:

```bash
findmnt -t tmpfs -o TARGET,SIZE,USED,OPTIONS
```

```
TARGET                   SIZE USED OPTIONS
/run                     1.6G 1.8M rw,nosuid,nodev
/dev/shm                 3.9G    0 rw,nosuid,nodev
/run/user/1000           786M  60K rw,nosuid,nodev,relatime
```

**tmpfs lives in RAM** — but it is *page cache*, so it can be **swapped out** under pressure, unlike
a ramdisk. It's genuinely fast and genuinely volatile.

| Mount | For |
|---|---|
| `/run` | runtime state — guaranteed empty at boot (§16.3) |
| `/dev/shm` | POSIX shared memory between processes |
| `/run/user/$UID` | per-user session state; `$XDG_RUNTIME_DIR` |

```bash
echo "$XDG_RUNTIME_DIR"; ls "$XDG_RUNTIME_DIR" | head
```

**Is your `/tmp` a tmpfs?** Debian's default has historically been a real directory on disk, unlike
some distributions:

```bash
findmnt /tmp || echo "/tmp is part of the root filesystem (Debian's usual default)"
```

> **Confidence: moderate.** Debian has debated `/tmp` on tmpfs repeatedly and the default has shifted
> over releases and install paths. Your own output is the answer.

**Swap:**

```bash
swapon --show
cat /proc/swaps
free -h
cat /proc/sys/vm/swappiness
```

Swap is a block device or file the kernel uses to page out memory. `swappiness` (default 60) biases
how eagerly it does so. Note that swap is also where **hibernation** writes RAM, which is why
hibernate needs swap at least as large as memory — and why swap on an encrypted volume matters
(Volume 6).

## 17.7 Mount options — including one that undoes Volume 2

```bash
findmnt -no OPTIONS /
findmnt -no OPTIONS /run
```

| Option | Effect |
|---|---|
| `ro` / `rw` | read-only / read-write |
| **`nosuid`** | **ignore setuid and setgid bits on this filesystem** |
| **`noexec`** | refuse to execute anything here |
| **`nodev`** | ignore device files here |
| `relatime` | lazy atime updates (§15.7) |
| `errors=remount-ro` | **on an I/O error, remount read-only** rather than corrupt further — Debian's root default |
| `discard` | issue TRIM on delete (usually better handled by `fstrim.timer`) |

**`nosuid` deserves a demonstration**, because it directly disarms Volume 2's entire privilege
mechanism *(verified)*:

```bash
sudo mkdir -p /tmp/ns
sudo mount -t tmpfs -o nosuid none /tmp/ns

sudo cp /usr/bin/id /tmp/ns/myid
sudo chown root:root /tmp/ns/myid
sudo chmod 4755 /tmp/ns/myid          # chmod after chown — Volume 2 §11.7
ls -l /tmp/ns/myid

/tmp/ns/myid -u                        # effective UID
findmnt /tmp/ns -o TARGET,OPTIONS

sudo umount /tmp/ns && sudo rmdir /tmp/ns
```

```
-rwsr-xr-x 1 root root 39432 Sep 10 07:21 /tmp/ns/myid
1000
TARGET  OPTIONS
/tmp/ns rw,nosuid,relatime
```

**The setuid bit is set — `ls` shows the `s` — and the effective UID is 1000, not 0.**
*(Verified.)* The mount option overrode it.

> This is exactly the third case where a setuid bit is visible and ignored. Volume 2 §11.7 had
> `chown` silently stripping it; Volume 2 §13.6 had the kernel ignoring it on scripts; here a mount
> option disables it wholesale. **The `s` in `ls -l` means "this bit is set," not "this will work."**
>
> And it's why hardening guides tell you to mount `/tmp`, `/home` and `/var` with
> `nosuid,nodev,noexec`: a user who can write files anywhere on those filesystems still cannot create
> a working setuid binary. Volume 8 returns to this.

## 17.8 Checking and repairing

```bash
sudo tune2fs -l /dev/vda 2>/dev/null | grep -Ei 'state|mount count|check|features|inode count|block size'
```

`fsck` **cannot safely run on a mounted read-write filesystem** — it would be editing structures the
kernel is simultaneously caching and changing. So for the root filesystem you schedule it for the
next boot:

```bash
sudo touch /forcefsck              # older mechanism; may be ignored by systemd
sudo tune2fs -c 30 /dev/vda        # or: check every 30 mounts
```

Modern Debian handles this through systemd's `systemd-fsck-root.service`, and the kernel command
line option `fsck.mode=force`. Volume 6.

**Read-only is a safe check** on an unmounted device:

```bash
sudo fsck -n /dev/vdb 2>/dev/null || echo "(no spare device to check)"
```

And this is what `errors=remount-ro` is for: if the kernel hits a filesystem inconsistency, it flips
the mount read-only **immediately** rather than continuing to write into a damaged structure. Your
session breaks, loudly, which is far better than the alternative.

---

# Chapter 18 — File Descriptors, Streams, and Redirection

## 18.1 The hook

> **A program has input and output. That's two channels. So why does Unix give every process
> *three*?**

## 18.2 What a file descriptor actually is

Volume 1 §2.2 showed `/proc/$$/fd/` and called them descriptors. Here's the structure underneath,
and it has **three levels**, not one:

```
   PER-PROCESS FD TABLE          OPEN FILE DESCRIPTIONS         INODES
   (one per process)             (system-wide)                  (one per file)
   ┌─────┬──────────┐            ┌────────────────────┐         ┌──────────────┐
   │ fd 0│      ────┼───────────►│ offset: 0          │────────►│ inode 2801667│
   │ fd 1│      ────┼─────┐      │ flags: O_RDONLY    │    ┌───►│ mode, size,  │
   │ fd 2│      ────┼───┐ │      └────────────────────┘    │    │ blocks, ...  │
   │ fd 3│      ────┼─┐ │ │      ┌────────────────────┐    │    └──────────────┘
   └─────┴──────────┘ │ └─┴─────►│ offset: 4096       │────┘
                      │          │ flags: O_WRONLY|   │
                      │          │        O_APPEND    │
                      │          └────────────────────┘
                      │          ┌────────────────────┐         ┌──────────────┐
                      └─────────►│ offset: 0          │────────►│ inode 2801902│
                                 └────────────────────┘         └──────────────┘
```

| Level | Holds | Shared how |
|---|---|---|
| **fd table** | small integers → pointers | **per process**; copied by `fork()` |
| **open file description** | **the file offset** and the status flags | **shared** by `fork()` and `dup2()` |
| **inode** | everything from Chapter 15 | shared by everyone who opens the file |

**The middle level is the one that explains real behaviour**, and you can see it. *(Verified.)*

```bash
( /bin/echo "from child 1"; /bin/echo "from child 2" ) > /tmp/shared.txt
cat /tmp/shared.txt
```

```
from child 1
from child 2
```

Two separate `/bin/echo` **processes**, one redirection. Both inherited the same **open file
description** across `fork()`, so they shared one offset — the second wrote *after* the first
instead of on top of it.

Now two separate redirections:

```bash
/bin/echo "first"  > /tmp/sep.txt
/bin/echo "second" > /tmp/sep.txt
cat /tmp/sep.txt
rm -f /tmp/shared.txt /tmp/sep.txt
```

```
second
```

Two `open()` calls, two independent open file descriptions, each starting at offset 0 with
`O_TRUNC`. The second obliterated the first.

> **That's why `>>` exists and isn't just "`>` that doesn't truncate."** `>>` sets **`O_APPEND`** on
> the open file description, which makes every write seek-to-end **atomically in the kernel**. Two
> processes appending to the same log with `>>` cannot interleave mid-line; two processes with `>`
> and manual seeking absolutely can.

## 18.3 The three standard descriptors, and why there are three

By convention — not by kernel enforcement — every process starts with:

| fd | Name | Direction | Default |
|---|---|---|---|
| **0** | `stdin` | in | your terminal |
| **1** | `stdout` | out | your terminal |
| **2** | `stderr` | out | your terminal |

```bash
ls -l /proc/$$/fd/0 /proc/$$/fd/1 /proc/$$/fd/2
```

All three point at your pty (Volume 1 §2.2). So why split output in two, when they go to the same
place anyway?

**Because they don't stay in the same place.** Consider what happens with only one output stream:

```
   prog > results.txt        →  error messages land IN results.txt, corrupting your data
   prog | analyse            →  error text is fed to `analyse` AS INPUT
```

Both are obviously broken, and both are fixed by having a second output channel that redirection
doesn't touch by default. Watch it:

```bash
ls /etc /nonexistent-dir > /tmp/out.txt
```

```
ls: cannot access '/nonexistent-dir': No such file or directory
```

**The error appeared on your terminal even though you redirected output**, and `/tmp/out.txt`
contains only the real listing. That separation is the entire point.

```bash
head -3 /tmp/out.txt
ls /etc /nonexistent-dir 2>/dev/null | wc -l     # count only the good output
rm -f /tmp/out.txt
```

> **The historical anecdote — Confidence: moderate.** The story usually told is that early Unix had
> only `stdout`, and error messages were getting mixed into output that was being sent to a
> **phototypesetter** — so the errors were typeset onto expensive photographic paper. That
> reportedly prompted the split. I've seen this repeated in several places and attributed to the
> Bell Labs typesetting work, but I have not verified it against a primary source, and details vary
> between tellings.
>
> **The reasoning, though, doesn't depend on the anecdote being right.** The two failure modes above
> are obvious the first time you redirect anything, and a second channel is the obvious fix.

## 18.4 Redirection mechanics

Volume 1 §2.6 showed the three-syscall pattern the shell uses between `fork()` and `execve()`. Now
the full vocabulary:

| Syntax | What the shell does | Notes |
|---|---|---|
| `> f` | `open(f, O_WRONLY\|O_CREAT\|O_TRUNC)`, `dup2(fd,1)` | **truncates** |
| `>> f` | same with `O_APPEND` instead of `O_TRUNC` | atomic append |
| `< f` | `open(f, O_RDONLY)`, `dup2(fd,0)` | |
| `2> f` | same as `>` but `dup2(fd,2)` | |
| `2>&1` | **`dup2(1, 2)`** | make fd 2 point where **fd 1 points right now** |
| `&> f` | both stdout and stderr | bash shorthand for `> f 2>&1` |
| `>| f` | truncate even with `set -o noclobber` | |
| `<> f` | open read-write on fd 0 | rare, but exists |
| `2>&-` | **close** fd 2 | |
| `\|` | `pipe()`, then `dup2()` in both children | Volume 1 §1.4 |
| `n< f` | open on an arbitrary descriptor | §18.6 |

## 18.5 The gotcha: `2>&1` order matters

This is the single most common redirection bug, and once you read `2>&1` as **"dup2(1,2) — copy
wherever fd 1 currently points"** it becomes obvious rather than mysterious.

*(Both halves verified.)*

```bash
ls /nonexistent > /tmp/o1.txt 2>&1
echo "'> f 2>&1'  file contains: [$(cat /tmp/o1.txt)]"

ls /nonexistent 2>&1 > /tmp/o2.txt
echo "'2>&1 > f'  file contains: [$(cat /tmp/o2.txt)]"

rm -f /tmp/o1.txt /tmp/o2.txt
```

```
'> f 2>&1'  file contains: [ls: cannot access '/nonexistent': No such file or directory]
ls: cannot access '/nonexistent': No such file or directory
'2>&1 > f'  file contains: []
```

The second one printed the error **to your terminal** and left the file empty. Trace it:

```
CORRECT:   ls /nonexistent > f 2>&1
   step 1   > f      →  fd 1 now points at the FILE
   step 2   2>&1     →  fd 2 = copy of fd 1  →  fd 2 points at the FILE
   result: both in the file ✔

WRONG:     ls /nonexistent 2>&1 > f
   step 1   2>&1     →  fd 2 = copy of fd 1  →  fd 1 is still the TERMINAL,
                                                 so fd 2 → TERMINAL
   step 2   > f      →  fd 1 now points at the file.  fd 2 is UNCHANGED.
   result: stdout in the file, stderr on the terminal ✘
```

> **`2>&1` copies a destination, it does not create an alias.** Redirections are processed strictly
> **left to right**, and each one is a snapshot of where the source descriptor points at that
> moment. Change fd 1 afterwards and fd 2 does not follow.

There's a genuinely useful trick that falls out of this — **swap** the two streams:

```bash
ls /etc /nonexistent 3>&1 1>&2 2>&3 3>&- | head -2
```

Save fd 1 on fd 3, point fd 1 at stderr, point fd 2 at the saved fd 3, close the temporary. Now the
pipe carries only the *errors*.

## 18.6 Descriptors above 2

The shell can open descriptors for its own use, which Volume 1 §3.4 and §15.6 both used:

```bash
exec 3< /etc/passwd        # open for reading on fd 3, in the SHELL itself
head -1 <&3                # read from it
head -1 <&3                # read again — the offset persisted
exec 3<&-                  # close
```

The offset persisted between commands because both `head`s inherited **the same open file
description** (§18.2). That is the middle level of the diagram, doing something visible.

Writing works the same way, and is the right pattern for a script that logs:

```bash
exec 4> /tmp/log.txt
echo "step 1 complete" >&4
echo "step 2 complete" >&4
exec 4>&-
cat /tmp/log.txt && rm /tmp/log.txt
```

One `open()` for the whole script instead of one per line.

**And the filesystem gives you descriptors back as paths:**

```bash
ls -l /dev/fd /dev/stdin /dev/stdout /dev/stderr
echo hello > /dev/stdout
```

`/dev/fd` is a symlink to `/proc/self/fd`. This is Chapter 14's principle closing the loop: **file
descriptors are named in the filesystem**, so a program that only accepts a *filename* can be handed
a *stream*:

```bash
diff <(ls /usr/bin) <(ls /usr/sbin) | head -5
```

`<(...)` is **process substitution**. Bash runs the command, connects it to a pipe, and passes
`/dev/fd/63` as the argument. `diff` believes it received two filenames:

```bash
echo <(true) <(true)
```

```
/dev/fd/63 /dev/fd/62
```

## 18.7 Here-documents and here-strings

```bash
cat <<'EOF'
Literal text. $HOME is NOT expanded because EOF is quoted.
EOF

NAME=Debian
cat <<EOF
Unquoted delimiter: variables ARE expanded. Running $NAME.
EOF

cat <<-EOF
	Leading TABS are stripped with <<-  (tabs only, not spaces).
	EOF

grep root <<< "$(getent passwd root)"     # here-STRING
```

| Form | Expands variables? |
|---|---|
| `<<EOF` | **yes** |
| `<<'EOF'` or `<<"EOF"` | **no** — literal |
| `<<-EOF` | yes, and strips leading **tabs** |
| `<<< "string"` | it's already a string |

Quoting the delimiter is the right default when writing config files or scripts from a script, or
`$PATH` in your heredoc becomes the shell's `$PATH`.

---

# Chapter 19 — The Incident: When `write()` Didn't Mean Written

## 19.1 The hook

> **You edit a config file. You save it. Your machine loses power two seconds later.**
>
> **You reboot to find the file is zero bytes long. Not the old version. Not the new version.
> Empty.**
>
> **The application called `write()`, and `write()` returned success.**

In early 2009, this happened to a lot of people, and the resulting argument between kernel developers
and application developers is one of the most instructive disputes in Linux's history — because
**both sides were right.**

## 19.2 THE PROBLEM: disks are a hundred thousand times slower than RAM

If `write()` waited for the platter, every program would crawl. So it doesn't:

```
    write()  →  copy bytes into the PAGE CACHE in RAM
             →  mark those pages DIRTY
             →  RETURN SUCCESS immediately
                                 ⋮
             (seconds later, a kernel thread writes them out)
```

Watch it happen *(verified)*:

```bash
grep -E '^(Dirty|Writeback):' /proc/meminfo
dd if=/dev/zero of=/tmp/dirty.bin bs=1M count=200 2>/dev/null
grep -E '^(Dirty|Writeback):' /proc/meminfo
sync
grep -E '^(Dirty|Writeback):' /proc/meminfo
rm -f /tmp/dirty.bin
```

```
Dirty:                12 kB
--- after writing 200 MB ---
Dirty:            204832 kB
--- after sync ---
Dirty:                12 kB
```

**Two hundred megabytes existed only in RAM**, and `dd` had already exited successfully. A power cut
in that window loses all of it.

The tunables that govern the window:

```bash
for f in dirty_expire_centisecs dirty_writeback_centisecs dirty_ratio dirty_background_ratio; do
  printf '%-28s %s\n' "$f" "$(cat /proc/sys/vm/$f)"
done
```

```
dirty_expire_centisecs       3000     ← pages older than 30 s are written out
dirty_writeback_centisecs    500      ← the flusher thread wakes every 5 s
dirty_ratio                  20       ← at 20% of RAM dirty, writers BLOCK
dirty_background_ratio       10       ← at 10%, start writing back in background
```

*(Verified.)* **Thirty seconds** is the number to hold onto.

## 19.3 What ext4 changed: delayed allocation

ext4 added **delayed allocation** (`delalloc`): don't decide *where on disk* the data goes until
writeback time.

It's a genuinely good optimisation. By waiting, the filesystem knows the file's final size and can
allocate one large contiguous extent instead of guessing block by block — less fragmentation, fewer
metadata updates, less CPU.

**But it widened the danger window**, and — crucially — it changed a behaviour applications had
accidentally been depending on.

| | ext3 (`data=ordered`, the default) | ext4 (with `delalloc`) |
|---|---|---|
| When blocks are allocated | at `write()` | **at writeback**, up to ~30 s later |
| Journal commit interval | ~5 s | ~5 s |
| **Does a metadata commit force the data out first?** | **YES** — that's what `data=ordered` means | **not necessarily** — the blocks may not exist yet |

That last row is the whole incident.

## 19.4 THE INCIDENT: zero-length files, January 2009

> **Confidence: high** on the mechanism, the timeframe, and Theodore Ts'o's central involvement as
> ext4 maintainer. **Moderate** on the exact Ubuntu bug number (commonly cited as #317781) and the
> precise kernel version of the fix (usually given as 2.6.30).

Ubuntu 9.04 was preparing to ship with ext4. Users testing it reported that after a crash or power
loss, configuration files — desktop panel layouts, application settings, session state — came back
**zero bytes long**.

Two application patterns were failing. Here is the naive one:

```c
fd = open("config", O_WRONLY|O_CREAT|O_TRUNC);   /* file is now EMPTY on disk */
write(fd, newdata, len);                          /* in page cache only       */
close(fd);                                        /* NOT a durability barrier */
```

`O_TRUNC` is a **metadata** operation — it hits the journal quickly. The data is delayed. Crash in
between, and the truncation is durable while the new content is not. **You lose both versions.**

And here is the pattern developers had been *taught* was the safe one:

```c
fd = open("config.new", O_WRONLY|O_CREAT|O_TRUNC);
write(fd, newdata, len);
close(fd);
rename("config.new", "config");                   /* atomic swap — right? */
```

`rename()` **is** atomic with respect to the namespace: any observer sees either the old file or the
new one, never a half-written mixture. That's a genuine POSIX guarantee and the developers were
right about it.

**But atomicity is not durability.** The `rename` is metadata and commits fast; the data blocks for
`config.new` were still unallocated in the page cache. A crash in that window leaves `config`
pointing at an inode with **no data at all**.

**On ext3 this pattern was accidentally safe**, because `data=ordered` forced data blocks out before
committing the metadata that referenced them. Nothing in POSIX promised that. It just happened to be
true, for years, on the filesystem everyone used.

## 19.5 The argument, and why both sides were right

**Theodore Ts'o's position** — technically unimpeachable:

> POSIX does not guarantee that data reaches stable storage until you call **`fsync()`**. These
> applications are relying on an implementation detail of ext3. They are buggy, they have always been
> buggy, and ext4 merely exposed it. The fix belongs in the applications.

**The application developers' position** — practically unimpeachable:

> `fsync()` on ext3 was *pathologically* slow. Because of how ext3's journal worked, one
> application's `fsync()` could force out **every** pending write on the entire filesystem, stalling
> unrelated programs for seconds. Firefox calling `fsync()` on its bookmarks database was a
> notorious cause of whole-desktop freezes. **We were actively told not to call it**, and now we're
> being blamed for not calling it.

> **Confidence: moderate-high** on the fsync-slowness argument and the Firefox example, which were
> widely discussed at the time.

So: the applications were violating the specification, and the specification's remedy was too
expensive to use, and the filesystem everyone tested on had been silently covering for them. **Every
part of that is somebody being reasonable.**

## 19.6 The fix, and what you should actually do

**The kernel fix** (Linux 2.6.30) added heuristics, controlled by the `auto_da_alloc` mount option
and **on by default**:

- On **`rename()` over an existing file**, force allocation of the source's delayed blocks.
- On **`close()` of a file opened with `O_TRUNC`**, do the same.

This is not a durability guarantee — it doesn't call `fsync()` — but it restores ext3's *practical*
behaviour for the two patterns that were breaking. Ts'o was explicit that it was a pragmatic
concession, not a correctness fix.

```bash
findmnt -no FSTYPE,OPTIONS /
```

`auto_da_alloc` won't be listed because it's a default; `tune2fs -l` and the ext4 documentation are
where to confirm it.

**What you should do in your own scripts and programs.** The full safe-save dance is:

```
   1. write the new content to a temporary file in the SAME DIRECTORY
   2. fsync()  the temporary file             ← the data is now durable
   3. rename() the temporary over the target  ← atomic swap
   4. fsync()  the DIRECTORY                  ← the rename itself is now durable
```

Step 4 is the one everybody forgets: the rename is a change to the *directory*, and directories are
files too (Chapter 15) — so the directory's metadata also needs flushing.

In shell, the practical version:

```bash
write_atomically() {
    local target="$1" tmp
    tmp=$(mktemp "$(dirname "$target")/.tmp.XXXXXX") || return 1
    cat > "$tmp"                  # content from stdin
    sync                          # crude but effective; sync -f "$tmp" is better
    mv -f "$tmp" "$target"        # rename(2) — atomic
}

echo "new config content" | write_atomically /tmp/demo.conf
cat /tmp/demo.conf && rm -f /tmp/demo.conf
```

**Note `mktemp` in the same directory** — a rename across filesystems is not atomic (§15.5's `EXDEV`
again), so `/tmp` is the wrong place for a temporary file destined for `/etc`.

> **The lesson that generalises.** Chapter 14 argued that "everything is a file" is a powerful
> abstraction. This incident is the abstraction's bill: **`write()` returning success tells you the
> kernel accepted your bytes, not that they exist anywhere that survives a power cut.** The
> difference is invisible until it isn't, and it is exactly the kind of gap Volume 1 §7 and Volume 2
> §13 both landed on — *an assumption about what an interface guaranteed, which it never actually
> did.*

## 19.7 A design-level companion: symlink attacks in `/tmp`

Chapter 15 made symlinks look benign. They are a whole vulnerability class, and the story ties
Volume 2's setuid material directly to this volume's links.

**The attack.** A privileged program writes to a predictable path:

```
   /tmp/someprogram.log
```

An unprivileged attacker, ahead of time, runs:

```
   ln -s /etc/shadow /tmp/someprogram.log
```

The privileged program opens that path, **the kernel follows the symlink**, and root's write lands in
`/etc/shadow`.

Volume 2 §10.6's sticky bit **does not help.** Sticky prevents you deleting *other people's* files;
it does nothing to stop you *creating* your own. And a symlink is yours.

You can see the dangerous half of the mechanism safely — **writing through a dangling symlink creates
the target** *(verified)*:

```bash
cd /tmp
ln -sf /tmp/does-not-exist danglink
ls -l danglink
cat danglink                                  # No such file or directory
echo "written via symlink" > danglink          # ...but this SUCCEEDS
ls -l /tmp/does-not-exist
cat /tmp/does-not-exist
rm -f danglink /tmp/does-not-exist
```

```
lrwxrwxrwx 1 vishal vishal 19 Sep 10 07:25 danglink -> /tmp/does-not-exist
cat: danglink: No such file or directory
-rw-r--r-- 1 vishal vishal 20 Sep 10 07:25 /tmp/does-not-exist
written via symlink
```

**The redirection created a file at the symlink's target, not at the symlink.** Point that target at
something you don't own, hand the symlink to a root process, and that's the attack.

### The kernel's fix, and a result that surprised me

Linux added two protections around 2012:

| sysctl | Effect |
|---|---|
| **`fs.protected_symlinks`** | in a **world-writable, sticky** directory, a symlink is followed **only if** the follower owns it, or the symlink's owner matches the directory's owner |
| **`fs.protected_hardlinks`** | you may only hard-link to a file you **own**, or can read *and* write — so you can't link to a root-owned file and wait for it to be modified |

```bash
sysctl fs.protected_symlinks fs.protected_hardlinks
```

> **A verified surprise, and I'd have got this wrong.** I expected both to read `1` everywhere. On
> the system I tested, I got:
>
> ```
> fs.protected_symlinks = 0
> fs.protected_hardlinks = 1
> ```
>
> So **the default is not uniform.** A normal Debian install with systemd typically sets both to `1`
> via a file in `/usr/lib/sysctl.d/`, but containers and unusual environments inherit or override
> differently. **Check your own machine rather than assuming**, and if you're hardening something:
>
> ```bash
> grep -rn 'protected_symlinks\|protected_hardlinks' /etc/sysctl.conf /etc/sysctl.d/ /usr/lib/sysctl.d/ 2>/dev/null
> ```

The application-level fix, which predates the kernel one and is still correct, is **`mkstemp()`** —
create a temporary file with an unpredictable name and `O_EXCL`, so an existing symlink causes the
open to *fail* rather than be followed. In shell that's `mktemp`:

```bash
tmp=$(mktemp)            # unpredictable name, mode 600, created safely
echo "$tmp"; ls -l "$tmp"; rm -f "$tmp"
```

**Never** construct a temporary filename yourself with `$$` or a timestamp. Both are predictable, and
predictability is the entire vulnerability.

---

# TRY THIS ON YOUR MACHINE

Six things that make the filesystem visible. **Every one was run and verified while writing.**
Everything is confined to `/tmp`, nothing needs a reboot, and cleanup is included.

---

## 1. Watch a file survive its own deletion

**Needs:** nothing.

```bash
cd /tmp
dd if=/dev/zero of=big.bin bs=1M count=200 2>/dev/null
df -h /tmp | tail -1

exec 9< big.bin          # hold it open on fd 9
rm big.bin               # remove the only name
ls big.bin               # gone

ls -l /proc/$$/fd/9
stat -Lc 'still %s bytes readable' /proc/$$/fd/9
df -h /tmp | tail -1     # space NOT returned

exec 9<&-                # close — now it's really gone
df -h /tmp | tail -1
```

**What you should see:** `ls` reports no such file, but `/proc/$$/fd/9` shows
`-> /tmp/big.bin (deleted)` and the size is still readable. `df` doesn't change until you close the
descriptor.

**Why it's interesting:** the `(deleted)` marker is the kernel telling you exactly what a file is —
an **inode with a reference count**, not a name. This is the number-one cause of "I deleted the huge
log file and `df` still says the disk is full." The real fix is `sudo lsof +L1` to find who's holding
it, or truncating in place with `: > file` instead of deleting.

---

## 2. Make a one-gigabyte file that occupies nothing

**Needs:** nothing.

```bash
truncate -s 1G /tmp/sparse
ls -lh /tmp/sparse | awk '{print "ls  says: " $5}'
du -h  /tmp/sparse | awk '{print "du  says: " $1}'
stat -c 'size=%s bytes, blocks allocated=%b' /tmp/sparse

# now poke one byte near the end and watch blocks appear
printf 'x' | dd of=/tmp/sparse bs=1 seek=1000000000 conv=notrunc 2>/dev/null
du -h /tmp/sparse | awk '{print "du  says: " $1 "  (after writing ONE byte)"}'

rm /tmp/sparse
```

**What you should see:** `1.0G` from `ls`, `0` from `du`, `blocks allocated=0`. After the single-byte
write, `du` jumps to a few kilobytes — one block, not a gigabyte.

**Why it's interesting:** it separates two things people assume are the same. **Size** is a number in
the inode; **blocks** is what's actually on disk. Nothing requires them to match. Reads from a hole
return zeros the kernel generates on the fly. This is how VM disk images and preallocated database
files work — and it's why `cp` without `--sparse` or `tar` without `-S` can turn an 8 GB backup into
a 100 GB one.

---

## 3. Hide a file by mounting over it

**Needs:** `sudo`.

```bash
mkdir -p /tmp/mnt
echo "I was here first" > /tmp/mnt/underneath.txt
ls /tmp/mnt

sudo mount -t tmpfs none /tmp/mnt
ls -a /tmp/mnt                       # where did it go?
echo "hello from tmpfs" > /tmp/mnt/newfile.txt
ls /tmp/mnt
findmnt /tmp/mnt -o TARGET,SOURCE,FSTYPE

sudo umount /tmp/mnt
ls /tmp/mnt                          # and it's back
rm -rf /tmp/mnt
```

**What you should see:** `underneath.txt` vanishes the instant the tmpfs is mounted, the tmpfs
behaves as a normal empty filesystem, and the original file reappears on unmount.

**Why it's interesting:** mounting **shadows** a directory's contents rather than merging or
replacing them, and the hidden inode keeps consuming space the whole time. This is the mechanism
behind a classic disaster: writing backups into `/mnt/backup` while the backup disk *isn't* mounted,
then mounting it and finding the data "gone" while root is mysteriously full. Diagnose that class of
problem with `sudo du -x /`, which stays on one filesystem.

---

## 4. Count a directory's subdirectories without listing it

**Needs:** nothing.

```bash
cd /tmp && rm -rf dcount && mkdir dcount
stat -c 'link count = %h   %n' dcount
mkdir dcount/one  ; stat -c 'link count = %h   %n' dcount
mkdir dcount/two  ; stat -c 'link count = %h   %n' dcount
mkdir dcount/three; stat -c 'link count = %h   %n' dcount
rm -rf dcount

# now on a real directory:
stat -c '/etc has %h links' /etc
ls -d /etc/*/ | wc -l
```

**What you should see:** 2, then 3, 4, 5 — one more per subdirectory. And `/etc`'s link count is its
subdirectory count plus two.

**Why it's interesting:** that "2" you've seen next to every empty directory for years finally means
something. A directory's inode is pointed at by its **parent's entry**, by its own **`.`**, and by
**`..` in each of its children** — so `links = 2 + subdirectories`. It's the one place hard links to
directories exist, created only by the kernel, and it's exactly why *you* can't make them (§15.5).

---

## 5. Prove `2>&1` copies a destination rather than creating an alias

**Needs:** nothing.

```bash
cd /tmp
ls /nonexistent > o1.txt 2>&1 ; echo "'> f 2>&1' captured: [$(cat o1.txt)]"
ls /nonexistent 2>&1 > o2.txt ; echo "'2>&1 > f' captured: [$(cat o2.txt)]"
rm -f o1.txt o2.txt

# and the swap trick
ls /etc /nonexistent 3>&1 1>&2 2>&3 3>&- | head -2
```

**What you should see:** the first captures the error into the file; the second prints the error to
your terminal and leaves the file empty. The last command pipes only the *error* text.

**Why it's interesting:** `2>&1` is `dup2(1,2)` — "make fd 2 point wherever fd 1 points **at this
instant**." Redirections are applied strictly left to right, so changing fd 1 afterwards doesn't drag
fd 2 along. Once you read it as a snapshot rather than a link, both the bug and the swap trick are
obvious rather than magic.

---

## 6. Watch 200 MB of your data exist only in RAM

**Needs:** nothing. **This is Chapter 19's incident, reproduced safely.**

```bash
grep -E '^(Dirty|Writeback):' /proc/meminfo
dd if=/dev/zero of=/tmp/dirty.bin bs=1M count=200 2>/dev/null
echo "--- dd has EXITED SUCCESSFULLY; where is the data? ---"
grep -E '^(Dirty|Writeback):' /proc/meminfo
sync
echo "--- after sync ---"
grep -E '^(Dirty|Writeback):' /proc/meminfo
rm -f /tmp/dirty.bin

echo; echo "how long can data stay dirty?"
echo "  $(($(cat /proc/sys/vm/dirty_expire_centisecs)/100)) seconds"
```

**What you should see:** `Dirty` jumps to roughly 200,000 kB and returns to near zero after `sync`.
The expiry is typically 30 seconds.

**Why it's interesting:** `dd` reported success and exited while **all** of that data was still only
in RAM. Pull the power in that window and it's gone. That gap between "the write call returned" and
"the bytes are on the platter" is precisely what caused the 2009 ext4 zero-length-file incident, and
it's why the safe-save recipe in §19.6 has an `fsync` in the middle of it. `sync` is you doing by
hand what the kernel would have got around to within thirty seconds.

---

# Volume 3 Retrospective

**1. "Everything is a file" is a default, not a law.** The same six syscalls reach regular files,
directories, devices, pipes and kernel state — which is why pipes needed no changes to existing
programs (V1 §1.4), why the nine permission bits govern your microphone (V2 §10), and why `cat` can
read a battery. It leaks at sockets, and `ioctl()` is the formal admission that it leaks.

**2. A file's name is not part of the file.** The inode holds everything except the name; directories
hold nothing but names and inode numbers. Three things you'd already met fall out of that one
separation: `mv` moves no data, deleting needs write on the *directory*, and one file can have two
names that are indistinguishable.

**3. Link counts explain deletion, and `.`/`..` explain the "2".** Data is freed when the link count
hits zero **and** nobody has it open — hence `(deleted)` in `/proc/PID/fd/` and the "I deleted the
log but `df` didn't change" problem. And a directory's link count is `2 + subdirectories`, because
`.` and `..` are the one legitimate case of hard-linked directories.

**4. Size and allocated blocks are independent.** A sparse 1 GB file occupying zero blocks isn't a
trick; it's the inode recording two facts that were never required to agree. And inodes are a
**separate, finite budget** from disk space — `df -i` is the diagnosis for the most misleading error
message in Unix.

**5. The FHS splits by *treatment*, not by application.** Read-only versus growing versus
irreplaceable versus machine-specific each want different disks, mount options and backup policies —
which per-application directories can't express. The price is scattered files, which is what a
package manager is for. And **`/usr/local` is yours; no Debian package will ever touch it.**

**6. On the `/usr` story: `usr` = "user" is solid; "a disk filled up" is a well-sourced modern
reconstruction, not a documented fact.** The detailed narrative traces mainly to a 2010 mailing-list
post rather than to anything contemporaneous. Say "the usual account is." And the split outlived its
original cause by fifty years, surviving for a *second* reason (early boot) that initramfs eventually
killed — which is why `/bin` is a symlink on your machine today.

**7. Mounting grafts a tree onto a tree, and shadows what was underneath.** Nothing is deleted; it
becomes unreachable while still consuming space. `UUID=` exists in `/etc/fstab` because `/dev/sda1`
is assigned in discovery order and is not a stable name. And `findmnt --verify` is to fstab what
`visudo` is to sudoers.

**8. `nosuid` is the third way a setuid bit can be visibly set and completely ignored** — after
`chown` stripping it (V2 §11.7) and the kernel refusing it on scripts (V2 §13.6). **The `s` in
`ls -l` means "this bit is set," not "this will work."**

**9. A file descriptor is three levels deep, and the middle one explains the surprises.** The
per-process table, the shared open file description holding the **offset**, and the inode. `fork()`
and `dup2()` share the middle level — which is why two children of one redirection don't overwrite
each other, and why `>>` is atomic while manual seeking isn't.

**10. `write()` returning success means the kernel took your bytes, not that they survive a power
cut.** The 2009 ext4 incident is the clearest case in this book of both sides being right: the
applications were violating POSIX, and POSIX's remedy was too slow to use, and ext3 had been quietly
covering for them for years. You can reproduce the dangerous window in one `dd` and one `grep`.

---

# Volume 3 is ready

**File: `volume-3-the-filesystem.md`**

## What Volume 4 will cover: DEBIAN'S PACKAGE MANAGEMENT, SPECIFICALLY

Volume 3 kept pointing at dpkg and moving on — `dpkg -S`, `dpkg -L`, conffiles, `/usr/local` being
off-limits to packages. Volume 4 is that, properly, and it's the most Debian-specific volume in the
book.

- **Debian's own history**: Ian Murdock, 1993, where the name came from, and the founding documents
  — the **Debian Social Contract** and the **Debian Free Software Guidelines**. Debian's governance
  is genuinely unlike other distributions': a written constitution, an elected Project Leader, and a
  General Resolution process that has settled real fights. That's not trivia; it explains why
  `non-free` is a separate archive area and why some hardware doesn't work out of the box.
- **`dpkg` versus `apt`** — the actual relationship, derived rather than asserted. `dpkg` installs
  *one* package and knows nothing about where to find others; `apt` resolves dependencies and
  fetches. You'll see exactly what breaks when you use the wrong layer.
- **Opening a `.deb` by hand** — it's an `ar` archive containing two tarballs and a version string.
  We'll take one apart and read its `control` file, its maintainer scripts, and its file list
  *before* installing anything.
- **Why dependency resolution is genuinely hard** — it is NP-complete in the general case, and
  modern apt uses a real solver. Plus `sources.list`, pinning, and Debian's
  **stable / testing / unstable (sid) / experimental** model — what that trade-off actually buys and
  costs you.
- **Building from source versus packaging**, and why `checkinstall` and `make install` into
  `/usr/local` (§16.6) are the sane middle ground.
- **The incident**: the **2008 Debian OpenSSL weak-key disaster** — a two-line patch to silence a
  Valgrind warning that destroyed the entropy of every key generated on Debian for nearly two years.
  I'll verify the specifics rather than repeating the summary version, because the details are
  frequently mangled and the actual sequence of events is more interesting than the folklore.
- **TRY THIS ON YOUR MACHINE** — including dissecting a `.deb`, finding out which package owns every
  file on your system, watching apt's solver explain itself, and locating the Debian easter eggs
  Volume 1 only started on.

Say **continue** when you'd like Volume 4.
