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

