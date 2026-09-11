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

