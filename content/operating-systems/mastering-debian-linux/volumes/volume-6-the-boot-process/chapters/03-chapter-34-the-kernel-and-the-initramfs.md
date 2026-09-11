# Chapter 34 — The Kernel and the initramfs

## 34.1 The hook

> **Your kernel needs a driver to read your root filesystem. On Debian, that driver is a loadable
> module. The module is a file at `/lib/modules/…`, which is *on the root filesystem*.**
>
> **So: to mount the root filesystem, the kernel needs a file that is on the root filesystem.**
>
> **Explain.**

## 34.2 THE PROBLEM: modularity creates a circle

Volume 3 §16.5 asserted that "initramfs made the `/usr` split obsolete" and didn't justify it. Here
is the justification, and it starts with why initramfs exists at all.

A Debian kernel is **modular**. Almost nothing is compiled in:

```bash
ls /lib/modules/$(uname -r)/kernel/ 2>/dev/null
find /lib/modules/$(uname -r) -name '*.ko*' 2>/dev/null | wc -l
```

*(Describing — my microVM has no modules directory.)* On a Debian laptop that count is typically
several thousand. The ext4 driver, the NVMe driver, the AHCI driver, the LVM device-mapper targets,
the LUKS crypto — **all modules, all under `/lib/modules`, all on the root filesystem you're trying
to mount.**

There are exactly three ways out, and it's worth seeing why two of them lose:

**Option 1 — compile everything into the kernel.** No modules, no circle. This is what you do for an
embedded device where you know the hardware.

For a *distribution* it's impossible: Debian's kernel must boot on a machine with SATA, or NVMe, or
virtio, or SCSI, or MMC; with ext4, or XFS, or Btrfs; with or without LVM, RAID, LUKS. Compiling in
every driver for every possibility produces a kernel of hundreds of megabytes that must be loaded
into RAM in its entirety, on every machine, to use one percent of it.

**Option 2 — have the bootloader load the modules.** GRUB does have filesystem drivers, so it could
in principle read `/lib/modules` and hand the kernel what it needs.

But **which** modules? Determining that requires hardware probing, which requires drivers, which is
the problem again — now in the bootloader, where there is no `udev`, no `/sys`, and 440 bytes of
stage 1.

**Option 3 — ship a small, self-contained root filesystem inside the boot image.**

> Put in it exactly the modules and tools needed to *find and mount the real root* — and nothing
> else. Load it into RAM alongside the kernel, use it as a temporary `/`, let it do the hardware
> probing and the LVM assembly and the LUKS unlocking with full userspace facilities available, and
> then **replace itself** with the real root.

**That's the initramfs**, and it wins because it moves the problem from a place with no facilities
(the bootloader) to a place with all of them (userspace), at the cost of a few megabytes in `/boot`.

## 34.3 THE MECHANISM

```
   GRUB loads TWO files into memory and jumps to the first:

      vmlinuz-6.1.0-18-amd64      the kernel (self-decompressing)
      initrd.img-6.1.0-18-amd64   a compressed CPIO ARCHIVE
                │
                ▼
   1. kernel decompresses itself, sets up paging, start_kernel()
   2. kernel creates a TMPFS and unpacks the cpio archive into it
   3. kernel mounts that tmpfs as  /
   4. kernel executes  /init  in it        ← userspace begins HERE, in RAM
                │
                ▼
   5. /init loads modules, probes hardware, assembles LVM/RAID,
      PROMPTS FOR THE LUKS PASSPHRASE (§35), finds root=UUID=…
   6. mounts the real root at /root
                │
                ▼
   7. switch_root: move /proc /sys /dev across, make /root become /,
      DELETE the initramfs contents (freeing the RAM), exec /sbin/init
                │
                ▼
   8. systemd is now PID 1 on the real root.  The initramfs no longer exists.
```

**Two things about this are worth stating explicitly.**

First: **step 4 is where userspace starts.** Not step 8. There is a complete, if minimal, Linux
userspace running from RAM — with a shell, `udev`, and `cryptsetup` — several seconds before your
root filesystem is mounted. That's why the LUKS prompt looks nothing like your login screen: it
comes from a different, tiny operating environment.

Second: **the format is `cpio`, not `tar`.** The historical reason is that `cpio`'s "newc" format is
trivial to parse — the kernel's unpacker is a few hundred lines — and it can represent device nodes,
which early initramfs images needed. (Modern ones mostly don't, since `devtmpfs` creates them.)

> **A naming pedantry that causes confusion.** An **initrd** (original) was a compressed *block
> device image* — the kernel set it up as a RAM disk and mounted a real filesystem from it. An
> **initramfs** (modern) is a *cpio archive unpacked into tmpfs*. Different mechanisms. **Debian
> still names the file `initrd.img-*`** for historical continuity, but it contains an initramfs.
>
> **Confidence: high** on the distinction and on Debian's naming.

## 34.4 `rdinit=` versus `init=`, and my accidental illustration

§33.5 introduced these. Now they mean something precise:

| Parameter | Overrides | Runs |
|---|---|---|
| **`rdinit=`** | `/init` **in the initramfs** | at step 4 — **before** any real root exists |
| **`init=`** | `/sbin/init` **on the real root** | at step 8 — **after** `switch_root` |

And my test machine happens to demonstrate the first one *(verified — this is a real
`/proc/cmdline`)*:

```
console=ttyS0 reboot=k panic=1 nomodule random.trust_cpu=1 ipv6.disable=1
swiotlb=noforce rdinit=/process_api -- --firecracker-init --addr 0.0.0.0:2024 ...
```

`rdinit=/process_api` says: **never switch to a real root at all.** Run this program from the
initramfs, as PID 1, forever. Which is exactly what a short-lived microVM wants — no disk, no
`switch_root`, no systemd — and exactly what your laptop does not.

That's the boundary in §34.3 made concrete: everything before `switch_root` is the initramfs's
world, and `rdinit=` is the parameter that says "stay there."

## 34.5 Look inside your own

Debian ships a tool for exactly this, from `initramfs-tools`:

```bash
mkdir -p /tmp/initrd && cd /tmp/initrd
sudo unmkinitramfs /boot/initrd.img-$(uname -r) .
ls
```

*(Describing — no `unmkinitramfs` or `cpio` on my test box, so this section is reasoning from
documentation rather than reporting output. **Confidence: high** on the structure.)*

You should get two or three directories, and the split is interesting:

```
early/      an UNCOMPRESSED cpio archive, prepended
main/       the compressed archive — the actual initramfs
```

> **Why the split?** `early/` contains **CPU microcode updates**. The kernel needs to apply those
> *before* it does much of anything, so that archive must be uncompressed (no decompressor available
> yet) and must come first. The kernel unpacks concatenated cpio archives in sequence, so
> prepending an uncompressed one works with no special support.
>
> ```bash
> ls early/kernel/x86/microcode/ 2>/dev/null
> dpkg -l intel-microcode amd64-microcode 2>/dev/null | tail -3
> ```

And `main/` is a small Linux root filesystem:

```bash
cd main && ls
```

| Path | Contents |
|---|---|
| **`init`** | **the shell script the kernel executes** — read it, it's readable |
| `bin/`, `sbin/` | `busybox` or `klibc` utilities — a tiny `sh`, `mount`, `blkid` |
| **`lib/modules/<ver>/`** | **only the modules needed to reach the root** |
| `scripts/` | initramfs-tools' hook scripts, by boot stage |
| `conf/` | `initramfs.conf` and drop-ins |
| **`cryptroot/`** | LUKS configuration — present if `cryptsetup-initramfs` is installed |
| `etc/` | minimal config, `udev` rules |

```bash
head -40 main/init
ls main/scripts/
find main/lib/modules -name '*.ko*' | wc -l      # compare with the thousands on disk
cd /tmp && rm -rf /tmp/initrd
```

**`main/scripts/` is the part worth reading**, because `initramfs-tools` defines an ordered sequence
of hook points and packages drop scripts into them:

| Stage | Runs |
|---|---|
| `init-top` | very first — `udev` starts here |
| `init-premount` | before any filesystem is mounted |
| **`local-top`** | **LVM assembly, LUKS unlocking** — where your passphrase prompt lives |
| `local-premount` | just before mounting root — `fsck` happens here |
| `local-bottom` | after root is mounted |
| `init-bottom` | last — moves `/dev` etc. across, then `switch_root` |

```bash
ls /usr/share/initramfs-tools/scripts/local-top/ 2>/dev/null
ls /etc/initramfs-tools/scripts/ 2>/dev/null
```

## 34.6 Debian's `initramfs-tools`

> **Confidence: high** that `initramfs-tools` is Debian's own implementation (shared with Ubuntu) and
> that `dracut` is the Fedora-originated alternative, packaged for Debian.

```bash
dpkg -l initramfs-tools cryptsetup-initramfs 2>/dev/null | tail -3
cat /etc/initramfs-tools/initramfs.conf
ls /etc/initramfs-tools/
```

The setting that matters most:

```
MODULES=most        # ← Debian's default
# MODULES=dep
```

| Value | Behaviour |
|---|---|
| **`most`** | include a broad set of storage and filesystem modules — **works on hardware you haven't got yet** |
| `dep` | include only modules for hardware **currently** detected — much smaller and faster, but the image may not boot if you move the disk to a different machine |

`most` is the right default for a distribution: it means the initramfs from your laptop will boot in
a different laptop. `dep` is what you'd choose for a server whose hardware never changes.

**Rebuilding**, which you must do after changing crypto config, adding a module, or installing
microcode:

```bash
sudo update-initramfs -u                  # update the CURRENT kernel's image
sudo update-initramfs -u -k all           # ALL installed kernels
sudo update-initramfs -c -k $(uname -r)   # create from scratch
```

> **`update-initramfs -u -k all` is the safe habit.** Updating only the running kernel leaves your
> older kernels — the ones in GRUB's menu that you'd fall back to if something breaks — with a stale
> initramfs. Which is precisely the situation in which you need them to work.

And note that `update-grub` and `update-initramfs` are *different* things people confuse:

| Command | Regenerates | When you need it |
|---|---|---|
| `update-initramfs` | the initramfs image in `/boot` | crypto config, modules, microcode changed |
| `update-grub` | `/boot/grub/grub.cfg` | new kernel installed, `/etc/default/grub` edited |

Installing a kernel package runs both for you, via the hooks in `/etc/kernel/`:

```bash
ls /etc/kernel/postinst.d/ /etc/kernel/postrm.d/ 2>/dev/null
```

That's Volume 4 §21.6's maintainer-script machinery, wiring the two together.

## 34.7 Watching the kernel boot

Everything above leaves a record:

```bash
sudo dmesg -T | head -40
sudo dmesg -T | grep -iE 'Linux version|Command line|Memory:|initramfs|Freeing initrd|switch'
sudo dmesg -T | grep -iE 'ext4|nvme|dm-|crypt' | head -20
```

*(Describing.)* Look for these landmarks in order:

| Message | Stage |
|---|---|
| `Linux version 6.1.0-18-amd64 …` | the kernel has decompressed and started |
| `Command line: BOOT_IMAGE=… root=UUID=…` | §33.5's handoff, as the kernel received it |
| `Memory: 16218112K/16777216K available` | memory map from firmware |
| `Unpacking initramfs...` | §34.3 step 2 |
| **`Freeing initrd memory: NNNNK`** | **the initramfs tmpfs being reclaimed after `switch_root`** |
| `EXT4-fs (dm-1): mounted filesystem` | the real root, mounted |
| `systemd[1]: systemd 252 running in system mode` | §36 begins |

> **`Freeing initrd memory` is the moment step 7 completed.** Everything logged before it happened
> in RAM, in the initramfs. Everything after is on your real root filesystem. It is the sharpest
> single line in `dmesg`.

If `quiet` is suppressing all this, `journalctl -k -b` has the same content, and removing `quiet`
from `GRUB_CMDLINE_LINUX_DEFAULT` for one boot is a reasonable diagnostic step.

## 34.8 And now Volume 3's `/usr` merge makes sense

Volume 3 §16.5 explained that `/bin` and `/usr/bin` were split because of a 1971 disk shortage, that
the split *survived* for a different reason — **`/usr` might be a separate filesystem that isn't
mounted yet, so `/bin` had to hold enough to boot** — and that initramfs killed that second reason.

Here's why, precisely:

```
   OLD WORLD (no initramfs):
     kernel mounts / directly  →  runs /sbin/init  →  init mounts /usr
                                      ↑
                        everything needed UP TO THIS POINT
                        had to be in /bin, /sbin, /lib

   INITRAMFS WORLD:
     kernel → initramfs (has its OWN complete toolset in RAM)
            → initramfs mounts EVERYTHING, /usr included
            → switch_root
            → /sbin/init starts with /usr ALREADY MOUNTED
                                      ↑
                        nothing needs to work without /usr, ever
```

> **The initramfs is a complete, self-contained rescue environment that runs before the real root
> exists. Once you have that, the "minimal set of tools that works without `/usr`" has no consumer**
> — and a directory split maintained for fifty years becomes pure overhead.
>
> Which is why `ls -ld /bin` on your machine shows a symlink (Volume 3 §16.5, verified there).

---

