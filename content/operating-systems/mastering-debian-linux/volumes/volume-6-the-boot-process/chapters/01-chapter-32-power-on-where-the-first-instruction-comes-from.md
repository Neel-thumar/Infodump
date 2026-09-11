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

