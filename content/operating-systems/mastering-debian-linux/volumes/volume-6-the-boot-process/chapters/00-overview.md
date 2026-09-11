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

