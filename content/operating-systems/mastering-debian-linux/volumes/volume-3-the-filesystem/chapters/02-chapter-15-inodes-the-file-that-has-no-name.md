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

