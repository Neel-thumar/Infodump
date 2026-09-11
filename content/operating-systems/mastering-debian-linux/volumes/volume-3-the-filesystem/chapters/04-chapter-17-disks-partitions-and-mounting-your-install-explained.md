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

