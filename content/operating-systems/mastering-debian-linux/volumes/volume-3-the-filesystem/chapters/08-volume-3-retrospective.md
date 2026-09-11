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

