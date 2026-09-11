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

