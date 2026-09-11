# Volume 5 is ready

**File: `volume-5-networking.md`**

## What Volume 6 will cover: THE BOOT PROCESS, DEEPLY

Volume 5 kept referring forward to systemd — socket activation in §29.3, `systemd-resolved` in
§27.4, service management in §30.9 — without explaining what it is. Volume 6 does, and it starts
from the moment you press the power button.

- **Your own install, explained**: UEFI firmware → the ESP you found in Volume 3 §17.3 → GRUB →
  kernel → **initramfs** → `systemd` → login. Including *why* initramfs exists, which Volume 3
  §16.5 already used to explain the usr-merge without justifying.
- **LUKS**, and the chicken-and-egg problem at its heart: the tool that decrypts your disk has to
  live somewhere that isn't encrypted. What LUKS is doing at each stage, why the key derivation
  function matters, and why `/boot` is (or isn't) separate on your machine.
- **systemd**: what problem it was built to solve versus SysVinit — parallel startup, dependency
  ordering, socket activation (§29.3's elegant privilege trick), cgroup-based process tracking
  rather than PID files (Volume 2 §12.2's PID-reuse hazard, finally addressed), and why
  `journalctl` replaced text log files.
- **And the systemd controversy, covered honestly.** Volume 4 §20.5 mentioned the 2014 Technical
  Committee vote and the General Resolutions that followed, and promised the substance here. It's a
  genuinely interesting engineering *and* governance argument with real points on both sides, and
  it deserves better than either of the usual caricatures.
- **TRY THIS ON YOUR MACHINE** — including finding what's actually slowing your boot down, reading
  your own LUKS header, and watching the dependency graph systemd computed at startup.

Say **continue** when you'd like Volume 6.
