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
