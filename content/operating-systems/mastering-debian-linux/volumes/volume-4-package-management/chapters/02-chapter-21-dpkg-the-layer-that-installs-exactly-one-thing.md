# Chapter 21 — `dpkg`: The Layer That Installs Exactly One Thing

## 21.1 The hook

> **`apt` is what you type. `dpkg` is what actually installs. So what does the split buy you — and
> what happens if you skip the top layer?**

Let's find out by skipping it.

## 21.2 THE PROBLEM: two completely different jobs

Installing software involves two problems that have almost nothing in common:

| Problem | Requires |
|---|---|
| **"Unpack this archive into the filesystem, record what it put where, run its setup scripts, and remember it's installed"** | filesystem operations, a local database, script execution |
| **"Given that I want package X, work out the complete set of other packages needed, find them on the internet, download them, and order the installations correctly"** | a dependency solver, network access, repository metadata, cryptographic verification |

Merging those into one program means a tool that can't operate offline, can't install a local file
cleanly, and mixes a constraint solver with a filesystem unpacker.

**Debian splits them.**

```
   ┌──────────────────────────────────────────────────────────────┐
   │  apt / apt-get / aptitude / synaptic                         │
   │  • reads repository metadata                                 │
   │  • RESOLVES DEPENDENCIES                                     │
   │  • downloads .deb files, verifies signatures                 │
   │  • decides the ORDER                                         │
   └───────────────────────────┬──────────────────────────────────┘
                               │  calls, one .deb at a time
   ┌───────────────────────────▼──────────────────────────────────┐
   │  dpkg                                                        │
   │  • unpacks ONE .deb                                          │
   │  • runs its maintainer scripts                               │
   │  • records every file in /var/lib/dpkg/                      │
   │  • CHECKS dependencies — but cannot FETCH them               │
   └──────────────────────────────────────────────────────────────┘
```

> **The one-sentence version: `dpkg` knows everything about *one* package and nothing about the
> internet. `apt` knows everything about the internet and delegates the actual installing.**

## 21.3 THE MECHANISM: watch dpkg refuse to solve a problem

Build a package by hand — you'll take one apart properly in Chapter 22, but building one is the
fastest way to see the layers. *(Everything in this section is verified.)*

```bash
rm -rf /tmp/mypkg && mkdir -p /tmp/mypkg/DEBIAN /tmp/mypkg/usr/bin /tmp/mypkg/usr/share/doc/hello-demo

cat > /tmp/mypkg/DEBIAN/control <<'EOF'
Package: hello-demo
Version: 1.0-1
Section: misc
Priority: optional
Architecture: all
Depends: bash (>= 4.0)
Maintainer: Demo <demo@example.com>
Description: A tiny demonstration package
 This package exists purely so its internals can be inspected.
EOF

printf '#!/bin/bash\necho "hello from a .deb"\n' > /tmp/mypkg/usr/bin/hello-demo
chmod 755 /tmp/mypkg/usr/bin/hello-demo

printf '#!/bin/sh\nset -e\necho "postinst running with arg: $1"\n' > /tmp/mypkg/DEBIAN/postinst
chmod 755 /tmp/mypkg/DEBIAN/postinst

echo "demo" > /tmp/mypkg/usr/share/doc/hello-demo/copyright

dpkg-deb --build /tmp/mypkg /tmp/hello-demo_1.0-1_all.deb
```

Install it with `dpkg` directly:

```bash
sudo dpkg -i /tmp/hello-demo_1.0-1_all.deb
hello-demo
```

```
Preparing to unpack /tmp/hello-demo_1.0-1_all.deb ...
Unpacking hello-demo (1.0-1) ...
Setting up hello-demo (1.0-1) ...
postinst running with arg: configure
hello from a .deb
```

*(Verified.)* Note **`postinst running with arg: configure`** — dpkg ran the maintainer script and
told it which phase it was in. §21.6.

Now the point of the chapter. Build a package whose dependency **cannot be satisfied**:

```bash
rm -rf /tmp/badpkg && mkdir -p /tmp/badpkg/DEBIAN /tmp/badpkg/usr/bin
cat > /tmp/badpkg/DEBIAN/control <<'EOF'
Package: needs-nothing
Version: 1.0
Architecture: all
Depends: totally-nonexistent-package (>= 99)
Maintainer: Demo <demo@example.com>
Description: demonstrates dpkg refusing to resolve
EOF
printf '#!/bin/sh\necho hi\n' > /tmp/badpkg/usr/bin/nothing
chmod 755 /tmp/badpkg/usr/bin/nothing
dpkg-deb --build /tmp/badpkg /tmp/needs-nothing.deb

sudo dpkg -i /tmp/needs-nothing.deb
```

```
dpkg: dependency problems prevent configuration of needs-nothing:
 needs-nothing depends on totally-nonexistent-package (>= 99); however:
  Package totally-nonexistent-package is not installed.

dpkg: error processing package needs-nothing (--install):
 dependency problems - leaving unconfigured
Errors were encountered while processing:
 needs-nothing
```

*(Verified.)* Read that carefully — it's more interesting than a plain failure:

```bash
dpkg -l needs-nothing | tail -1
```

```
iU  needs-nothing  1.0  all  demonstrates dpkg refusing to resolve
```

**State `iU`.** Desired: **i**nstall. Status: **U**npacked. **dpkg unpacked the files onto your disk
and then refused to configure the package.** It is neither installed nor absent — it's in a
half-state, and it will nag you about it on every subsequent dpkg run until you resolve it.

> **This is the whole argument for `apt` in one output.** `dpkg` *knows* about the dependency — it
> parsed it, checked it, and correctly refused. What it cannot do is **go and get it**. It has no
> concept of a repository, no network code, and no solver. Hand it a package with unmet dependencies
> and the best it can do is stop halfway and tell you.

Clean up:

```bash
sudo dpkg --remove --force-remove-reinstreq needs-nothing
rm -f /tmp/needs-nothing.deb && rm -rf /tmp/badpkg
```

**And the right way to install a local `.deb`** — which hands the file to dpkg *through* apt, so
dependencies get resolved:

```bash
sudo apt install /tmp/hello-demo_1.0-1_all.deb      # note the ./ or absolute path
```

The older ritual, still useful to recognise, was `sudo dpkg -i file.deb` followed by
`sudo apt install -f` ("fix broken") to clean up afterwards.

## 21.4 The dpkg database

Everything dpkg knows lives in one directory, in **plain text**:

```bash
ls -la /var/lib/dpkg/
wc -l /var/lib/dpkg/status
grep -c '^Package:' /var/lib/dpkg/status
```

```
status file: 25594 lines, 866 packages
```

*(Verified, on the test system.)* `/var/lib/dpkg/status` is the master record — one stanza per
package, in the same **RFC 822-ish** format used everywhere in Debian:

```bash
awk '/^Package: bash$/,/^$/' /var/lib/dpkg/status | head -25
```

```
Package: bash
Essential: yes
Status: install ok installed
Priority: required
Section: shells
Installed-Size: 1900
Maintainer: Bash Maintainers <pkg-bash-devel@lists.alioth.debian.org>
Architecture: amd64
Multi-Arch: foreign
Version: 5.2.15-2+b7
Depends: base-files (>= 2.1.12), debianutils (>= 5.6-0.1)
Pre-Depends: libc6 (>= 2.36), libtinfo6 (>= 6)
Recommends: bash-completion
Suggests: bash-doc
Conffiles:
 /etc/bash.bashrc 3aa8b92d1dd6ddf4daaedc019662f1dc
 /etc/skel/.bashrc 1f98b8f3f3c8f8927eca945d59dcc1c6
 ...
```

*(Structure verified; version strings adjusted to Debian.)* Several things worth noticing:

- **`Essential: yes`** — dpkg will refuse to remove this without `--force-remove-essential`. There's
  a small set of these; removing one bricks the system.
- **`Depends` vs `Pre-Depends`** — §23.3.
- **`Conffiles` with MD5 hashes** — this is how dpkg knows whether *you* edited a config file. §21.7.

Per-package bookkeeping lives alongside:

```bash
ls /var/lib/dpkg/info/ | head
ls /var/lib/dpkg/info/bash.*
```

| File | Contains |
|---|---|
| `<pkg>.list` | **every path the package owns** — this is what `dpkg -L` reads |
| `<pkg>.md5sums` | checksums of installed files — lets you detect modification |
| `<pkg>.conffiles` | which of its files are configuration |
| `<pkg>.{preinst,postinst,prerm,postrm}` | the maintainer scripts |
| `<pkg>.triggers` | trigger declarations (§21.8) |

```bash
head -5 /var/lib/dpkg/info/bash.list
head -3 /var/lib/dpkg/info/bash.md5sums
```

**And `dpkg -S` is just a search of those `.list` files:**

```bash
dpkg -S /bin/bash
grep -l '/bin/bash$' /var/lib/dpkg/info/*.list | head
```

> **The database is plain text you can read with `grep`.** That is a deliberate and slightly
> unfashionable choice — rpm uses a binary Berkeley DB / sqlite — and it means that when things go
> badly wrong you can inspect and, carefully, repair the state with a text editor. Debian keeps a
> backup at `/var/backups/dpkg.status.*`.

```bash
ls -lh /var/backups/dpkg.status* 2>/dev/null | head -3
```

## 21.5 Package states: decoding `ii`, `rc`, and `iU`

```bash
dpkg -l | head -6
```

```
Desired=Unknown/Install/Remove/Purge/Hold
| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend
|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)
||/ Name           Version      Architecture Description
+++-==============-============-============-=================================
ii  bash           5.2.15-2+b7  amd64        GNU Bourne Again SHell
```

**Three characters, three independent facts:**

| Position | Meaning | Common values |
|---|---|---|
| 1 — **Desired** | what you asked for | `i` install, `r` remove, `p` purge, `h` **hold** |
| 2 — **Status** | what's actually true | `i` installed, `n` not, `c` **config-files only**, `U` unpacked, `F` half-configured, `H` half-installed |
| 3 — **Error** | | blank = fine, `R` = reinstall required |

So:

| Code | Means | How you get there |
|---|---|---|
| **`ii`** | normal, installed | the usual case |
| **`rc`** | **removed, but config files remain** | `apt remove` (not `purge`) |
| **`iU`** | wanted, unpacked, **not configured** | §21.3's dependency failure |
| **`iF`** | configuration script failed | a broken postinst |
| **`hi`** | **held** at this version | `apt-mark hold` |

Find the leftovers on your own system — nearly everyone has some:

```bash
dpkg -l | awk '$1 ~ /^rc/ {print $2}'
```

Those are packages you removed whose configuration files are still on disk. Harmless, but if you
want them gone:

```bash
dpkg -l | awk '$1 ~ /^rc/ {print $2}' | xargs -r sudo apt purge -y
```

## 21.6 Maintainer scripts

A package is not just files. It may need to create a system user, generate a config, register a
service, or rebuild a cache. Debian's mechanism is **four shell scripts** that dpkg runs at defined
points, with an argument saying which phase it's in.

| Script | Runs | Typical argument |
|---|---|---|
| **`preinst`** | before unpacking | `install`, `upgrade <old-version>` |
| **`postinst`** | after unpacking, to configure | **`configure <old-version>`** |
| **`prerm`** | before removing files | `remove`, `upgrade`, `deconfigure` |
| **`postrm`** | after removing files | `remove`, **`purge`**, `upgrade` |

You saw one fire in §21.3: `postinst running with arg: configure`.

Read a real one:

```bash
sudo cat /var/lib/dpkg/info/openssh-server.postinst 2>/dev/null | head -40
ls /var/lib/dpkg/info/*.postinst | wc -l
```

> **Maintainer scripts run as root, and their failure modes are unpleasant** — a `postinst` that
> exits non-zero leaves the package in state `iF` and blocks other operations. Debian Policy
> requires them to be **idempotent** (safe to re-run) and to handle every argument they might
> receive, including being called for an *upgrade from a version that doesn't exist yet*.
>
> This is also, unavoidably, an execution-of-arbitrary-root-code mechanism, which is exactly why
> §23.6's archive signing matters so much.

## 21.7 Conffiles: why `apt upgrade` asks you a question

Debian tracks which files are *configuration* and **will not silently overwrite your edits.** This
is a genuine Debian strength and the mechanism is simple.

Watch the whole lifecycle *(fully verified)*:

```bash
rm -rf /tmp/cfpkg && mkdir -p /tmp/cfpkg/DEBIAN /tmp/cfpkg/etc
cat > /tmp/cfpkg/DEBIAN/control <<'EOF'
Package: conf-demo
Version: 1.0
Architecture: all
Maintainer: Demo <demo@example.com>
Description: demonstrates conffile handling
EOF
echo "setting = original" > /tmp/cfpkg/etc/conf-demo.conf
echo "/etc/conf-demo.conf" > /tmp/cfpkg/DEBIAN/conffiles      # ← declares it config
dpkg-deb --build /tmp/cfpkg /tmp/conf-demo.deb

sudo dpkg -i /tmp/conf-demo.deb
cat /etc/conf-demo.conf
```

```
setting = original
```

Now edit it, as you would any config:

```bash
echo "setting = MY EDIT" | sudo tee /etc/conf-demo.conf
sudo dpkg -r conf-demo                  # REMOVE (not purge)
dpkg -l conf-demo | tail -1
cat /etc/conf-demo.conf
```

```
rc  conf-demo  1.0  all  demonstrates conffile handling
setting = MY EDIT
```

*(Verified.)* **State `rc`, and your edit survived the removal.** That's what the `c` means.

```bash
sudo dpkg -P conf-demo                  # PURGE
cat /etc/conf-demo.conf 2>/dev/null || echo "GONE"
```

```
Purging configuration files for conf-demo (1.0) ...
GONE
```

**And the upgrade case**, which is where you meet this in real life:

```bash
sudo dpkg -i /tmp/conf-demo.deb
echo "setting = MY EDIT AGAIN" | sudo tee /etc/conf-demo.conf

sed -i 's/^Version: 1.0/Version: 2.0/' /tmp/cfpkg/DEBIAN/control
echo "setting = NEW UPSTREAM DEFAULT" > /tmp/cfpkg/etc/conf-demo.conf
dpkg-deb --build /tmp/cfpkg /tmp/conf-demo-2.deb

sudo dpkg -i /tmp/conf-demo-2.deb       # ← it will ASK you
```

dpkg compares three things: the MD5 it recorded at install, the file on disk now, and the file in
the new package. Since your version differs from the recorded one, **it knows you edited it** and
presents the prompt:

```
Configuration file '/etc/conf-demo.conf'
 ==> Modified (by you or by a script) since installation.
 ==> Package distributor has shipped an updated version.
   What would you like to do about it ?
    Y or I  : install the package maintainer's version
    N or O  : keep your currently-installed version
      D     : show the differences between the versions
      Z     : start a shell to examine the situation
```

**`D` is the right first answer, always.** Non-interactively:

```bash
sudo dpkg -i --force-confold /tmp/conf-demo-2.deb   # keep MINE  (verified)
# --force-confnew   take the maintainer's
# --force-confdef   take the default action where one is defined
```

*(Verified: with `--force-confold` the file still read `setting = MY EDIT AGAIN` after the upgrade.)*

Clean up:

```bash
sudo dpkg -P conf-demo
rm -rf /tmp/cfpkg /tmp/conf-demo*.deb
```

**Find every config file you've modified on your system** — a genuinely useful audit:

```bash
dpkg-query -W -f='${Conffiles}\n' \
  | awk 'NF==2 && $2!="obsolete" {print}' \
  | while read -r f h; do
      [ -f "$f" ] && [ "$(md5sum "$f" | cut -d' ' -f1)" != "$h" ] && echo "MODIFIED: $f"
    done 2>/dev/null | head -20
```

That's your entire local divergence from stock Debian, in one command. Worth putting in version
control.

## 21.8 Triggers, briefly

If installing 200 packages each rebuilt the man-page index, the font cache and the icon cache, an
upgrade would take an hour. **Triggers** let a package say "something changed in `/usr/share/man`,
please rebuild once, at the end":

```bash
cat /var/lib/dpkg/triggers/File 2>/dev/null | head -10
ls /var/lib/dpkg/info/*.triggers | head -5
```

You see them fire during upgrades as `Processing triggers for man-db ...`. They're the reason a
large upgrade ends with a short burst of cache rebuilding rather than doing it 200 times.

---

