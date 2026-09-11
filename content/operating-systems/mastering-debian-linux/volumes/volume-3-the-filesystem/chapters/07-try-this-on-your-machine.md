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

