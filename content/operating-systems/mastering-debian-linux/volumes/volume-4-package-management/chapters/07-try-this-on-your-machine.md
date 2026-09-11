# TRY THIS ON YOUR MACHINE

Six things that make Debian's packaging visible. **All verified while writing.** Nothing here is
destructive; every block cleans up after itself.

---

## 1. Build a `.deb` from nothing in sixty seconds, then take it apart

**Needs:** `sudo`.

```bash
rm -rf /tmp/mypkg && mkdir -p /tmp/mypkg/DEBIAN /tmp/mypkg/usr/bin /tmp/mypkg/usr/share/doc/hello-demo
cat > /tmp/mypkg/DEBIAN/control <<'EOF'
Package: hello-demo
Version: 1.0-1
Section: misc
Priority: optional
Architecture: all
Depends: bash (>= 4.0)
Maintainer: You <you@example.com>
Description: A tiny demonstration package
 Built by hand in Volume 4.
EOF
printf '#!/bin/bash\necho "hello from a .deb"\n' > /tmp/mypkg/usr/bin/hello-demo
chmod 755 /tmp/mypkg/usr/bin/hello-demo
printf '#!/bin/sh\nset -e\necho "postinst running with arg: $1"\n' > /tmp/mypkg/DEBIAN/postinst
chmod 755 /tmp/mypkg/DEBIAN/postinst
echo "demo" > /tmp/mypkg/usr/share/doc/hello-demo/copyright

dpkg-deb --build /tmp/mypkg /tmp/hello-demo_1.0-1_all.deb

# take it apart WITHOUT installing
ar t /tmp/hello-demo_1.0-1_all.deb
ar p /tmp/hello-demo_1.0-1_all.deb debian-binary
dpkg-deb -I /tmp/hello-demo_1.0-1_all.deb
dpkg-deb -c /tmp/hello-demo_1.0-1_all.deb

# install, use, inspect, remove
sudo dpkg -i /tmp/hello-demo_1.0-1_all.deb
hello-demo
dpkg -L hello-demo
cat /var/lib/dpkg/info/hello-demo.md5sums
sudo dpkg -P hello-demo
rm -rf /tmp/mypkg /tmp/hello-demo_1.0-1_all.deb
```

**What you should see:** `ar t` lists `debian-binary`, `control.tar.*`, `data.tar.*` **in that
order**; `ar p` prints `2.0`; the install prints `postinst running with arg: configure`.

**Why it's interesting:** a `.deb` is three files in a 1971 archive format, and the ordering is
specified so you can read a package's identity and dependencies from its first few kilobytes without
decompressing the payload. Also: you now know how to inspect a vendor `.deb`'s maintainer scripts
**before** letting them run as root.

---

## 2. Watch dpkg refuse to solve a problem

**Needs:** `sudo`.

```bash
rm -rf /tmp/badpkg && mkdir -p /tmp/badpkg/DEBIAN /tmp/badpkg/usr/bin
cat > /tmp/badpkg/DEBIAN/control <<'EOF'
Package: needs-nothing
Version: 1.0
Architecture: all
Depends: totally-nonexistent-package (>= 99)
Maintainer: You <you@example.com>
Description: demonstrates the dpkg/apt split
EOF
printf '#!/bin/sh\necho hi\n' > /tmp/badpkg/usr/bin/nothing
chmod 755 /tmp/badpkg/usr/bin/nothing
dpkg-deb --build /tmp/badpkg /tmp/needs-nothing.deb

sudo dpkg -i /tmp/needs-nothing.deb        # watch it fail
dpkg -l needs-nothing | tail -1            # ← the interesting bit
ls -l /usr/bin/nothing                     # the file IS on disk

sudo dpkg --remove --force-remove-reinstreq needs-nothing
rm -rf /tmp/badpkg /tmp/needs-nothing.deb
```

**What you should see:** `dependency problems - leaving unconfigured`, then state **`iU`** — desired
install, status **U**npacked — and the file present on disk anyway.

**Why it's interesting:** dpkg *understood* the dependency perfectly, checked it, and correctly
refused. What it cannot do is **go and find it** — it has no repositories, no network code, no
solver. That half-state is the entire justification for apt existing as a separate layer, and it's
why the right way to install a local file is `sudo apt install ./file.deb` rather than `dpkg -i`.

---

## 3. Audit every way your machine differs from stock Debian

**Needs:** nothing.

```bash
echo "=== config files YOU have modified ==="
dpkg-query -W -f='${Conffiles}\n' \
  | awk 'NF==2 && $2!="obsolete" {print}' \
  | while read -r f h; do
      [ -f "$f" ] && [ "$(md5sum "$f" | cut -d' ' -f1)" != "$h" ] && echo "  $f"
    done 2>/dev/null

echo; echo "=== packages YOU asked for (not pulled in as dependencies) ==="
apt-mark showmanual | head -30
apt-mark showmanual | wc -l

echo; echo "=== removed but leaving config behind (rc state) ==="
dpkg -l | awk '$1=="rc" {print "  " $2}'

echo; echo "=== anything non-free? ==="
dpkg-query -W -f='${binary:Package} ${Section}\n' | grep -E ' (non-free|contrib)' | head
```

**What you should see:** a short list of edited config files, a few dozen manually-installed
packages, and possibly some `rc` leftovers.

**Why it's interesting:** those four lists **are** your machine, in the sense that everything else is
reproducible from a Debian ISO. Save the `showmanual` output and your modified conffiles and you can
rebuild this system on new hardware. It's also the most honest inventory of your local divergence
that exists, and it takes one command — because Debian tracks a checksum of every config file it
ships (§21.7).

---

## 4. Test your intuition about version numbers

**Needs:** nothing.

```bash
check() { dpkg --compare-versions "$1" "$2" "$3" \
  && echo "  TRUE   $1 $2 $3" || echo "  false  $1 $2 $3"; }

check "2.9"          lt "2.10"
check "1.0"          lt "1.0-1"
check "1.0~beta1"    lt "1.0"
check "1.0beta1"     lt "1.0"
check "1:0.1"        gt "9.9"
check "1.0+deb12u1"  gt "1.0"
check "1.0-1"        lt "1.0-1~bpo12+1"
```

**What you should see:** every line except two is TRUE. `1.0beta1 lt 1.0` is **false** — letters sort
*after* nothing. And the last one is **false** too: `~` sorts before, so a backport is *older* than
the plain revision.

**Why it's interesting:** `2.9 < 2.10` shows the comparison is numeric per component, not
lexicographic. The **`~` rule** is the one to remember — it's the only way to version a prerelease so
it sorts *before* the release, and getting it wrong means your beta looks newer than your final. And
epochs beat everything, which is why they're a one-way door maintainers avoid.

---

## 5. Follow the signature chain from a key to a package

**Needs:** nothing (uses metadata already on disk).

```bash
echo "=== the signed root of trust ==="
ls /etc/apt/trusted.gpg.d/ /usr/share/keyrings/ 2>/dev/null
head -15 /var/lib/apt/lists/*_InRelease 2>/dev/null | head -20

echo; echo "=== when does this metadata expire? ==="
grep -hE '^(Date|Valid-Until):' /var/lib/apt/lists/*InRelease 2>/dev/null | head -4

echo; echo "=== the InRelease file hashes the Packages file ==="
grep -A3 'SHA256:' /var/lib/apt/lists/*_InRelease 2>/dev/null | head -6

echo; echo "=== ...and Packages hashes each .deb ==="
zgrep -A12 -m1 '^Package: bash$' /var/lib/apt/lists/*_Packages* 2>/dev/null \
  | grep -E '^(Package|Version|Filename|Size|SHA256):'
```

**What you should see:** a PGP-signed `InRelease` containing SHA256 hashes of the `Packages` files,
and `Packages` containing a `Filename`, `Size` and `SHA256` for each individual `.deb`.

**Why it's interesting:** **one signature covers the entire archive**, transitively, through a chain
of hashes — tamper with a `.deb` and it fails its hash in `Packages`; tamper with `Packages` and it
fails its hash in `InRelease`; tamper with `InRelease` and the signature fails. And `Valid-Until` is
what stops an attacker freezing you on an old, correctly-signed, vulnerable package list forever.
This is why running `apt install` from the internet as root is defensible.

---

## 6. Ask why a package is on your machine, and other Debian oddities

**Needs:** `sudo apt install aptitude debian-goodies`.

```bash
echo "=== why is this installed? ==="
aptitude why libssl3 2>/dev/null || aptitude why libc6

echo; echo "=== what would autoremove take, and why ==="
apt autoremove --dry-run

echo; echo "=== what's actually eating disk? ==="
dpkg-query -W -f='${Installed-Size}\t${Package}\n' | sort -rn | head -10

echo; echo "=== archive statistics ==="
apt-cache stats

echo; echo "=== which packages need restarting after a library upgrade? ==="
sudo checkrestart 2>/dev/null | head -20     # from debian-goodies

echo; echo "=== and the easter eggs Volume 1 started ==="
apt moo
aptitude -vvvvvv moo
```

**What you should see:** `aptitude why` printing a dependency chain from something you deliberately
installed down to the library you asked about; `apt-cache stats` reporting tens of thousands of
packages and the size of the dependency graph.

**Why it's interesting:** `aptitude why` answers the question `dpkg` and `apt` genuinely cannot —
*"I never installed this, so who did?"* — by searching the dependency graph backwards. And
`apt-cache stats` gives you the scale of §23.2's constraint problem: tens of thousands of packages
and hundreds of thousands of dependency relations, resolved in under a second, every time you type
`apt install`.

---

