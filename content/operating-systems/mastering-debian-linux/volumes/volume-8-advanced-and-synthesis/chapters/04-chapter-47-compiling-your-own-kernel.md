# Chapter 47 — Compiling Your Own Kernel

## 47.1 The hook

> **Debian's kernel team maintains a kernel that boots on essentially all x86-64 hardware, receives
> security updates within hours of disclosure, and requires nothing from you.**
>
> **So the honest first question is not "how do I compile a kernel" but "why would I?"**

## 47.2 Why you probably shouldn't

| You lose | Which means |
|---|---|
| **Debian's security updates** | **you** now track kernel CVEs and rebuild. This is the big one. |
| Automatic DKMS rebuilds | §45.7's machinery is tied to Debian's kernel packages |
| Secure Boot | your kernel isn't signed by Debian's key (Volume 6 §32.6) |
| Tested configuration | Debian's config is exercised by millions of machines |

**Try these first, in order:**

```bash
# 1. a newer kernel from backports — Volume 4 §24.4
apt-cache policy linux-image-amd64 2>/dev/null
sudo apt install -t bookworm-backports linux-image-amd64

# 2. a different Debian kernel FLAVOUR
apt-cache search '^linux-image-.*-amd64$' 2>/dev/null | head

# 3. just the driver you need, via DKMS — §45.7
dkms status
```

**Legitimate reasons to build anyway:** a driver not in any Debian kernel; a config option Debian
doesn't enable; kernel development or debugging; a `PREEMPT_RT` real-time build; or — entirely
valid — because you want to understand it.

## 47.3 THE MECHANISM: the Debian way

*(Describing — I can't build a kernel in this environment.)*

The crucial point is that you should **not** run `make install`. Volume 4 taught that unpackaged
files in `/` are invisible to dpkg (§21.4) and Volume 3 §16.6 that `/usr/local` is the only place
that's yours. The kernel build system has a better answer:

```bash
sudo apt install build-essential libncurses-dev bison flex libssl-dev \
                 libelf-dev bc dwarves rsync kmod cpio

apt-get source linux            # needs deb-src (Volume 4 §24.6)
# or: git clone --depth 1 -b v6.6 https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git

cd linux-*/
cp /boot/config-$(uname -r) .config      # START from Debian's working config
make olddefconfig                         # accept defaults for anything new

make -j"$(nproc)" bindeb-pkg              # ← produces .deb FILES
ls -lh ../linux-*.deb
```

> **`make bindeb-pkg` is the whole point.** It produces real Debian packages:
>
> ```
> linux-image-6.6.0_6.6.0-1_amd64.deb
> linux-headers-6.6.0_6.6.0-1_amd64.deb
> ```
>
> Install them with `dpkg -i` and **everything in Volume 4 and Volume 6 works normally**: dpkg tracks
> every file, the kernel hooks run `update-initramfs` and `update-grub` (Volume 6 §34.6), DKMS
> rebuilds your out-of-tree modules against it, and `apt purge` removes it cleanly.
>
> `make install` gives you none of that, and leaves you removing files by hand later.

```bash
sudo dpkg -i ../linux-image-*.deb ../linux-headers-*.deb
ls /boot/
grep -c menuentry /boot/grub/grub.cfg
# reboot, and pick the new kernel from the GRUB menu (Volume 6 §33.4)
uname -r
```

**Your old kernel is still installed and still in the GRUB menu.** That is your recovery path, and
it's why you never remove the working kernel until the new one has booted successfully.

## 47.4 Configuration, and the shortcut that saves an hour

```bash
make menuconfig         # ncurses interface; '/' searches
make nconfig
make xconfig
```

Options are `y` (built in), `m` (module), or `n`. The search function is essential — the config has
tens of thousands of entries.

**The shortcut worth knowing:**

```bash
make localmodconfig
```

> **`localmodconfig` reads `lsmod` and disables every module you are not currently using.** It can
> cut a build from an hour to under ten minutes and from several gigabytes to a few hundred
> megabytes.
>
> **The catch is in the name: *local*.** It configures for the hardware currently in use. Plug in a
> USB device whose driver was disabled and it won't work. Boot the result on different hardware and
> it may not boot at all. Perfect for a fixed machine; wrong for anything portable.

Practical expectations:

| Build | Rough time on a modern laptop | Disk |
|---|---|---|
| Debian's full config | **30–90 minutes** | **15–25 GB** |
| `localmodconfig` | 5–15 minutes | 2–4 GB |

```bash
nproc; df -h /home | tail -1
```

Use `make -j"$(nproc)"`, and expect the machine to be unusable for other work while it runs — which
is a good moment to remember Volume 6 §36.5's `CPUQuota=` if you'd rather it weren't.

## 47.5 Signing for Secure Boot

If Secure Boot is on, a self-built kernel won't boot until it's signed with an enrolled key — §45.6's
MOK process, applied to the kernel image rather than a module:

```bash
mokutil --sb-state
sbsign --key MOK.priv --cert MOK.pem --output vmlinuz-signed /boot/vmlinuz-6.6.0
```

Or disable Secure Boot in firmware, accepting what Volume 6 §32.6 said you're giving up.

---

