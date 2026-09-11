# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 6 — The Boot Process, Deeply

---

### Where the first five volumes left off

This volume closes more debts than any other, because almost everything in the book has quietly
depended on the boot process without explaining it:

| Debt | From | Closed in |
|---|---|---|
| Why `/usr` could be merged into `/` — "initramfs made the split obsolete" | Volume 3 §16.5 | **§34.2** |
| The FAT32 partition at `/boot/efi` you found and didn't understand | Volume 3 §17.3 | **§32.5** |
| PID reuse makes tracking a daemon by PID file unsafe | Volume 2 §12.2 | **§36.5** — cgroups |
| systemd socket activation: "the privileged process opens the fd, the unprivileged one inherits it" | Volume 5 §29.3 | **§36.4** |
| `systemd-resolved` — what *is* it | Volume 5 §27.4 | §36.9 |
| The 2014 Technical Committee vote and the General Resolutions that followed | Volume 4 §20.5 | **§37 — the whole chapter** |
| The LUKS passphrase you typed during installation | your install | **§35** |

**Requirements.** Most of this volume is *reading* your own system, not changing it:

```bash
sudo apt install efibootmgr mokutil        # UEFI and Secure Boot inspection
sudo apt install cryptsetup-bin            # LUKS inspection (you may have it already)
```

> **A verification note, and it needs to be more prominent than usual.** This is **the least
> verifiable volume in the book**, and I'd rather say so than pretend otherwise.
>
> My test environment is a **Firecracker microVM** with a custom init passed via `rdinit=`. It has
> **no UEFI firmware, no bootloader, no `/boot` contents, no encrypted volume, no `cpio`, and
> systemd is installed but not running as PID 1.** I cannot boot it and watch.
>
> So in this volume:
>
> - **Verified and reported as such:** `/proc/cmdline` parsing, offline `systemd-analyze verify`,
>   key-derivation timing, and the reasoning throughout.
> - **Described, not run — marked inline:** everything involving `efibootmgr`, `mokutil`,
>   `cryptsetup luksDump`, `unmkinitramfs`, `update-grub`, and every live `systemctl`/`journalctl`
>   invocation.
>
> The mechanisms are well documented and I'm confident in them. But you will be running these on a
> real machine and I was not, so where I say "you should see," treat it as a prediction rather than
> a measurement.

---

# Chapter 32 — Power On: Where the First Instruction Comes From

## 32.1 The hook

> **You press the power button. A fraction of a second later the CPU is executing instructions.**
>
> **But RAM is empty — it's volatile, it lost everything when the power went off. And the disk
> hasn't been read, because reading a disk requires a driver, and a driver is code, and code has to
> come from somewhere.**
>
> **So what is the CPU executing, and where did it come from?**

## 32.2 THE PROBLEM: bootstrapping is circular

Every layer needs the one below it, and the bottom layer has nothing beneath it:

```
   to run a program        you need an OS
   to have an OS           you need to load it from disk
   to read a disk          you need a disk driver
   to have a driver        you need to have loaded code
   to load code            you need a program running
                                  ↑
                            ...and round we go
```

The word "bootstrap" is literally about this — pulling yourself up by your own bootstraps, which is
impossible, which is the joke.

**The answer is to break the circle with hardware.** Put some code in **non-volatile memory** — a
flash chip on the motherboard — and wire the CPU so that on reset it starts executing at a fixed
physical address that is mapped to that chip.

On x86, the CPU comes out of reset in **real mode**, executing at a **reset vector** near the top of
the address space — conventionally `0xFFFFFFF0` — which the chipset aliases to the firmware flash.

> **Confidence: high** that the reset vector mechanism works this way; **moderate** on the exact
> address, which depends on the CPU generation and chipset aliasing.

**That firmware is the only code on the machine that doesn't need anything to load it**, because it
is physically present in an addressable chip. Everything else in this volume is a consequence.

## 32.3 Legacy BIOS: 440 bytes to work with

The IBM PC's approach, from 1981, and still supported by essentially every x86 machine:

1. **POST** — Power-On Self Test. Check the CPU, initialise the memory controller, enumerate buses,
   set up interrupt vectors.
2. Consult the configured boot order.
3. For a disk, **read the very first 512-byte sector into memory at `0x7C00`** and jump to it.

That first sector is the **Master Boot Record**, and its layout is fixed:

```
   offset  size   contents
   ──────────────────────────────────────────────────────────────
   0x000   440    BOOTSTRAP CODE          ← the entire budget
   0x1B8     4    disk signature
   0x1BC     2    (usually zero)
   0x1BE    64    PARTITION TABLE — 4 entries × 16 bytes
   0x1FE     2    0x55 0xAA — the boot signature
   ──────────────────────────────────────────────────────────────
                  512 bytes total
```

> **Confidence: high** on this layout. Note that "446 bytes" is also commonly quoted, counting
> through offset `0x1BD`; the strictly-code region is 440.

**Four hundred and forty bytes.** In 16-bit real mode. That is the complete space available for the
program that must find and load an operating system.

You can look at your own, safely — reading is harmless:

```bash
sudo dd if=/dev/sda bs=512 count=1 2>/dev/null | xxd | head -8
sudo dd if=/dev/sda bs=512 count=1 2>/dev/null | tail -c 2 | xxd    # the 55AA signature
```

*(Substitute your disk from `lsblk`. **Reading is safe; never `dd` *to* this device.**)*

> **440 bytes is why bootloaders are multi-stage**, and it's the single constraint that explains
> GRUB's entire architecture (§33.3). You cannot fit a filesystem driver in 440 bytes, so stage 1's
> only job is to load stage 2 — from a **hardcoded disk location**, because it can't read a
> filesystem to find it.

**And 440 bytes is why the MBR's four-partition limit existed:** 64 bytes divided by 16 bytes per
entry. Volume 3 §17.3's MBR-versus-GPT table, now with the arithmetic behind it.

## 32.4 UEFI: firmware that can read a filesystem

The modern replacement, and the change is more radical than "BIOS but newer."

> **Confidence: high.** UEFI descends from Intel's EFI, developed in the late 1990s for Itanium, and
> has been managed by the UEFI Forum since 2005.

| | **Legacy BIOS** | **UEFI** |
|---|---|---|
| CPU mode | **16-bit real mode** | 32- or 64-bit protected mode |
| Bootloader lives in | **440 raw bytes** in sector 0 | **an ordinary file** on a filesystem |
| Firmware understands filesystems? | **no** | **yes — FAT32, mandatorily** |
| Boot configuration | a byte in CMOS | **NVRAM variables**, editable from the running OS |
| Partition table | MBR | GPT |
| Drivers | none beyond INT 13h | its own driver model, network stack, and a shell |
| Signature verification | none | **Secure Boot** (§32.6) |

**The consequence that matters:** because UEFI can read FAT32, the bootloader stops being a
size-constrained blob and becomes a **normal executable file at a normal path**. GRUB's UEFI build
is one file, loaded directly by firmware. No stages, no MBR gap, no hardcoded sector numbers.

Which firmware booted your machine? There's a one-line answer:

```bash
[ -d /sys/firmware/efi ] && echo "booted via UEFI" || echo "booted via legacy BIOS"
ls /sys/firmware/
```

*(Verified that `/sys/firmware/` exists and lacks `efi` in my microVM — so the test correctly
reports legacy/none there.)*

> **That directory is the whole test.** The kernel only creates `/sys/firmware/efi` if it was handed
> a UEFI system table at boot. If it's absent, you are in legacy BIOS mode — and if you *thought*
> you installed in UEFI mode, that mismatch is worth knowing, because it determines which bootloader
> your machine actually uses.

And the boot configuration is now *live data you can read*:

```bash
sudo efibootmgr -v
```

*(Describing.)* You should see something like:

```
BootCurrent: 0000
Timeout: 1 seconds
BootOrder: 0000,0001,0002
Boot0000* debian	HD(1,GPT,8f3a9c21-...)/File(\EFI\debian\shimx64.efi)
Boot0001* UEFI: PXE IPv4
Boot0002* Windows Boot Manager	HD(1,GPT,...)/File(\EFI\Microsoft\Boot\bootmgfw.efi)
```

Each entry names a **partition** and a **file path within it**. `BootOrder` is the sequence the
firmware tries. That entire structure lives in motherboard NVRAM, and you can see the raw variables:

```bash
ls /sys/firmware/efi/efivars/ | head -20
ls /sys/firmware/efi/efivars/ | wc -l
```

> **A genuine warning about `efivars`.** These are firmware variables exposed as files, and they are
> **writable**. Historically, deleting the wrong ones — or filling the NVRAM — has **bricked
> motherboards**, which is why the kernel now marks them immutable by default and refuses to let the
> variable store fall below a reserved threshold. **Read them freely. Do not delete them.**
>
> **Confidence: moderate-high** that motherboard-bricking incidents from `efivars` writes are real
> and prompted kernel protections.

## 32.5 The ESP — Volume 3's mystery partition

Volume 3 §17.3 found a small FAT32 partition mounted at `/boot/efi` and deferred the explanation.

```bash
findmnt /boot/efi -o TARGET,SOURCE,FSTYPE,SIZE,OPTIONS
sudo ls -R /boot/efi/EFI/ 2>/dev/null | head -20
```

*(Describing.)*

```
TARGET     SOURCE         FSTYPE SIZE  OPTIONS
/boot/efi  /dev/nvme0n1p1 vfat   512M  rw,relatime,fmask=0077,dmask=0077

/boot/efi/EFI/debian:
BOOTX64.CSV  fbx64.efi  grubx64.efi  mmx64.efi  shimx64.efi
```

> **Why FAT32?** Because the UEFI specification **requires** firmware to implement FAT32 and requires
> nothing else. It's not a good filesystem — no journal, no permissions, no symlinks — but it is the
> one filesystem every UEFI implementation on Earth is guaranteed to read. **The requirement is
> interoperability, not quality.**

Note the mount options: `fmask=0077,dmask=0077`. FAT32 has no concept of Unix ownership or
permission bits (Volume 2 §10), so the driver **synthesises** them at mount time — which is why
`ls -l` on the ESP shows plausible-looking modes that aren't stored anywhere.

**The files, and what each is for:**

| File | Role |
|---|---|
| **`shimx64.efi`** | **first-stage loader, signed by Microsoft's UEFI CA** — §32.6 |
| **`grubx64.efi`** | GRUB proper, signed by **Debian's** key |
| `mmx64.efi` | MokManager — enrols your own Secure Boot keys |
| `fbx64.efi` | fallback — recreates the NVRAM boot entry if it's lost |
| `BOOTX64.CSV` | data for the fallback loader |

And there's a conventional fallback path for removable media, which firmware tries when there's no
NVRAM entry:

```bash
sudo ls /boot/efi/EFI/BOOT/ 2>/dev/null
```

`\EFI\BOOT\BOOTX64.EFI` is the "just boot this" path. It's how a USB installer works on a machine
that's never seen it.

## 32.6 Secure Boot, and why Debian ships a Microsoft-signed file

> **Confidence: high** on the shim mechanism and Microsoft's role; **moderate** on the specifics of
> kernel lockdown behaviour, which has changed across versions.

**THE PROBLEM.** §32.4 made the bootloader a file on a FAT32 partition with no permissions. Anyone
with physical access — or any root process — can replace it with one that loads a modified kernel.
The firmware has no way to tell.

**Secure Boot** has the firmware verify a cryptographic signature on the bootloader before executing
it, against keys stored in firmware:

| Key store | Contents |
|---|---|
| **PK** | Platform Key — the root, usually the hardware vendor's |
| **KEK** | Key Exchange Keys — who may update `db`/`dbx` |
| **`db`** | **allowed** signing certificates |
| **`dbx`** | **revoked** — signatures that must be refused even if in `db` |

```bash
mokutil --sb-state
sudo dmesg | grep -iE 'secure boot|lockdown'
od -An -t u1 /sys/firmware/efi/efivars/SecureBoot-* 2>/dev/null | head -1
```

*(Describing.)* The `SecureBoot` variable's fifth byte is `1` for enabled — the first four bytes are
EFI attribute flags.

### The shim, and the awkward political fact underneath it

Here is the problem Debian faced. Essentially every consumer PC ships with **Microsoft's UEFI CA
certificate** in `db`, and very few ship with Debian's. So for Debian to boot on stock hardware with
Secure Boot on, its bootloader must carry a signature the firmware already trusts — **which in
practice means a Microsoft signature.**

Signing GRUB itself with Microsoft's key is impractical: GRUB changes often, and each new build would
need re-submission. So the distributions collectively built **shim**:

```
   FIRMWARE
      │  verifies against db → finds MICROSOFT's certificate
      ▼
   shimx64.efi          ← tiny, changes almost never, SIGNED BY MICROSOFT
      │  contains DEBIAN's certificate, embedded
      │  verifies grubx64.efi against it
      ▼
   grubx64.efi          ← SIGNED BY DEBIAN
      │  verifies the kernel
      ▼
   vmlinuz              ← SIGNED BY DEBIAN
      │
      ▼
   kernel enables LOCKDOWN mode
```

> **shim is a deliberate layer of indirection to solve a *trust distribution* problem, not a
> technical one.** It exists because the set of keys in consumer firmware is decided by hardware
> vendors, and in practice that means one company's CA is the only universally-present one. Debian
> gets to sign its own bootloader and kernel; it just needs one Microsoft-signed stepping stone to be
> allowed to start.

```bash
dpkg -l shim-signed grub-efi-amd64-signed linux-image-$(uname -r) 2>/dev/null | tail -4
mokutil --list-enrolled 2>/dev/null | head
```

**And `mmx64.efi` is the escape hatch.** MokManager lets *you* enrol a key — a Machine Owner Key — so
you can sign your own kernel modules (Volume 8's territory) or your own kernel and still boot with
Secure Boot on. It's how out-of-tree drivers like NVIDIA's work on a Secure Boot system:

```bash
sudo mokutil --list-enrolled 2>/dev/null
ls /var/lib/shim-signed/mok/ 2>/dev/null
```

**Kernel lockdown** is the other half. With Secure Boot on, the kernel restricts operations that
would let root subvert the verified kernel from userspace — loading unsigned modules, writing
`/dev/mem`, `kexec`ing an unsigned image, some debugging interfaces.

> **Which is worth stating plainly: Secure Boot changes what *root* can do.** That's unusual — Volume
> 2 treated root as absolute. Under lockdown it isn't, because the machine owner and the running root
> account are no longer assumed to be the same principal.

---

# Chapter 33 — GRUB: The Program That Runs Before Anything Exists

## 33.1 The hook

> **§32.3 established that a legacy BIOS gives a bootloader 440 bytes.**
>
> **GRUB is a substantial piece of software — filesystem drivers for two dozen filesystems, LVM and
> RAID support, LUKS decryption, a scripting language, a menu system, font rendering, and
> internationalisation.**
>
> **How does that fit in 440 bytes? It doesn't. So what actually happens?**

## 33.2 THE PROBLEM: what a bootloader must accomplish

Before any operating system exists, something must:

1. **Read a filesystem the firmware doesn't understand.** ext4, XFS, Btrfs — UEFI knows only FAT32,
   and legacy BIOS knows nothing at all.
2. **Traverse whatever is under that filesystem.** Your `/boot` might be on LVM, on RAID, or inside
   a LUKS container — so the bootloader needs LVM code, RAID code, and cryptography.
3. **Find and load a kernel** into memory at the address it expects.
4. **Load the initramfs** too, and record where it is.
5. **Build the boot parameter structure** — memory map, command line, framebuffer info.
6. **Offer a menu**, because you may need an older kernel or recovery mode.
7. **Jump to the kernel**, and cease to exist.

All with no OS, no libc, no `malloc` worth the name, and no way to report an error other than
printing to a screen it had to initialise itself.

## 33.3 THE MECHANISM: stages, and why they exist

### Legacy BIOS — three stages, forced by 440 bytes

```
   ┌─ sector 0 ─────────────────────────────────────┐
   │ boot.img  (440 bytes)                          │
   │  • cannot read any filesystem                  │
   │  • contains ONE hardcoded LBA sector number    │
   │  • loads the next stage from that raw address  │
   └────────────────────┬───────────────────────────┘
                        ▼
   ┌─ the "MBR gap" — sectors 1..2047, unpartitioned ┐
   │ core.img  (~30 KB)                              │
   │  • NOW has filesystem drivers                   │
   │  • can read /boot/grub                          │
   └────────────────────┬────────────────────────────┘
                        ▼
   ┌─ /boot/grub/ on a real filesystem ──────────────┐
   │  grub.cfg, *.mod modules, fonts, themes, locale │
   └─────────────────────────────────────────────────┘
```

> **The chain is: raw sector number → filesystem driver → file path.** Each stage exists only to
> gain the capability the next one needs. Stage 1 can't find stage 2 by name, so its location is
> baked in as a literal sector number — which is why re-imaging a disk with `dd` can produce a
> machine that reads the right MBR and then jumps into garbage.

**The MBR gap** is that unpartitioned space between sector 0 and the first partition. Traditionally
the first partition started at sector 63, leaving 62 sectors (~31 KB). Modern tools align to sector
2048, leaving ~1 MB — deliberately, partly for this.

On **GPT with legacy BIOS** there's no gap by convention, so GRUB needs an explicit **BIOS Boot
Partition** (type `ef02`) to put `core.img` in:

```bash
sudo sgdisk -p /dev/sda 2>/dev/null | grep -i 'ef02\|BIOS boot'
lsblk -o NAME,SIZE,PARTTYPENAME 2>/dev/null | head
```

### UEFI — no stages needed

```
   FIRMWARE reads FAT32 → loads \EFI\debian\shimx64.efi → grubx64.efi
```

That's it. One file, loaded by name. **All of the staging complexity above exists purely because
legacy BIOS couldn't read a filesystem.**

```bash
sudo ls -la /boot/efi/EFI/debian/
ls /boot/grub/
ls /boot/grub/x86_64-efi/ 2>/dev/null | head -5   # or i386-pc/ on legacy BIOS
```

The directory name tells you which platform GRUB was installed for: `x86_64-efi` versus `i386-pc`.

## 33.4 GRUB's configuration, the Debian way

```bash
ls -l /boot/grub/grub.cfg
head -12 /boot/grub/grub.cfg
```

*(Describing.)*

```
#
# DO NOT EDIT THIS FILE
#
# It is automatically generated by grub-mkconfig using templates
# from /etc/grub.d and settings from /etc/default/grub
#
```

**It means it.** The generation pipeline:

```
   /etc/default/grub          ← YOUR settings (a shell fragment)
          +
   /etc/grub.d/*              ← generator scripts, run in NUMERIC ORDER
          │
          ▼
   grub-mkconfig  ─── or, on Debian, the wrapper:  update-grub
          │
          ▼
   /boot/grub/grub.cfg        ← generated. Overwritten every time.
```

```bash
cat /etc/default/grub
ls -l /etc/grub.d/
```

| Script | Produces |
|---|---|
| `00_header` | timeout, default entry, graphics setup |
| `05_debian_theme` | Debian's background and colours |
| **`10_linux`** | **one menu entry per kernel in `/boot`, plus a recovery entry each** |
| `20_linux_xen` | Xen entries if present |
| **`30_os-prober`** | **entries for other operating systems it finds on your disks** |
| `40_custom`, `41_custom` | **where your own entries go** |

> **`update-grub` is Debian's own wrapper** for `grub-mkconfig -o /boot/grub/grub.cfg`. Fedora and
> friends use `grub2-mkconfig` directly, which is why cross-distribution GRUB advice often doesn't
> quite work.
>
> **Confidence: high** that `update-grub` is Debian-specific.

**The knobs in `/etc/default/grub` you'll actually touch:**

| Setting | Effect |
|---|---|
| `GRUB_TIMEOUT=5` | seconds before booting the default |
| `GRUB_TIMEOUT_STYLE=hidden` | **hide the menu** — hold Shift (BIOS) or press Esc (UEFI) to show it |
| `GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"` | appended to the normal boot's kernel command line |
| `GRUB_CMDLINE_LINUX=""` | appended to **all** entries, including recovery |
| `GRUB_DISABLE_OS_PROBER=true` | stop scanning for other OSes (now the default in some versions) |

**Always regenerate and never edit `grub.cfg`:**

```bash
sudo update-grub
```

> **And `os-prober` is worth a warning.** It mounts every filesystem it can find to look for other
> operating systems. On a machine with LVM snapshots, VM disk images, or Btrfs subvolumes, it can
> produce nonsense entries or take a very long time. Debian has moved toward disabling it by default
> for this reason. **Confidence: moderate.**

## 33.5 The kernel command line: what you actually booted with

This is the handoff from GRUB to the kernel, and it's readable after the fact:

```bash
cat /proc/cmdline
```

Verified, from my microVM:

```
console=ttyS0 reboot=k panic=1 nomodule random.trust_cpu=1 ipv6.disable=1
swiotlb=noforce rdinit=/process_api -- --firecracker-init --addr 0.0.0.0:2024 ...
```

*(Verified — that's a real `/proc/cmdline`, and an unusual one that happens to illustrate §34
perfectly.)* On your Debian laptop it'll look more like:

```
BOOT_IMAGE=/vmlinuz-6.1.0-18-amd64 root=UUID=8f3a9c21-... ro quiet splash
```

| Parameter | Meaning |
|---|---|
| `BOOT_IMAGE=` | which kernel GRUB loaded |
| **`root=UUID=…`** | **where the real root filesystem is** — Volume 3 §17.5's UUID, doing its job |
| `ro` | mount root read-only initially; remounted `rw` later, after `fsck` |
| `quiet` | suppress most kernel messages |
| `splash` | show a graphical boot splash |
| **`init=`** | override `/sbin/init` **after** switching to the real root |
| **`rdinit=`** | override the init **inside the initramfs** — §34.4 |

> **`rdinit=` versus `init=` is the sharpest possible illustration of §34's boundary**, and my test
> box happens to use it. `rdinit=/process_api` means *"never switch to a real root at all — just run
> this, from the initramfs, as PID 1."* Which is exactly what a microVM wants and exactly what a
> laptop doesn't.

**And `init=/bin/bash` is the emergency recovery trick**: edit the GRUB entry with `e` at the menu,
append it, and boot to a root shell with no init, no services, and a read-only root. It's the
answer to "I broke `/etc/fstab`" or "I broke `sudoers`" — which Volume 2 §11.5 and Volume 3 §17.5
both warned you about.

## 33.6 Password-protecting GRUB, and why you'd bother

Given §33.5, an unprotected GRUB menu means **anyone with the keyboard is root**:

```
   press 'e' at the menu → append init=/bin/bash → boot → you are root,
   with no password, on an unencrypted disk
```

That's not a bug — a bootloader's job includes recovery. But it means **physical access equals root
unless you do something about it**, and there are exactly two things:

1. **Full-disk encryption** (§35) — the data is unreadable regardless
2. **A GRUB password** — protects the *menu editing*, not the data

```bash
grub-mkpasswd-pbkdf2                          # generates a PBKDF2 hash to paste
sudo grep -rn 'superusers\|password_pbkdf2' /etc/grub.d/ /boot/grub/grub.cfg 2>/dev/null
```

A GRUB password without disk encryption is close to theatre — pull the disk and read it elsewhere.
**Encryption without a GRUB password is genuinely useful.** The combination is what you want if you
care.

## 33.7 THE INCIDENT: press backspace 28 times

> **Confidence: high** on the vulnerability, the researchers and the mechanism; **moderate** on the
> exact code path.

In 2015, **Hector Marco and Ismael Ripoll** found that GRUB2's password prompt could be bypassed
like this:

```
   At the username or password prompt, press BACKSPACE 28 times.
   You are dropped into the GRUB rescue shell.
```

**That's the entire exploit.** No tooling, no timing, no preparation.

**The mechanism** was an integer underflow. GRUB's input routine decremented a character counter on
each backspace **without checking whether it was already zero**. Twenty-eight presses drove it
negative, and the resulting out-of-bounds writes corrupted the state the authentication check relied
on. Instead of "wrong password," you got `grub rescue>`.

And from the rescue shell you have everything §33.5 described — load any kernel, with any command
line, including `init=/bin/bash`.

> **Confidence: high** on "28 backspaces" being the reported figure; the number depends on the
> memory layout, so treat it as the specific value they reported rather than a universal constant.

**Assigned CVE-2015-8370**, and patched quickly. What makes it worth telling isn't the bug — it's
what the bug reveals:

> **Bootloader code is security-critical and receives a small fraction of the kernel's scrutiny.**
> GRUB runs before any memory protection, before any privilege separation, with full hardware access
> and no supervisor. Every one of Volume 2's and Volume 3's protections — permission bits, setuid
> semantics, mount options, kernel lockdown — **does not exist yet.** A one-line missing bounds check
> in GRUB is not comparable to a one-line missing bounds check in a userspace utility.

## 33.8 The bigger incident: BootHole, and why revocation is nearly impossible

> **Confidence: moderate-high** on the CVE, Eclypsium's disclosure in July 2020, and the revocation
> difficulties.

In July 2020, Eclypsium disclosed **CVE-2020-10713**, nicknamed **BootHole** — a buffer overflow in
**GRUB's own `grub.cfg` parser**. Because `grub.cfg` lives on an *unsigned* filesystem while GRUB
itself is signed, an attacker who could write that file could achieve **arbitrary code execution
inside a Secure Boot-verified bootloader.**

Which defeats the entire point of §32.6's chain: the firmware verified GRUB's signature correctly,
and then GRUB read attacker-controlled configuration and did what it said.

**The fix was straightforward. Deploying it was not**, and this is the interesting part:

```
   To stop a vulnerable, VALIDLY SIGNED GRUB from running, you must
   REVOKE its signature — by adding it to the firmware's dbx list.

   But:
     • dbx lives in motherboard NVRAM, with limited space
     • revoking old GRUB signatures makes every OLDER installation media
       and every un-updated system UNBOOTABLE
     • the update must reach firmware, bootloader, shim and kernel
       IN THE RIGHT ORDER, or you brick the machine
     • and it has to work across every vendor's firmware implementation
```

The rollout caused real unbootable systems across multiple distributions, and the revocation effort
took years and multiple rounds.

> **The generalisable lesson is about revocation, not about GRUB.** Volume 4 §23.6 showed one
> signature covering an entire package archive, and Volume 5 §28.7 showed a certificate chain
> validating a TLS connection. **In both cases revocation is the hard part** — CRLs and OCSP are
> famously unreliable for TLS, and here the revocation list is in a space-limited NVRAM variable
> where a mistake bricks the hardware.
>
> **Signing is easy. Un-signing is where trust chains actually break**, and it's the part that gets
> designed last.

---

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

# Chapter 35 — LUKS: The Lock Whose Key Can't Be Inside the Box

## 35.1 The hook

> **You typed a passphrase during installation and your disk is now encrypted. Good.**
>
> **But the program that asks for that passphrase, and the code that decrypts the disk, have to be
> stored *somewhere the machine can read before the disk is decrypted*.**
>
> **Which means part of your disk is necessarily unencrypted. Which part, and what does that mean
> for what you're actually protected against?**

## 35.2 THE PROBLEM: what permission bits cannot do

Volume 2 spent a chapter on nine permission bits, setuid, and privilege separation. All of it
depends on **one assumption**: that the kernel is the only thing mediating access to the disk.

Take the disk out and put it in another machine and every one of those protections evaporates:

```bash
# on any machine, as root, with your disk attached:
#   mount /dev/sdb2 /mnt
#   cat /mnt/home/vishal/.ssh/id_ed25519
#   cat /mnt/etc/shadow
```

**Your permission bits are enforced by *your* kernel. Another kernel has no reason to honour them.**
`root:root 0600` means nothing to a machine where the attacker is root.

> **This is the threat model full-disk encryption addresses, and only this one: an attacker who has
> the physical storage and not a running system.** Laptop theft, a disposed drive, a seized machine
> that was powered off. §35.7 is explicit about what it does *not* cover, because that's where people
> get it wrong.

## 35.3 THE MECHANISM: two levels of key, and why

> **Confidence: moderate-high** on LUKS's origin — Clemens Fruhwirth, around 2004; **high** on the
> mechanism.

**LUKS is not an encryption algorithm.** It is a **header format and key-management scheme** layered
on top of `dm-crypt`, the kernel's actual block-device encryption. LUKS's contribution is entirely
about *how keys are stored and unlocked*.

Start with the naive design, because its failures produce LUKS:

```
   NAIVE:   encryption key = KDF(your passphrase)
            data encrypted directly with that key
```

Three problems, all fatal in practice:

1. **Changing your passphrase means re-encrypting the entire disk.** The key changed, so every block
   must be decrypted with the old key and re-encrypted with the new one. Hours, on a terabyte, with
   a window during which a crash leaves the disk half-converted.
2. **Exactly one passphrase can ever work.** No recovery key, no second administrator.
3. **No way to revoke** one passphrase while keeping another.

**LUKS adds one level of indirection and all three problems disappear:**

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │  MASTER KEY  (also "volume key")                                    │
   │    • generated RANDOMLY at luksFormat time                          │
   │    • NEVER derived from your passphrase                             │
   │    • this is what actually encrypts your data                       │
   └─────────────────────────────────────────────────────────────────────┘
             ▲                    ▲                    ▲
             │ encrypted copy     │ encrypted copy     │ encrypted copy
   ┌─────────┴────────┐ ┌─────────┴────────┐ ┌─────────┴────────┐
   │  KEYSLOT 0       │ │  KEYSLOT 1       │ │  KEYSLOT 2       │  … up to 8 (LUKS1)
   │  unlocked by     │ │  unlocked by     │ │  unlocked by     │     or 32 (LUKS2)
   │  KDF(passphrase) │ │  KDF(recovery    │ │  KDF(keyfile)    │
   │                  │ │      phrase)     │ │                  │
   └──────────────────┘ └──────────────────┘ └──────────────────┘

   UNLOCKING:
     passphrase → KDF → slot key → decrypt keyslot → RECOVER MASTER KEY
                                                  → hand it to dm-crypt
```

Now re-read the three problems:

1. **Changing a passphrase re-encrypts one keyslot** — a few hundred bytes — not the disk. Instant.
2. **Eight (or 32) independent passphrases** can all unlock the same volume.
3. **Revoke by wiping a slot.** The others still work.

> **And the consequence nobody tells you until it's too late: if the LUKS header is destroyed, your
> data is permanently unrecoverable — even if you know the passphrase.** The master key existed
> *only* in that header. There is no derivation path from your passphrase to your data that doesn't
> go through it.
>
> A stray `dd`, a partition-table rewrite, or a bad sector in the first few megabytes and everything
> is gone. **Which is why this command exists and why you should run it:**
>
> ```bash
> sudo cryptsetup luksHeaderBackup /dev/nvme0n1p3 \
>      --header-backup-file ~/luks-header-backup.img
> ls -lh ~/luks-header-backup.img
> ```
>
> **And then store it somewhere other than that disk**, because a backup of the header on the volume
> it unlocks is not a backup. Note also that the backup file is **as sensitive as the disk** — anyone
> with it can attack your passphrase offline, at their leisure, forever.

## 35.4 The key derivation function, and why LUKS2 changed it

The keyslots are the attack surface. An attacker with your disk image has all eight keyslots and
unlimited time to guess passphrases offline — no rate limiting, no lockout, no logging. The **only**
defence is making each guess expensive.

**LUKS1 used PBKDF2**, with the iteration count calibrated at format time to take roughly one second
on the machine doing the formatting.

**LUKS2 defaults to Argon2id**, and the reason is the same one Volume 2 §9.6 gave for yescrypt:

```bash
python3 -c "
import time, hashlib
pw, salt = b'correct horse battery staple', b'0'*16
t = time.time(); hashlib.pbkdf2_hmac('sha256', pw, salt, 1000000); e = time.time()-t
print(f'  PBKDF2-SHA256, 1,000,000 iterations: {e:.2f}s')
print(f'  → roughly {int(1/e * 1000000):,} iterations per second on this CPU')
print(f'  → memory used: essentially zero')"
```

```
  PBKDF2-SHA256, 1,000,000 iterations: 0.30s
  → roughly 3,333,333 iterations per second on this CPU
  → memory used: essentially zero
```

*(Verified.)* And there's the problem:

> **PBKDF2 is CPU-bound and needs almost no memory. A GPU with 4,096 shader cores can therefore run
> ~4,096 guesses in parallel at nearly full speed** — and an ASIC does better still. Your "one
> second per guess" becomes a quarter of a millisecond per guess for the attacker.
>
> **Argon2id is *memory-hard*.** Configured with a 1 GiB memory cost, running 4,096 guesses in
> parallel requires **4 TiB of RAM**. GPUs have enormous compute and a few tens of gigabytes of
> memory. **The parallelism advantage evaporates**, because the scarce resource is no longer the one
> the attacker has a lot of.

Same insight, three times in this book: Morris and Thompson made guessing expensive in **time**
(1979); yescrypt and Argon2 make it expensive in **memory** (2010s), because that is what modern
attack hardware is short of.

## 35.5 Where the encryption boundary actually sits

Now the hook's question. Here is a Debian "guided — encrypted LVM" install, layer by layer:

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │  UEFI firmware              in motherboard flash    ── UNENCRYPTED     │
   ├────────────────────────────────────────────────────────────────────────┤
   │  /dev/nvme0n1p1   ESP, FAT32, mounted /boot/efi     ── UNENCRYPTED     │
   │     shimx64.efi, grubx64.efi                           (firmware must  │
   │                                                         read it)      │
   ├────────────────────────────────────────────────────────────────────────┤
   │  /dev/nvme0n1p2   ext4, mounted /boot               ── UNENCRYPTED     │
   │     vmlinuz-*, initrd.img-*, grub/                     (GRUB must     │
   │                                                         read it)      │
   ├════════════════════════════════════════════════════════════════════════┤
   │  /dev/nvme0n1p3   LUKS2 container                   ══ ENCRYPTED ══    │
   │    └─ /dev/mapper/nvme0n1p3_crypt      (dm-crypt)                      │
   │         └─ LVM physical volume                                         │
   │              ├─ vg-root   ext4   →  /                                  │
   │              └─ vg-swap   swap                                         │
   └────────────────────────────────────────────────────────────────────────┘
                                 ▲
              THE PASSPHRASE PROMPT COMES FROM HERE ──┘
              — from /init in the initramfs (§34.3 step 5),
                which lives in the UNENCRYPTED /boot
```

```bash
lsblk -f
findmnt /boot /boot/efi -o TARGET,SOURCE,FSTYPE
cat /etc/crypttab
sudo dmsetup ls --tree
```

*(Describing.)* Two design choices in that layout deserve explanation:

**Why is LVM *inside* LUKS rather than LUKS inside LVM?** Because that way there is **one LUKS
container and therefore one passphrase prompt**, and the logical volumes inside inherit the
encryption. Put LUKS on each logical volume instead and you'd type the passphrase once per volume.

**Why is `/boot` unencrypted?** GRUB *can* read LUKS — it has a crypto module. But then you'd type
the passphrase twice (once for GRUB to read the kernel, once for the initramfs to unlock the root),
GRUB's LUKS2 support has historically lagged, and the unlock in GRUB is slow. Debian's guided
install takes the simpler path.

> **Confidence: moderate-high** on this being the guided-install layout; **moderate** on the current
> state of GRUB's LUKS2 support, which has been improving. Your own `lsblk -f` is authoritative.

**`/etc/crypttab`** is the `fstab` of encrypted volumes (Volume 3 §17.5's cousin):

```
# target name         source device              key file    options
nvme0n1p3_crypt       UUID=a1b2c3d4-...          none        luks,discard
```

| Field | Meaning |
|---|---|
| target name | what appears under `/dev/mapper/` |
| source | the encrypted device, **by UUID** — same reasoning as `fstab` |
| key file | `none` means **prompt interactively**; a path means unlock automatically |
| options | `luks`, `discard`, `tries=`, `keyscript=` |

And `cryptsetup-initramfs` is the package that puts `cryptsetup` *into* the initramfs so any of this
can happen at all:

```bash
dpkg -l cryptsetup-initramfs 2>/dev/null | tail -1
sudo lsinitramfs /boot/initrd.img-$(uname -r) 2>/dev/null | grep -iE 'cryptsetup|crypttab' | head
```

## 35.6 Read your own header

```bash
sudo cryptsetup luksDump /dev/nvme0n1p3
```

*(Describing. **Confidence: high** on the shape of the output.)*

```
LUKS header information
Version:        2
Epoch:          4
Metadata area:  16384 [bytes]
Keyslots area:  16744448 [bytes]
UUID:           a1b2c3d4-e5f6-...

Data segments:
  0: crypt
	offset: 16777216 [bytes]
	length: (whole device)
	cipher: aes-xts-plain64
	sector: 512 [bytes]

Keyslots:
  0: luks2
	Key:        512 bits
	Priority:   normal
	Cipher:     aes-xts-plain64
	PBKDF:      argon2id
	Time cost:  7
	Memory:     1048576
	Threads:    4
	Salt:       3f 2a ...
```

What to read out of it:

| Field | Meaning |
|---|---|
| **`Version: 2`** | LUKS2 — JSON metadata, more keyslots, Argon2 |
| **`cipher: aes-xts-plain64`** | AES in **XTS** mode, with a sector-number-derived tweak |
| **`Key: 512 bits`** | XTS uses **two** 256-bit keys, so "512" here means AES-256 |
| **`PBKDF: argon2id`** | §35.4 |
| **`Memory: 1048576`** | **1 GiB per guess** — this is the number the attacker has to multiply |
| `Keyslots` | how many passphrases exist; empty slots aren't listed |

**Why XTS?** Disk encryption has a hard constraint: **you cannot expand the data.** A 512-byte sector
must encrypt to 512 bytes — there is nowhere to put a nonce or an authentication tag. XTS is a
*tweakable* block cipher mode where the sector number acts as the tweak, so identical plaintext in
two different sectors produces different ciphertext, with no expansion.

> **And here's the honest limitation that most explanations of FDE omit: XTS provides
> confidentiality but *not integrity*.** An attacker who can write to your encrypted disk can flip
> ciphertext bits. They can't produce *chosen* plaintext, but they can produce *garbage* plaintext,
> **and nothing detects it.** There is no MAC, because there is no room for one.
>
> If you need integrity you need `dm-integrity` underneath, or LUKS2 with an authenticated
> encryption mode — neither of which is the default, both of which cost space and performance.
>
> **Confidence: high** that XTS lacks integrity protection and that this is a known, accepted
> trade-off in disk encryption.

```bash
sudo cryptsetup status nvme0n1p3_crypt
sudo dmsetup table --showkeys 2>/dev/null | head -2   # ← shows the MASTER KEY. Be careful.
```

That last command prints the master key in hex, out of kernel memory, to your terminal. It's a
legitimate diagnostic and it's also a good demonstration of §35.7's first point.

## 35.7 What full-disk encryption does *not* protect against

This is the section that matters most, because the failure mode of FDE is **believing it covers more
than it does.**

| Threat | Protected? | Why |
|---|---|---|
| **Stolen powered-off laptop** | **YES** | this is the design case |
| Disposed or RMA'd drive | **YES** | |
| Seized machine, powered off | **YES** | |
| **Running system, attacker gets root** | **NO** | the master key is in kernel memory; the disk reads normally |
| **Suspend to RAM (sleep)** | **NO** | key still in RAM. A sleeping laptop is an unlocked laptop |
| **Hibernate, if swap is unencrypted** | **NO — catastrophically** | RAM, *including the master key*, is written to swap |
| **Cold boot attack** | mostly no | DRAM retains contents for seconds after power loss, longer if chilled |
| **Evil maid** | **NO** | §35.5's unencrypted `/boot` can be modified |
| Malicious firmware / hardware implant | no | below your trust boundary entirely |

Three of those deserve expansion.

**Hibernate and swap.** Hibernation writes the entire contents of RAM to swap — and the LUKS master
key is in RAM. If swap is not inside the encrypted container, **hibernating writes your master key to
unencrypted disk.** Debian's guided encrypted install puts swap inside the LUKS volume for exactly
this reason. Check yours:

```bash
swapon --show
lsblk -f | grep -i swap
# is the swap device inside /dev/mapper/ (encrypted) or a bare partition?
```

**Cold boot attacks.** DRAM does not lose its contents instantly when power is removed — it decays
over seconds, and much more slowly if cooled. Halderman and colleagues demonstrated recovering
encryption keys from RAM this way ("Lest We Remember: Cold Boot Attacks on Encryption Keys", 2008).
Which is why "locked screen" and "powered off" are genuinely different security states.

> **Confidence: high** on the paper and the phenomenon.

**The evil maid attack.** Named by Joanna Rutkowska in 2009, and it follows directly from §35.5:

```
   Your /boot and ESP are UNENCRYPTED and UNAUTHENTICATED.

   1. Attacker has your laptop for ten minutes while you're at breakfast
   2. They replace initrd.img with one that looks and behaves identically,
      except it also writes your passphrase somewhere
   3. You return, boot, type the passphrase, work normally. Nothing is wrong.
   4. They come back later and collect it
```

> **Confidence: high** on the attack's name, Rutkowska, and the mechanism.

**The mitigations, and their limits:**

| Mitigation | What it gives you |
|---|---|
| **Secure Boot** (§32.6) | the bootloader and kernel are signature-verified — but **`grub.cfg` and the initramfs are not signed by default**, which is exactly BootHole's lesson (§33.8) |
| **Encrypted `/boot`** | removes the initramfs from the attacker's reach; costs a second passphrase prompt |
| **TPM measured boot + sealing** | the TPM releases the key **only if** the boot chain's measurements match. Tampering changes a measurement, and the key is simply not released |
| Keep the machine with you | unfashionable and highly effective |

TPM sealing is the genuinely strong answer, and `systemd-cryptenroll` makes it accessible:

```bash
ls /dev/tpm* /sys/class/tpm/ 2>/dev/null
sudo systemd-cryptenroll --tpm2-device=list 2>/dev/null
```

> **But note the trade it makes.** Sealing to the TPM means you no longer type a passphrase — the
> machine unlocks itself when the boot chain is intact. Which is excellent against evil maid and
> **useless against theft of a machine that boots**, because the thief just powers it on. TPM
> unlocking without a PIN converts FDE from "protects against theft" to "protects against
> tampering," and those are different goals. Choose deliberately.

---

# Chapter 36 — systemd: The Problem It Was Built to Solve

## 36.1 The hook

> **SysVinit booted Unix machines for roughly thirty years. It is simple, it is shell scripts, and
> everybody understood it.**
>
> **In about four years, essentially every major Linux distribution replaced it — over loud
> objection.**
>
> **What was actually wrong with it? Not "it was old." What specifically failed?**

## 36.2 THE PROBLEM: five concrete failures

SysVinit's model was:

```
   /etc/inittab              defines runlevels
   /etc/init.d/apache2       a shell script taking start|stop|restart|status
   /etc/rc2.d/S20apache2  →  ../init.d/apache2      a SYMLINK, named for ORDER
   /etc/rc2.d/K20apache2  →  ../init.d/apache2      the Kill link for shutdown
```

At boot, `rc` ran every `S*` link in the current runlevel's directory **in lexical order, one at a
time, waiting for each to finish**.

You may still have the remnants:

```bash
ls /etc/init.d/ 2>/dev/null
ls /etc/rc2.d/ 2>/dev/null
runlevel 2>/dev/null
```

> **A Debian-specific note on runlevels:** Red Hat used runlevel 3 for multi-user text and 5 for
> graphical. **Debian traditionally used runlevel 2 as its default and made 2 through 5 identical**,
> configuring the display manager separately. So cross-distribution runlevel advice has always been
> wrong on Debian. **Confidence: moderate-high.**

Here is what actually broke.

### Failure 1 — strictly sequential, and mostly *waiting*

Sixty init scripts, run one after another. But look at what each one spends its time on:

| Script does | Time | CPU busy? |
|---|---|---|
| start a daemon | 20 ms | briefly |
| **wait for the network interface to get a DHCP lease** | **2–5 s** | **no** |
| **wait for a daemon to write its PID file** | **0.5 s** | **no** |
| **wait for a disk to be ready** | **1 s** | **no** |

**Most of a SysVinit boot is one CPU core idling while a single script blocks.** The other cores do
nothing. Twelve seconds of boot time might contain half a second of computation.

### Failure 2 — ordering encoded in filenames

`S20apache2` means "twentieth." Insert something between 20 and 21 and you renumber. Debian
mitigated this properly with **`insserv`** and **LSB dependency headers** — the block at the top of
every init script:

```bash
head -12 /etc/init.d/* 2>/dev/null | head -20
```

```
### BEGIN INIT INFO
# Provides:          apache2
# Required-Start:    $local_fs $remote_fs $network
# Required-Stop:     $local_fs $remote_fs $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
### END INIT INFO
```

That is a **declared dependency graph**, and `insserv` computed the `S##` numbers from it. Debian
solved the *authoring* problem years before systemd. **But the runtime was still sequential** —
knowing the correct order doesn't help if you can only do one thing at a time.

> **Worth being fair about: Debian had already done real work here.** `insserv`, LSB headers, and
> `startpar` (which ran independent scripts concurrently) meant Debian's SysVinit was considerably
> better than the caricature. The remaining failures are the ones that couldn't be fixed by bolting
> more on.

### Failure 3 — PID files, and Volume 2's debt comes due

This is the strongest technical failure, and Volume 2 §12.2 set it up.

A daemon starts, **double-forks** to detach from the terminal, and writes its final PID to
`/run/apache2.pid`. Init reads that file to manage it.

```bash
ls /run/*.pid 2>/dev/null | head
```

Volume 2 §12.2 established, and verified, that **`pid_max` is 32768** and PIDs are reused. So:

```
   1. apache2 starts, PID 4021, writes /run/apache2.pid containing "4021"
   2. the machine crashes.  The PID FILE SURVIVES on disk.
   3. reboot.  PIDs are allocated from 1 again.
   4. eventually some unrelated process — your text editor — is assigned PID 4021
   5. you run:  /etc/init.d/apache2 stop
   6. init reads the stale PID file, gets 4021, and SIGTERMs YOUR EDITOR
```

**And there is no reliable fix**, because there's no way to ask "is PID 4021 the process that wrote
this file?" A creation timestamp comparison is a heuristic, not an answer.

It gets worse for daemons that fork children:

```
   init knows ONE PID — the one in the file.
   The daemon's twelve worker processes are invisible to init.
   `stop` kills the parent.  The twelve workers keep running, orphaned,
   reparented to PID 1 (Volume 2 §12.5), still holding the port.
   Then `start` fails because the port is in use.
```

**Every experienced Linux administrator has debugged that.** It is not a rare edge case; it is the
normal failure mode of PID-file supervision.

### Failure 4 — no way to say "start when needed"

Every service that might conceivably be used had to start at boot, because there was no mechanism
for lazy activation. A machine with a rarely-used CUPS printing daemon paid its startup cost on every
single boot.

### Failure 5 — every script reimplemented everything

Start, stop, restart, reload, status, PID file handling, privilege dropping, output redirection,
`nice` levels, `ulimit`s — **50 to 200 lines of shell per service**, written independently, behaving
subtly differently. Debian shipped `start-stop-daemon` to factor out the worst of it, which helped
and did not solve it.

```bash
wc -l /etc/init.d/* 2>/dev/null | tail -5
```

## 36.3 THE MECHANISM: five answers

| Failure | systemd's answer |
|---|---|
| 1. sequential | **dependency graph + aggressive parallelism** |
| 2. filename ordering | declared `Before=`/`After=`, order computed |
| 3. **PID files** | **cgroups** — §36.5 |
| 4. no lazy start | **socket activation** — §36.4 |
| 5. shell boilerplate | **declarative unit files** — 10 lines of ini |

### Parallelism

systemd builds a directed graph of units and dependencies, then starts everything whose
prerequisites are met — **concurrently**. Instead of 60 scripts × mostly-waiting, you get 60 units
starting as soon as each becomes eligible, with the CPU and the I/O queue actually saturated.

Measure your own:

```bash
systemd-analyze
systemd-analyze blame | head -15
systemd-analyze critical-chain
```

*(Describing.)*

```
Startup finished in 3.107s (firmware) + 2.891s (loader) + 1.204s (kernel)
                    + 2.847s (userspace) = 10.051s
graphical.target reached after 2.834s in userspace
```

> **`systemd-analyze blame` and `critical-chain` answer different questions**, and the difference is
> the whole point of the parallelism:
>
> - **`blame`** sorts units by **how long each took**. A unit taking 8 seconds looks terrible.
> - **`critical-chain`** shows the **longest dependency path** — the chain that actually determined
>   your boot time.
>
> **A slow unit that nothing waits for costs you nothing.** Optimising the top of `blame` is often
> pointless; optimising `critical-chain` is what shortens the boot.

### Declarative units

Compare Failure 5's 150 lines of shell with:

```ini
[Unit]
Description=A demonstration service
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mydaemon --foreground
Restart=on-failure
User=mydaemon

[Install]
WantedBy=multi-user.target
```

Nine meaningful lines, and you get start, stop, restart, status, automatic restart on failure,
privilege dropping, and log capture — **none of which you wrote.**

**And you can validate a unit file without a running systemd** *(verified — this genuinely works
offline)*:

```bash
mkdir -p /tmp/units
cat > /tmp/units/demo.service <<'EOF'
[Unit]
Description=A demonstration service
After=network.target
Wants=network.target
[Service]
Type=simple
ExecStart=/bin/sleep 3600
[Install]
WantedBy=multi-user.target
EOF
systemd-analyze verify /tmp/units/demo.service && echo "  valid (no output = no problems)"

cat > /tmp/units/bad.service <<'EOF'
[Unit]
Description=Broken
[Service]
Type=nonsense
ExecStart=/bin/true
EOF
systemd-analyze verify /tmp/units/bad.service
rm -rf /tmp/units
```

```
  valid (no output = no problems)
/tmp/units/bad.service:4: Failed to parse service type, ignoring: nonsense
```

*(Both verified.)* This is `visudo` for units (Volume 2 §11.5), `sshd -t` for units (Volume 5
§30.9), `findmnt --verify` for units (Volume 3 §17.5). **Same lesson, fourth mechanism: validate
before you activate.**

## 36.4 Socket activation — Volume 5's debt

Volume 5 §29.3 called this "the elegant one" and deferred. Here it is.

> **systemd creates the listening socket itself, at boot, before the service starts.** Then it either
> starts the service immediately and hands over the file descriptor, or waits until a client
> connects and starts it then.

```bash
systemctl list-units --type=socket
systemctl cat ssh.socket 2>/dev/null
```

```ini
[Socket]
ListenStream=22
Accept=no

[Install]
WantedBy=sockets.target
```

**Two consequences, and the first is deeper than it looks.**

**Consequence 1 — ordering between services largely stops mattering.**

```
   Service A talks to service B over a socket.

   WITHOUT socket activation:
      A must not start until B is listening
      → you must DECLARE that dependency
      → and B's startup blocks A's
      → and if you get the declaration wrong, you get a race that
        manifests once a month on a slow disk

   WITH socket activation:
      systemd creates B's socket FIRST, before either service runs
      → A connects immediately, whenever it likes
      → the connection sits in the ACCEPT QUEUE (Volume 5 §29.2)
      → B starts whenever it gets round to it, inherits the socket,
        and finds A's connection already waiting
      → NO ORDERING DEPENDENCY IS NEEDED AT ALL
```

**The accept queue absorbs the race.** That's the trick — and it's the single largest source of
systemd's parallelism, because it removes dependencies rather than merely satisfying them faster.

**Consequence 2 — the privileged bind moves out of the service.**

Volume 5 §29.3 showed that binding port 80 requires root or `CAP_NET_BIND_SERVICE`. With socket
activation:

```
   PID 1 (root) calls socket() + bind(80) + listen()      ← the privileged part
        │
        │  fork(), setuid(www-data), execve()
        │  ↑ the file descriptor SURVIVES execve  (Volume 1 §2.7)
        ▼
   the service starts as an UNPRIVILEGED USER,
   already holding a listening socket on port 80,
   and never had any privilege at all
```

> **That is Volume 1 §2.7's "what survives exec" table doing real security work.** Open file
> descriptors survive `execve()`; privileges are dropped before it. So the capability to bind a
> privileged port is exercised once, by PID 1, and the *result* — not the *permission* — is what the
> service receives.

```bash
systemctl show ssh.socket -p Listen -p Accept 2>/dev/null
sudo ss -tlnp | grep -i systemd 2>/dev/null
```

## 36.5 cgroups — and Volume 2's PID-reuse debt, finally paid

§36.2's Failure 3 is the one that couldn't be patched. systemd's answer doesn't improve PID-file
handling; it **eliminates the concept**.

> **Every service gets its own control group. Every process it forks inherits that cgroup and cannot
> escape it** — however many times it double-forks, whatever it does with `setsid()`.

Which turns three unanswerable questions into lookups:

| Question | SysVinit | systemd |
|---|---|---|
| Is the service running? | read a PID file, hope | **does its cgroup contain processes?** |
| What processes belong to it? | **unanswerable** | **list the cgroup** |
| How do I stop all of it? | kill the PID in the file and pray | **signal every process in the cgroup** |
| Does PID reuse matter? | **yes, dangerously** | **no. Tracking is by cgroup membership.** |

See it:

```bash
systemd-cgls
systemd-cgls /system.slice 2>/dev/null | head -20
systemctl status ssh 2>/dev/null
```

*(Describing.)* `systemctl status` shows the cgroup and **every process in it**:

```
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled)
     Active: active (running) since Wed 2026-09-10 09:12:03 UTC; 4h ago
   Main PID: 812 (sshd)
      Tasks: 3 (limit: 9403)
     Memory: 5.2M
        CPU: 214ms
     CGroup: /system.slice/ssh.service
             ├─812 sshd: /usr/sbin/sshd -D [listener]
             ├─4127 sshd: vishal [priv]
             └─4139 sshd: vishal@pts/0
```

**`Tasks: 3` and three processes listed.** No PID file was consulted. And `systemctl stop ssh` will
signal all three — there is no orphan case.

The same mechanism gives resource control for free, because that's what cgroups were built for:

```bash
systemd-cgtop 2>/dev/null            # like top, but per-service
systemctl show ssh -p MemoryMax -p CPUQuota -p TasksMax 2>/dev/null
```

```ini
[Service]
MemoryMax=512M
CPUQuota=50%
TasksMax=100
```

> **This is the argument that won**, and it's worth saying plainly: even people who dislike systemd
> for other reasons generally concede the cgroup-based supervision point. It solved a real,
> longstanding, unfixable-in-place problem — and Volume 2 §12.2's PID-reuse hazard, which I flagged
> there as "a real hazard," is simply not a hazard for systemd-managed services.

Volume 8 covers cgroups properly, since they're also what containers are built from.

## 36.6 Units, and the mistake everybody makes once

```bash
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service | head -20
systemctl cat ssh.service 2>/dev/null
systemctl show ssh.service 2>/dev/null | head -30
```

Unit types:

| Suffix | Manages |
|---|---|
| `.service` | a process |
| `.socket` | a listening socket (§36.4) |
| **`.target`** | **a synchronisation point** — replaces runlevels |
| `.mount` / `.automount` | a mount point; **generated from `/etc/fstab`** |
| `.timer` | scheduled activation — Volume 7's cron replacement |
| `.path` | activation on filesystem change |
| `.device` | a device, from udev |
| `.slice` / `.scope` | cgroup hierarchy for resource control |

> **`.mount` units are generated from your `fstab`**, which is a nice illustration of how systemd
> absorbed existing configuration rather than replacing it:
>
> ```bash
> systemctl list-units --type=mount
> systemctl cat -- '-.mount' 2>/dev/null | head -20
> ```

### The Requires/After distinction

```bash
systemctl list-dependencies multi-user.target | head -20
systemctl list-dependencies --reverse ssh.service 2>/dev/null
```

| Directive | Axis | Means |
|---|---|---|
| **`Requires=`** | **whether** | pull it in; **fail if it fails** |
| **`Wants=`** | **whether** | pull it in; **carry on if it fails** |
| `BindsTo=` | whether | stronger — **stop if it stops** |
| **`After=` / `Before=`** | **when** | ordering **only** |
| `Conflicts=` | exclusion | can't both be active |
| `PartOf=` | propagation | stop/restart cascade downward |

> **These two axes are orthogonal, and confusing them is the single most common systemd authoring
> mistake.**
>
> `Requires=postgresql.service` **without** `After=postgresql.service` says: *"start postgres too,
> but I don't care when."* systemd will start them **in parallel** — and your service will try to
> connect to a database that isn't listening yet.
>
> It will work on your laptop, where postgres starts in 200 ms, and fail intermittently on a loaded
> server. **Almost always you want both directives**, and `Wants=` + `After=` is the usual safe
> pairing, since it degrades rather than cascading failures.

### Overriding without editing

```bash
systemctl edit ssh.service              # creates a DROP-IN, doesn't touch the package's file
systemctl cat ssh.service               # shows the package unit AND all drop-ins
ls /etc/systemd/system/*.d/ 2>/dev/null
```

`systemctl edit` writes to `/etc/systemd/system/ssh.service.d/override.conf`. **The package's file
in `/lib/systemd/system/` is never touched**, so upgrades don't conflict.

> **Same pattern, fifth appearance:** `/etc/sudoers.d` (Volume 2 §11.5), `/etc/apt/sources.list.d`
> (Volume 4 §23.7), `/etc/ssh/sshd_config.d` (Volume 5 §30.9), `/etc/grub.d` (§33.4), and now
> `/etc/systemd/system/*.d`. **Debian's answer to "how do I change a package's config without
> fighting the package manager" is always a drop-in directory.**

### Targets replace runlevels

| SysV runlevel | systemd target |
|---|---|
| 0 | `poweroff.target` |
| 1 | `rescue.target` |
| **2–5 (Debian)** | **`multi-user.target`** |
| 5 | `graphical.target` |
| 6 | `reboot.target` |
| — | **`emergency.target`** — more minimal than rescue: root shell, read-only root, almost nothing started |

```bash
systemctl get-default
systemctl list-units --type=target
```

`emergency.target` is the systemd equivalent of §33.5's `init=/bin/bash` trick, and you reach it by
appending `systemd.unit=emergency.target` to the kernel command line at the GRUB menu. Worth knowing
before you need it.

## 36.7 journald

> **THE PROBLEM with text logs.** `/var/log/syslog` is a sequence of lines. To find "all errors from
> `sshd` during the previous boot," you `grep`, then parse timestamps yourself, then work out where
> the previous boot ended — and every program's line format is different.

journald stores **structured records** instead of lines. Each entry is a set of key-value fields, and
much of the metadata is captured by journald rather than supplied by the program:

```bash
journalctl -o json-pretty -n 1
```

*(Describing.)*

```json
{
    "__REALTIME_TIMESTAMP" : "1789025707123456",
    "_BOOT_ID" : "a1b2c3d4e5f6...",
    "_UID" : "0",
    "_PID" : "812",
    "_COMM" : "sshd",
    "_SYSTEMD_UNIT" : "ssh.service",
    "_SYSTEMD_CGROUP" : "/system.slice/ssh.service",
    "PRIORITY" : "6",
    "SYSLOG_IDENTIFIER" : "sshd",
    "MESSAGE" : "Accepted publickey for vishal from 192.0.2.5 port 51234"
}
```

> **Note which fields begin with an underscore.** Those are **trusted** — journald obtained them from
> the kernel via the socket's peer credentials, not from what the program claimed. So `_PID`, `_UID`,
> `_COMM` and `_SYSTEMD_UNIT` cannot be forged by the logging process.
>
> With classic syslog, a program says *"I am sshd"* and syslog writes it down. **With journald, the
> kernel says who the sender is.** That's a genuine security improvement and it's rarely mentioned.
>
> **Confidence: moderate-high** on the peer-credential mechanism.

Which makes queries into queries rather than `grep`:

```bash
journalctl -b                        # this boot
journalctl -b -1                     # PREVIOUS boot — see §36.8's Debian gotcha
journalctl -u ssh --since "1 hour ago"
journalctl -p err -b                 # priority error and above
journalctl -k                         # kernel only — equivalent to dmesg
journalctl _UID=1000                  # everything from your user
journalctl -f                          # follow, like tail -f
journalctl --disk-usage
journalctl --verify
journalctl --list-boots
```

## 36.8 Debian's systemd, specifically — including one real gotcha

> **Confidence: high** on jessie being the switch; **moderate-high** on the journal-persistence
> default.

**Debian 8 (jessie, 2015) made systemd the default init.** The packaging keeps the alternatives real:

```bash
dpkg -l systemd systemd-sysv sysvinit-core 2>/dev/null | tail -4
ls -l /sbin/init
```

| Package | Role |
|---|---|
| `systemd` | the binaries |
| **`systemd-sysv`** | **provides `/sbin/init`** — this is what makes it the init |
| `sysvinit-core` | **still available**; installing it swaps the init back |
| `orphan-sysvinit-scripts` | init scripts for packages that dropped them |

**And your old init scripts still work**, via a generator:

```bash
ls /etc/init.d/ 2>/dev/null
systemctl list-units --type=service | grep -i 'LSB:' 2>/dev/null
systemctl cat <some-lsb-service> 2>/dev/null | head
```

`systemd-sysv-generator` reads `/etc/init.d/*`, parses the **LSB headers from §36.2's Failure 2**,
and synthesises a unit at boot. Debian's decade of LSB dependency annotation turned out to be
exactly the metadata systemd needed.

**Debian also declines several optional systemd components** (Volume 5 §27.4 hit this):

```bash
systemctl is-active systemd-resolved systemd-networkd systemd-timesyncd 2>/dev/null
```

Debian generally leaves these disabled in favour of NetworkManager / `ifupdown` / `ntpsec`, where
Ubuntu enables them. **This is the single largest source of Debian-versus-Ubuntu advice mismatch.**

### The gotcha: your journal is probably not persistent

```bash
ls -ld /var/log/journal 2>/dev/null || echo "  /var/log/journal does NOT exist"
grep -iE '^\s*#?\s*Storage' /etc/systemd/journald.conf
journalctl --list-boots 2>/dev/null | head -3
```

journald's `Storage=` default is **`auto`**, which means: *persist to `/var/log/journal` if that
directory exists; otherwise keep logs only in `/run/log/journal`* — which is a **tmpfs** (Volume 3
§17.6), and therefore **lost at every reboot.**

> **On a default Debian install, `/var/log/journal` does not exist.** So `journalctl -b -1` — "show
> me the previous boot," which is exactly what you want after an unexplained crash — **fails**,
> because there is no previous boot on disk.
>
> **Confidence: moderate-high** on this being Debian's default. Your `ls -ld /var/log/journal` above
> settles it for your machine.

Fix it now, before you need it:

```bash
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
journalctl --list-boots
```

Or explicitly, in `/etc/systemd/journald.conf.d/persistent.conf` — a drop-in, per §36.6:

```ini
[Journal]
Storage=persistent
SystemMaxUse=500M
```

**And note Debian runs `rsyslog` as well**, so you have both:

```bash
systemctl is-active rsyslog 2>/dev/null
ls -l /var/log/syslog /var/log/auth.log 2>/dev/null
```

That's Debian hedging deliberately: journald's structured queries **and** traditional text logs that
`grep`, `logrotate` and every existing tool understand. It costs some disk and it means the "binary
logs" objection (§37.3) largely doesn't bite Debian users.

---

# Chapter 37 — The systemd Argument, Honestly

Volume 4 §20.5 mentioned the 2014 Technical Committee vote and the General Resolutions, and promised
the substance here. This chapter is that promise. It is a genuinely interesting engineering *and*
governance dispute, and it deserves better than either of the two caricatures — "obviously correct
modernisation" and "corporate takeover of Linux."

## 37.1 The timeline

> **Confidence: moderate-high** on the sequence; **moderate** on the vote details, which I flag
> individually.

| When | What |
|---|---|
| **2010** | systemd announced by **Lennart Poettering** and **Kay Sievers**, both then at Red Hat |
| 2011 | **Fedora 15** — first major distribution to adopt it |
| 2012 | **udev is merged into the systemd source tree** — §37.3, objection 3 |
| **Feb 2014** | **Debian's Technical Committee votes for systemd** over upstart for jessie. Reported as **4–4, decided by the chair's casting vote** (Bdale Garbee). *(Confidence: moderate on the exact split.)* |
| **Nov 2014** | **General Resolution on "init system coupling"**, proposed by Ian Jackson — asking whether Debian should *require* packages to work without systemd. **"Further discussion" won**, so the GR did not pass and the TC decision stood. *(Confidence: moderate.)* |
| 2014 | **Ian Jackson resigns from the Technical Committee.** *(Confidence: moderate-high.)* |
| 2014–15 | **Devuan** forks from Debian, specifically to be systemd-free |
| 2015 | **Debian 8 (jessie)** ships with systemd as default |
| **Dec 2019** | Second GR, on **"init system diversity."** Several options; the winning position was roughly *"systemd is the default, and we support exploring alternatives."* *(Confidence: moderate — I would check the Debian vote page before quoting the option letter or exact wording.)* |

```bash
apt show debian-policy 2>/dev/null | head -5
# and the votes themselves are public record at www.debian.org/vote/
```

**Two things about that timeline are worth noticing before the arguments.**

First: **the process worked as designed.** A dispute went to the Technical Committee, the TC decided,
the decision was appealed via General Resolution as the Constitution permits, the GR failed, and the
decision stood. Volume 4 §20.5's governance machinery, exercised on the hardest question the project
had faced. You can read every ballot.

Second: **it was close.** A 4–4 tie broken by a casting vote is not a mandate. Anyone describing this
as an obvious decision that only cranks opposed is misrepresenting the record.

## 37.2 What both sides agreed on

It's easy to forget that §36.2's failures were not in dispute. Essentially nobody defended:

- PID-file supervision (Failure 3)
- serial startup dominated by waiting (Failure 1)
- 150 lines of bash per service (Failure 5)

**The argument was never "SysVinit is fine."** It was about whether systemd's *particular* answer —
its scope, its coupling, and its governance — was the right price for fixing them.

## 37.3 The objections, steelmanned

I'm going to state each as strongly as I can, then respond, then give my honest read. Some of them
are much better than others and I'll say which.

### Objection 1 — Scope, and the coupling that follows

**The case.** systemd did not stay an init system. Over a decade it absorbed:

| Function | Component |
|---|---|
| init and service supervision | `systemd` |
| logging | `journald` |
| **device management** | **`udev`** |
| login and session management | `logind` |
| DNS resolution | `resolved` |
| time synchronisation | `timesyncd` |
| network configuration | `networkd` |
| containers | `nspawn` |
| boot loading | `systemd-boot` |
| scheduled jobs | `.timer` units |
| home directories | `homed` |

**The objection is not "these are bad."** It's that **one project, with one upstream, one release
cadence and one set of maintainers, now controls a large fraction of the base system** — and that the
components increasingly assume each other's presence. Downstream distributions and alternative
implementations progressively lose the ability to choose per-component.

**The response.** They are separate binaries, most are optional, and Debian demonstrably ships
without `resolved`, `networkd` and `timesyncd` (§36.8, verified by the `is-active` check). Shared
code and shared interfaces reduce duplication and bugs.

**My honest read: the response is factually correct and does not answer the objection.** The
objection is about *governance and coupling trajectory over time*; the response is about *the current
binary layout*. Both statements are true and they're about different things. Ten years on, Debian
does still ship without half of it — which is evidence for the response — while writing software that
works on both systemd and non-systemd systems has become genuinely unusual — which is evidence for
the objection.

### Objection 2 — "Do one thing well"

**The case.** systemd violates the Unix philosophy of small composable tools.

**The response.** The Unix philosophy is about composable *tools operating on streams*. An init
system is not a tool — it is a **supervisor with irreducibly global state**, which is exactly the
category the philosophy doesn't cover. And the argument proves far too much: `sendmail`, X11,
`bash`, and the Linux kernel itself were never "one thing well."

**My honest read: this is the weakest of the objections**, and I think it should be retired. It's an
aesthetic preference presented as a technical principle, and when pressed it usually turns into
Objection 1 or 3, both of which are better arguments. I'd rather say that than pretend all six are
equally strong.

### Objection 3 — udev, and this one is strong

**The case.** `udev` was an independent project used by everyone. Around 2012 it was **merged into
the systemd source tree** and became progressively harder to build standalone. Distributions that
didn't want systemd had no choice but to **fork it** — which Gentoo did, producing **eudev**.

**This is a concrete, documented case of coupling removing someone else's options**, with a real fork
as the evidence. It isn't a prediction; it happened.

**The response.** Sharing code between udev and systemd genuinely reduced duplication, and the
maintainers were under no obligation to support a standalone build they didn't use.

**My honest read: the objection is largely correct.** It's the strongest concrete instance of
Objection 1, and "we weren't obliged to" is an accurate statement about obligations that concedes
the substance. **Confidence: high** that udev was absorbed and that eudev exists as a consequence.

### Objection 4 — Binary logs

**The case.** journald's format is binary. You cannot `grep` a journal file, you cannot `tail` it
with standard tools, and corruption can render a segment unreadable rather than partially readable.
Thirty years of log-processing tooling stops applying.

**The response.** The format is documented, `journalctl` provides indexed structured queries that
`grep` cannot (§36.7), the trusted `_`-prefixed fields are a real security gain, and journald can
forward everything to syslog.

**My honest read: the complaint is real and, on Debian specifically, largely defused** — because
Debian runs `rsyslog` alongside journald by default (§36.8, verified), so `/var/log/syslog` still
exists and every traditional tool still works. Debian hedged, and the hedge worked. On a
distribution that ships journald alone, the objection has more force.

### Objection 5 — PID 1 is much larger now

**The case.** More code in PID 1 means more attack surface and more ways to make a system
unrecoverable, because **a crash in PID 1 is a kernel panic.** systemd's PID 1 is vastly larger than
SysVinit's.

And there are concrete instances. **CVE-2021-33910** (Qualys, July 2021) was a stack exhaustion in
systemd's unit-name escaping, reachable via a very long mount point path, which **crashed PID 1 and
therefore panicked the kernel** — a local denial of service.

> **Confidence: moderate-high** on that CVE and its mechanism.

**The response.** A great deal of the functionality lives in helper daemons, not PID 1. And
SysVinit's tiny PID 1 did not prevent init *scripts* — running as root, in shell — from being a
substantial security surface.

**My honest read: real, and partially mitigated.** PID 1 is still much bigger than it was, the
consequences of a bug in it are still worse than for any other process, and there have been real
CVEs. The counter-argument is fair but doesn't make the concern go away.

### Objection 6 — How the disagreement was conducted

**The case.** systemd's upstream acquired a reputation for dismissiveness toward bug reports and
downstream concerns. That's a social objection rather than a technical one, but it materially
affected how the project was received, and it made some distributions' maintainers reluctant to
depend on it.

**And the necessary other half**, which any honest account has to include: **the systemd developers
received an extraordinary volume of abuse over this, including death threats.** Poettering has
written publicly about it.

**My honest read: both things are true, and reporting only one is dishonest.** A technical dispute
became genuinely toxic, in both directions, and that poisoned the discussion for years. It also means
a lot of what was written about systemd between 2012 and 2016 is worthless as technical analysis and
should be read with that in mind — including some of the material still circulating today.

## 37.4 What actually happened

Ten years on, the record is clear enough to check the predictions.

**systemd won essentially universally.** Debian, Ubuntu, Fedora, RHEL, SUSE, Arch, openSUSE. The
holdouts are deliberate — Devuan, Alpine (which uses OpenRC and musl), Gentoo (which offers both),
and Void.

```bash
ps -p 1 -o comm=
```

**What the critics got right:**

- **Coupling increased.** Writing software that works on both systemd and non-systemd systems is now
  a specialist activity. Some software hard-depends on systemd interfaces.
- **udev really did have to be forked** (Objection 3).
- **PID 1 bugs really did panic kernels** (Objection 5).
- **The scope really did keep expanding** — `homed` and `systemd-boot` came *after* the 2014
  argument, so "it will keep absorbing things" was a correct prediction rather than a slur.

**What the critics got wrong:**

- **Debian did not become unusable without systemd.** Devuan works. `sysvinit-core` is still
  installable (§36.8, verified in the packaging).
- **The predicted catastrophic instability didn't arrive.** systemd is, on the whole, reliable.
- Debian **did** retain per-component choice for the optional daemons, and still exercises it
  (§36.8's `is-active` check).

**What the advocates got right:**

- **Boot times improved dramatically**, and `systemd-analyze critical-chain` (§36.3) makes the
  remaining cost measurable rather than mysterious.
- **The cgroup supervision argument was correct and is now uncontroversial** (§36.5). This is the
  strongest vindication: it solved a real problem that had no in-place fix, and Volume 2 §12.2's
  PID-reuse hazard is simply gone for managed services.
- **Declarative units are better than 150 lines of bash.** Almost nobody disputes this any more.
- **Socket activation was genuinely novel** in mainstream Linux (§36.4) and removes dependencies
  rather than merely satisfying them.

## 37.5 An honest assessment

> **The core engineering was good and has been vindicated. The coupling and governance concerns were
> also partly vindicated. And the two are not in tension — they were never the same claim.**

If I had to compress it:

| Claim | Verdict |
|---|---|
| SysVinit's failures were real and unfixable in place | **yes** — §36.2 |
| cgroup supervision was the right answer | **yes, decisively** |
| Socket activation was a genuine advance | **yes** |
| Declarative units beat shell scripts | **yes** |
| The scope would keep expanding | **the critics were right** |
| Coupling would reduce others' options | **partly right** — udev is the proof |
| PID 1 growth carries real risk | **yes** — with real CVEs |
| "It violates the Unix philosophy" | **the weakest argument**, and it should be retired |
| Debian would become unable to run without it | **no** |
| The discussion was conducted badly | **yes, by both sides** |

And the meta-point, which is the reason this chapter exists:

> **The best criticisms of systemd were never about whether its core design was good. They were
> about *scope*, *coupling* and *governance* — questions about who controls what, over what
> timescale, with what obligations to downstream.** Those are legitimate engineering questions, they
> were largely drowned out by the worse arguments, and they remain open.
>
> Which is also why Debian's answer — **adopt the core, decline the optional components, keep the
> alternative installable, and vote on it in public** — looks better in hindsight than either the
> maximalist or the rejectionist position. Volume 4 §20.5's governance machinery is what made that
> nuanced answer *expressible* at all.

---

# TRY THIS ON YOUR MACHINE

Six things that make the boot process visible. Two are verified; the rest need hardware my test box
doesn't have, and are marked. **Nothing here changes your configuration** except item 6's optional
journal fix, which is reversible.

---

## 1. Find out what's actually slowing your boot — and what isn't

**Needs:** a running systemd. *(Describing.)*

```bash
systemd-analyze
echo "=== which units took longest (may be IRRELEVANT) ==="
systemd-analyze blame | head -15
echo "=== which units actually DETERMINED the boot time ==="
systemd-analyze critical-chain
echo "=== a picture of it ==="
systemd-analyze plot > /tmp/boot.svg && echo "open /tmp/boot.svg"
```

**What you should see:** `blame` sorted by duration; `critical-chain` showing a dependency path with
cumulative `@` times and per-unit `+` times.

**Why it's interesting:** these two answer *different* questions and confusing them wastes hours. A
unit at the top of `blame` that nothing waits for **costs you nothing** — it finishes in parallel with
everything else. The boot time is the length of the **critical chain**, and that's the only list worth
optimising. It's the clearest possible demonstration that §36.3's parallelism is real: the slowest
unit and the boot time are only loosely related.

---

## 2. Decode your own kernel command line

**Needs:** nothing. *(Verified — I read a real `/proc/cmdline`.)*

```bash
cat /proc/cmdline | tr ' ' '\n' | nl
echo; echo "=== what each one means ==="
for p in $(cat /proc/cmdline); do
  case "${p%%=*}" in
    BOOT_IMAGE) echo "  $p    ← which kernel GRUB loaded" ;;
    root)       echo "  $p    ← the real root fs (Volume 3 §17.5's UUID)" ;;
    ro)         echo "  $p    ← mount root read-only first, remount rw after fsck" ;;
    quiet)      echo "  $p    ← suppress kernel messages (journalctl -k has them)" ;;
    splash)     echo "  $p    ← graphical boot splash" ;;
    rdinit)     echo "  $p    ← init INSIDE the initramfs (§34.4) — no switch_root" ;;
    init)       echo "  $p    ← init on the REAL root, after switch_root" ;;
    *)          echo "  $p" ;;
  esac
done
echo; echo "=== and the crypto/root devices it implies ==="
lsblk -f 2>/dev/null | head
```

**What you should see:** `BOOT_IMAGE`, `root=UUID=…`, `ro`, and probably `quiet splash`.

**Why it's interesting:** this is the **complete handoff** from bootloader to kernel — everything
GRUB told the kernel, preserved and readable after the fact. It's also the first thing to check when
a machine boots wrong, because it tells you whether GRUB passed what you thought it passed. And if
you see `rdinit=` rather than `init=`, you're on a machine that never leaves the initramfs — §34.4's
distinction, live.

---

## 3. Unpack your initramfs and find the driver that mounts your root

**Needs:** `initramfs-tools` (present by default). *(Describing — no `cpio` or `unmkinitramfs` on my
test box.)*

```bash
mkdir -p /tmp/ird && cd /tmp/ird
sudo unmkinitramfs /boot/initrd.img-$(uname -r) .
ls

echo "=== the script the kernel executes as PID 1 ==="
head -30 main/init

echo "=== which modules made the cut? ==="
find main/lib/modules -name '*.ko*' | wc -l
find main/lib/modules -name '*.ko*' | sed 's|.*/||' | sort | head -20
echo "  ...compare with the full set on disk:"
find /lib/modules/$(uname -r) -name '*.ko*' | wc -l

echo "=== the hook stages (§34.5) ==="
ls main/scripts/

echo "=== is cryptsetup in there? ==="
ls main/cryptroot/ main/sbin/cryptsetup 2>/dev/null

echo "=== and the microcode that has to load first ==="
ls early/kernel/x86/microcode/ 2>/dev/null

cd /tmp && rm -rf /tmp/ird
```

**What you should see:** an `early/` directory with CPU microcode and a `main/` directory containing
a small root filesystem — a readable `/init` shell script, a few dozen modules out of the several
thousand on disk, and `scripts/local-top/` containing the LUKS unlock logic.

**Why it's interesting:** you are looking at **the entire operating system that runs before your
operating system.** The `/init` script is readable shell. And counting the modules makes §34.6's
`MODULES=most` concrete — Debian includes enough storage drivers that this image would boot on
hardware you don't own, which is why it's a few megabytes rather than a few hundred kilobytes.

---

## 4. Read your LUKS header and compute your attacker's cost

**Needs:** `cryptsetup-bin`, and an encrypted volume. *(The KDF timing is verified; `luksDump` is
described.)*

```bash
lsblk -f | grep -i crypt
DEV=$(lsblk -nlo NAME,FSTYPE | awk '$2=="crypto_LUKS"{print "/dev/"$1; exit}')
echo "encrypted device: $DEV"
sudo cryptsetup luksDump "$DEV"

echo; echo "=== how expensive is ONE guess for an attacker? ==="
python3 -c "
import time, hashlib
pw, salt = b'test', b'0'*16
t=time.time(); hashlib.pbkdf2_hmac('sha256', pw, salt, 1000000); e=time.time()-t
print(f'  this CPU: {int(1000000/e):,} PBKDF2 iterations/second')
print(f'  PBKDF2 needs ~0 memory  -> a 4096-core GPU parallelises it ~4096x')
print(f'  Argon2id with Memory: 1048576 KiB needs 1 GiB PER GUESS')
print(f'  -> 4096 parallel guesses would need 4 TiB of RAM. GPUs do not have that.')"

echo; echo "=== BACK UP THE HEADER — without it, the data is gone forever ==="
echo "  sudo cryptsetup luksHeaderBackup $DEV --header-backup-file ~/luks-header.img"
echo "  (then store it OFF this disk; it is as sensitive as the disk itself)"
```

**What you should see:** `Version: 2`, `cipher: aes-xts-plain64`, `PBKDF: argon2id`, and a `Memory:`
figure around 1048576 (1 GiB).

**Why it's interesting:** that `Memory:` number is **literally the attacker's cost multiplier**, and
the point of §35.4 is visible in one line of the dump. It also makes the header's fragility concrete:
everything protecting your data is in those few kilobytes, the master key exists nowhere else, and
**knowing your passphrase will not save you if the header is destroyed.** Take the backup.

---

## 5. Write a systemd unit and validate it without installing it

**Needs:** systemd installed (it doesn't need to be *running*). *(Fully verified — this works
offline.)*

```bash
mkdir -p /tmp/units
cat > /tmp/units/demo.service <<'EOF'
[Unit]
Description=A demonstration service
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/bin/sleep 3600
Restart=on-failure
User=nobody
MemoryMax=64M

[Install]
WantedBy=multi-user.target
EOF
systemd-analyze verify /tmp/units/demo.service && echo "  ✓ valid — no output means no problems"

echo; echo "=== now break it three different ways ==="
sed 's/Type=simple/Type=nonsense/' /tmp/units/demo.service > /tmp/units/bad1.service
systemd-analyze verify /tmp/units/bad1.service

sed 's|ExecStart=/bin/sleep 3600|ExecStart=/does/not/exist|' /tmp/units/demo.service > /tmp/units/bad2.service
systemd-analyze verify /tmp/units/bad2.service

printf '[Unit]\nDescription=No service section\n' > /tmp/units/bad3.service
systemd-analyze verify /tmp/units/bad3.service

rm -rf /tmp/units
```

**What you should see** *(the first two are my verified output)*: silence for the valid unit, and
`Failed to parse service type, ignoring: nonsense` for the first broken one. The others should flag
the missing executable and the missing `[Service]` section.

**Why it's interesting:** nine meaningful lines gave you start, stop, status, automatic restart,
privilege dropping to `nobody`, a 64 MB memory cap, and log capture — replacing §36.2 Failure 5's 150
lines of bash. And **`systemd-analyze verify` is the fourth "check before you activate" tool in this
book**, after `visudo` (Volume 2 §11.5), `findmnt --verify` (Volume 3 §17.5) and `sshd -t` (Volume 5
§30.9). Debian gives you one of these for every config file that can lock you out. Use them.

---

## 6. Debian-specific: is your journal even persistent?

**Needs:** `sudo` for the fix. *(Describing.)*

```bash
echo "=== is there a previous boot to look at? ==="
journalctl --list-boots 2>/dev/null | head -5
ls -ld /var/log/journal 2>/dev/null || echo "  /var/log/journal does NOT exist"
grep -iE '^\s*#?\s*Storage' /etc/systemd/journald.conf
journalctl --disk-usage 2>/dev/null

echo; echo "=== the sysvinit remnants Debian still carries ==="
dpkg -l systemd systemd-sysv sysvinit-core 2>/dev/null | tail -4
ls -l /sbin/init
ls /etc/init.d/ 2>/dev/null | head
systemctl list-units --type=service 2>/dev/null | grep -c 'LSB:' || true

echo; echo "=== which optional systemd components did Debian decline? ==="
systemctl is-active systemd-resolved systemd-networkd systemd-timesyncd rsyslog 2>/dev/null

echo; echo "=== FIX (optional, reversible): make the journal persistent ==="
echo "  sudo mkdir -p /var/log/journal"
echo "  sudo systemd-tmpfiles --create --prefix /var/log/journal"
echo "  sudo systemctl restart systemd-journald"
```

**What you should see:** on a default Debian install, **`/var/log/journal` does not exist** and
`journalctl --list-boots` shows only the current boot. `/sbin/init` is a symlink into
`/lib/systemd/`. And `rsyslog` is *active* while `systemd-resolved` and friends are not.

**Why it's interesting:** the first result is a genuine trap. **After an unexplained crash, the
single most useful command is `journalctl -b -1` — and on a stock Debian box it will fail**, because
the logs were in a tmpfs and died with the reboot. Fix it before you need it. The rest of the output
is Debian's §37.5 position made visible: adopt the core, decline the optional pieces, keep
`sysvinit-core` installable, and run `rsyslog` alongside journald so the "binary logs" objection
never actually bites you.

---

# Volume 6 Retrospective

**1. Bootstrapping is broken with hardware.** The CPU starts at a fixed reset vector aliased to a
flash chip, because that's the only code on the machine that doesn't need loading. Everything else in
the boot chain is a consequence of that one physical fact.

**2. Legacy BIOS gives a bootloader 440 bytes, and that single number explains GRUB's
architecture.** You cannot fit a filesystem driver in 440 bytes, so stage 1 loads stage 2 from a
**hardcoded sector number**, and stage 2 has the drivers to read stage 3 by path. UEFI deleted all of
that complexity by being able to read FAT32 — which is why the ESP exists, and why FAT32 was chosen
for interoperability rather than quality.

**3. Debian ships a Microsoft-signed file, and the reason is trust distribution, not technology.**
`shim` exists because consumer firmware ships Microsoft's CA and essentially nobody else's. Debian
signs its own GRUB and kernel; it just needs one universally-trusted stepping stone. And Secure Boot
plus kernel lockdown means **root is no longer absolute** — unusual, and a real departure from
Volume 2's model.

**4. GRUB's 28-backspace bug is a lesson about scrutiny, not about bounds checking.** Bootloader code
runs with full hardware access, before any memory protection, privilege separation, or supervisor
exists — every protection from Volumes 2 and 3 is *not yet running*. And BootHole showed the harder
problem: **signing is easy; revocation is where trust chains break**, because the revocation list
lives in space-limited NVRAM where a mistake bricks the machine.

**5. The initramfs exists because a modular kernel needs modules that live on the filesystem it's
trying to mount.** The fix moves the problem from the bootloader (no facilities) to userspace (all of
them) at the cost of a few megabytes. And it closes Volume 3's usr-merge debt precisely: once a
complete rescue environment runs before the real root, **"the minimal set of tools that works without
`/usr`" has no consumer.**

**6. `rdinit=` versus `init=` is the boot's sharpest boundary**, and my test machine happened to
demonstrate it — a real `/proc/cmdline` saying "never switch to a real root; just run this from the
initramfs, forever."

**7. LUKS's two-level key structure is derived, not arbitrary.** A random master key encrypts the
data; your passphrase only unlocks a *copy* of it in a keyslot. Which is why you can change a
passphrase instantly, have eight of them, and revoke one — **and why destroying the header destroys
the data permanently, even if you know the passphrase.**

**8. The passphrase prompt comes from the initramfs, in the unencrypted `/boot`** — which is the
whole of the evil-maid attack, and the reason Secure Boot and TPM sealing exist. And FDE protects
exactly one threat model: **the powered-off machine.** A sleeping laptop, a hibernate to unencrypted
swap, or an attacker with root on the running system all defeat it completely.

**9. XTS gives confidentiality and not integrity**, because a 512-byte sector must encrypt to 512
bytes and there's nowhere to put a MAC. Most explanations of disk encryption omit this.

**10. SysVinit's real failure was PID files, and cgroups eliminated the concept rather than improving
it.** Volume 2 §12.2's PID-reuse hazard — verified there, with `pid_max` at 32768 — is simply not a
hazard for a systemd service, because tracking is by cgroup membership. That's the argument that won,
and even systemd's critics concede it.

**11. Socket activation removes dependencies rather than satisfying them faster.** The accept queue
absorbs the race, so A can connect before B has started. And the privileged `bind()` happens in PID
1 while the service runs unprivileged — Volume 1 §2.7's "file descriptors survive `execve()`", doing
security work.

**12. `Requires=` and `After=` are orthogonal**, and confusing them produces a service that works on
your laptop and fails intermittently on a loaded server. Nearly always you want both.

**13. Your Debian journal is probably not persistent**, so the single most useful post-crash command
will fail. Fix it before you need it.

**14. And the systemd argument was never mainly about whether the core design was good.** It was
good, and it's vindicated. The serious objections were about **scope, coupling and governance** — and
udev's absorption and forking is the concrete proof that at least one of them was right. The
Unix-philosophy argument was the weakest and should be retired; the discussion was conducted badly by
both sides; and **Debian's nuanced answer — adopt the core, decline the optional parts, keep the
alternative installable, vote in public — was only expressible because of the governance machinery
in Volume 4 §20.5.**

---

# Volume 6 is ready

**File: `volume-6-the-boot-process.md`**

## What Volume 7 will cover: SCRIPTING AND AUTOMATION

Volume 6 read a lot of system state with increasingly elaborate one-liners. Volume 7 turns that into
something maintainable.

- **Bash from first principles** — variables, quoting, conditionals, loops, functions,
  arrays — taught through **a real problem you'd actually automate**, not `foo` and `bar`. And built
  on Volume 1: the expansion order from §2.4, why `"$var"` is not optional, and why Volume 1 §7's
  Steam incident is the thing we're defending against.
- **`set -euo pipefail`**, derived rather than cargo-culted. Volume 1 §2.8 showed a pipeline
  swallowing a failure and `$?` reporting success; Volume 1 §7.6 showed `set -u` preventing a deleted
  home directory. Volume 7 explains exactly what each flag does, and — importantly — **where each one
  will bite you**, because they are not free.
- **`cron` versus systemd timers** — what cron genuinely can't do (no dependency ordering, no
  resource limits, no logging beyond mail, no catch-up after downtime, and a
  `PATH` that isn't yours), and how `.timer` units address each. Including `OnCalendar=`,
  `Persistent=`, and `systemd-run` for one-off jobs.
- **A capstone script we build together**: something genuinely useful on your machine — a backup or
  system-audit tool with proper error handling, a lock file, structured logging to the journal, a
  dry-run mode, and a timer unit to run it. Written to be read in six months.
- **TRY THIS ON YOUR MACHINE** — including making a script fail in every way `set -e` *doesn't*
  catch, and watching a timer's catch-up behaviour after simulated downtime.

Say **continue** when you'd like Volume 7.
