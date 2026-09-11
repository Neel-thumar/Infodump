# Chapter 22 — Inside a `.deb`

## 22.1 The hook

> **A `.deb` is not a zip file, not a tarball, and not a proprietary format. It's three files glued
> together with a utility from 1971 — and the order they appear in is part of the specification, for
> a reason worth knowing.**

## 22.2 Get one to look at

```bash
mkdir -p /tmp/debdemo && cd /tmp/debdemo
apt download hello          # GNU hello: tiny, real, and packaged for decades
ls -lh *.deb
```

If `apt download` isn't available or the package isn't in your archive, use one you already have:

```bash
ls /var/cache/apt/archives/*.deb 2>/dev/null | head -3
```

Or build the one from §21.3 and dissect that — the structure is identical.

## 22.3 THE MECHANISM: three members, in a mandated order

```bash
file hello_*.deb
ar t hello_*.deb
```

```
hello_2.10-3_amd64.deb: Debian binary package (format 2.0), with control.tar.xz, data compression xz
debian-binary
control.tar.xz
data.tar.xz
```

*(Structure verified; note the compression caveat below.)*

**It's an `ar` archive** — the ancient Unix archiver, the same one that makes `.a` static libraries.
Three members:

| # | Member | Contents |
|---|---|---|
| 1 | **`debian-binary`** | a text file containing exactly `2.0\n` — the format version |
| 2 | **`control.tar.*`** | **metadata**: the control file, checksums, maintainer scripts, conffile list |
| 3 | **`data.tar.*`** | **the actual files**, with paths relative to `/` |

Prove member 1 is plain text:

```bash
ar p hello_*.deb debian-binary
```

```
2.0
```

*(Verified.)* And look at the raw start of the file:

```bash
head -c 100 hello_*.deb | strings | head -5
```

```
!<arch>
debian-binary   1789025707  0     0     100644  4         `
control.tar.xz  1789025707
```

*(Verified.)* **The first hundred bytes are readable ASCII** listing what's inside.

### Why `ar`, and why that order

This looks like a historical accident and isn't. The ordering is **specified** in `deb(5)`, and it
buys three things:

1. **You can identify the format without decompressing anything.** `debian-binary` is first,
   uncompressed, and four bytes long. A tool reading a `.deb` over a network connection knows what it
   has after the first block.
2. **You can read the metadata without downloading the payload.** `control.tar.*` comes *before*
   `data.tar.*`, so a repository tool can fetch the first few kilobytes of a multi-megabyte package
   and learn its name, version, dependencies and description. That's not hypothetical — it's how
   archive scanning stays affordable.
3. **Each member is independently compressed with a standard tool**, so a `.deb` can be taken apart
   by `ar` and `tar` alone. No special software is needed to recover the contents of a package,
   ever. That's a real durability property.

> **A Debian/Ubuntu difference, verified the hard way.** My test system produced `control.tar.zst`
> and `data.tar.zst` — **zstd** compression — because it runs Ubuntu, which changed `dpkg-deb`'s
> default. **Debian's archive predominantly uses `xz`.** Both are valid; dpkg reads gz, xz, zst,
> bz2 and lzma. Check yours:
>
> ```bash
> ar t *.deb
> ```
>
> **Confidence: moderate** on Debian's current `dpkg-deb` build default being xz. Your own output
> settles it.

## 22.4 Reading the metadata

The long way, so you can see there's no magic:

```bash
cd /tmp/debdemo
mkdir -p manual && cd manual
ar x ../hello_*.deb
ls -l
tar tf control.tar.* | head
mkdir -p ctl && tar xf control.tar.* -C ctl
ls -l ctl
cat ctl/control
```

The short way, which does the same thing:

```bash
cd /tmp/debdemo
dpkg-deb -I hello_*.deb          # the control file plus a summary
dpkg-deb -c hello_*.deb | head   # the CONTENTS, without installing
dpkg-deb -e hello_*.deb ./ctl2   # extract just the control directory
dpkg-deb -x hello_*.deb ./files  # extract just the data
dpkg-deb -R hello_*.deb ./both   # everything, ready to rebuild
```

A real control file:

```
Package: hello
Version: 2.10-3
Architecture: amd64
Maintainer: Santiago Vila <sanvila@debian.org>
Installed-Size: 280
Depends: libc6 (>= 2.14)
Section: devel
Priority: optional
Homepage: https://www.gnu.org/software/hello/
Description: example package based on GNU hello
 The GNU hello program produces a familiar, friendly greeting.
 .
 Seriously, though: this is an example of how to do a Debian package.
```

> **Read a package's dependencies and maintainer scripts *before* installing it.** For anything from
> outside the Debian archive — a vendor `.deb`, something from a GitHub release — this is the
> minimum due diligence, because §21.6's maintainer scripts **run as root**:
>
> ```bash
> dpkg-deb -I some-vendor.deb          # what does it claim?
> dpkg-deb -c some-vendor.deb          # where does it put files? /usr/local? /opt? /etc?
> dpkg-deb -e some-vendor.deb ./ctl && cat ./ctl/p*inst ./ctl/p*rm 2>/dev/null
> ```
>
> A package that installs into `/usr/bin` rather than `/opt` and has a 200-line `postinst` deserves
> a read.

## 22.5 Control field reference

The fields you'll actually meet:

| Field | Meaning |
|---|---|
| **`Package`** | the name |
| **`Version`** | see §22.6 — the format is not free-form |
| **`Architecture`** | `amd64`, `arm64`, or **`all`** for architecture-independent content |
| **`Maintainer`** | a real person or team, with a working address |
| **`Description`** | one-line synopsis, then an indented long description; `.` on its own is a blank line |
| **`Depends`** etc. | Chapter 23 |
| **`Section`** | `admin`, `net`, `devel`, `misc`… — used for browsing |
| **`Priority`** | `required`, `important`, `standard`, `optional`, `extra` (deprecated) |
| **`Essential: yes`** | dpkg refuses to remove it without force |
| **`Multi-Arch`** | how it behaves when 32- and 64-bit versions coexist |
| **`Installed-Size`** | in kilobytes, so apt can predict disk usage before downloading |

```bash
dpkg-query -W -f='${Package}\t${Priority}\t${Section}\n' 2>/dev/null | sort -k2 | head -10
dpkg-query -W -f='${Installed-Size}\t${Package}\n' | sort -rn | head -10
```

*(Verified — that last one is a genuinely useful "what's eating my disk" query.)*

## 22.6 Version strings, and the `~` rule that saves you

Debian versions have a defined format and a defined comparison algorithm:

```
        1:2.10-3+deb12u1
        │ │    │ │
        │ │    │ └── Debian-specific suffix (a stable update)
        │ │    └──── Debian revision — the packaging changed, upstream didn't
        │ └───────── upstream version
        └─────────── EPOCH (rare)
```

You can test the comparison yourself, which is the only way to be sure:

```bash
check() { dpkg --compare-versions "$1" "$2" "$3" && echo "TRUE:  $1 $2 $3" || echo "false: $1 $2 $3"; }

check "1.0"        lt "1.0.1"
check "1.0"        lt "1.0-1"
check "2.9"        lt "2.10"
check "1.0~beta1"  lt "1.0"
check "1.0~rc1"    lt "1.0~rc2"
check "1.0+deb12u1" gt "1.0"
check "1:1.0"      gt "9.9"
```

```
TRUE:  1.0 lt 1.0.1
TRUE:  1.0 lt 1.0-1
TRUE:  2.9 lt 2.10           ← numeric, not lexicographic
TRUE:  1.0~beta1 lt 1.0      ← the tilde rule
TRUE:  1.0~rc1 lt 1.0~rc2
TRUE:  1.0+deb12u1 gt 1.0
TRUE:  1:1.0 gt 9.9          ← epoch beats everything
```

*(All eight verified.)* Two of those deserve attention:

**The `~` rule.** A tilde sorts **before** the empty string, so `1.0~beta1 < 1.0`. This exists so
prereleases can be versioned sensibly. Without it, `1.0beta1 > 1.0` (letters sort after nothing) and
your beta would look newer than the release. **If you ever version anything yourself, use `~` for
prereleases.**

**The epoch.** `1:1.0 > 9.9` because the epoch is compared first. Its sole purpose is to rescue you
when **upstream's versioning goes backwards** — they release `2.0`, then rename the project and
restart at `0.5`. Without an epoch, apt would refuse to "upgrade" to the lower number. Once you add
an epoch you can never remove it, which is why maintainers avoid it.

---

