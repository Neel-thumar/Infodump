# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 4 — Debian's Package Management, Specifically

---

### Where the first three volumes left off

Volumes 1 to 3 kept pointing at `dpkg` and walking on:

| You ran | Volume | And I said "Volume 4" |
|---|---|---|
| `dpkg -S "$(command -v bash)"` | 1 §1.3 | which package owns a file |
| `dpkg -L less \| head` | 1 §5.4 | which files a package owns |
| `dpkg-query -W -f='${Conffiles}'` | 3 §16.7 | Debian tracks your edits to `/etc` |
| `dpkg -S /usr/local/bin/*` → nothing | 3 §16.6 | Debian Policy forbids packages there |

This is the most Debian-specific volume in the book. Almost nothing here generalises to "Linux" —
`rpm`, `pacman` and `apk` all made different choices, and where Debian's choice is unusual I'll say
so.

**Requirements.** Everything runs on a stock Debian install. Some demonstrations need `sudo` and
one needs network access.

```bash
sudo apt install debian-policy developers-reference   # optional but excellent reading
```

**Verification note.** As in Volumes 2 and 3, every demonstration was run before being written down.
This time with a caveat worth stating plainly: **the machine I tested on runs Ubuntu 24.04, not
Debian.** `dpkg` itself is identical — Ubuntu uses Debian's tooling unmodified — so all the
*mechanisms* below are verified. But the *content* differs (maintainer names, version strings, and
one compression default I flag in §22.3), and I've adjusted example output to what you should see on
Debian. Where I'm showing literal verified output I say so.

First, find out what you actually installed:

```bash
cat /etc/debian_version
cat /etc/os-release | head -4
```

---

# Chapter 20 — Who Makes Your Operating System, and How They Decide

## 20.1 The hook

> **Your wifi might not have worked on first boot. Or it might have worked fine and you never
> thought about it.**
>
> **Which of those happened depends on a vote — an actual, documented, constitutionally-defined
> vote — held by a few hundred volunteers in 2022.**

Most distributions are made by a company, and their decisions are business decisions you find out
about afterwards. Debian is not, and the difference is not sentimental. It shows up in your
`sources.list`, in whether your hardware works, and in what happens when someone finds a serious
bug. This chapter is about the machinery, because the machinery is why the packaging works the way
it does.

## 20.2 1993: Ian Murdock

> **Confidence: high** on the date, the announcement, and the origin of the name.

On **16 August 1993**, Ian Murdock posted to `comp.os.linux.development` announcing the "Debian
Linux Release." He was a Purdue undergraduate. His stated problem was that the Linux distributions
then available were assembled carelessly — packages thrown together, no consistent way to install or
remove them, no coherent maintenance.

**The name** is a portmanteau: **Deb**ra, his then-girlfriend and later wife, plus **Ian**.
Pronounced *DEB-ee-en*. It is the only major operating system named after a couple.

> Ian Murdock died in December 2015. The project's founding documents are still in the shape he and
> the early contributors gave them.

The **Debian Manifesto** (January 1994) is worth reading in full — it's short — and its central
argument was that a distribution should be maintained **openly, in the spirit of the software it
packages**, rather than assembled behind closed doors and released as a finished artifact.

The Free Software Foundation sponsored the project for roughly a year, around 1994–95.

> **Confidence: moderate-high** on the FSF sponsorship and its rough timeframe.

## 20.3 THE PROBLEM: how does a volunteer project make binding decisions?

A company decides by having a boss. A volunteer project of a thousand people spread across every
timezone, with no employment relationship and no way to fire anyone, has a genuine coordination
problem — and "whoever argues longest on the mailing list" is not a governance model.

Debian's answer was to **write it down**. Three documents, all of which you can read on your machine:

| Document | Ratified | What it is |
|---|---|---|
| **Debian Social Contract** | 1997 (v1.1 in 2004) | a promise to users and to the free software community |
| **Debian Free Software Guidelines (DFSG)** | part of the Social Contract | the **test** for whether something can go in Debian |
| **Debian Constitution** | 1998 | who may decide what, and by what procedure |

```bash
ls /usr/share/doc/debian/
zless /usr/share/doc/debian/social-contract.txt.gz 2>/dev/null \
  || cat /usr/share/doc/debian/social-contract* 2>/dev/null
```

> **Confidence: moderate-high** that the `base-files` package ships these under
> `/usr/share/doc/debian/`; the exact filenames have varied. If they're not there they're on
> debian.org, and the `debian-policy` package ships the technical rules.

### The Social Contract, in five promises

Paraphrased; the wording is short enough to read yourself:

1. **Debian will remain 100% free software.**
2. **We will give back** to the free software community — improvements go upstream.
3. **We will not hide problems.** Bug reports are public, always. The bug tracker is open to the
   world.
4. **Our priorities are our users and free software.**
5. **Works that do not meet our free software standards** may be carried in separate archive areas,
   as a service to users, but **are not part of Debian.**

> **Point 3 is not boilerplate.** Chapter 25's incident is a case where Debian had every incentive
> to be quiet about a catastrophic mistake of its own making, and instead published a detailed
> advisory plus tooling to help people find the damage. That's point 3 being expensive and being
> honoured anyway.

### The DFSG, and the fact that it defines "open source"

The **Debian Free Software Guidelines** are nine tests a licence must pass:

| # | Requirement |
|---|---|
| 1 | **Free redistribution** — no fee required for giving it away |
| 2 | **Source code** must be included or freely available |
| 3 | **Derived works** must be permitted, under the same licence |
| 4 | **Integrity of the author's source code** — a licence *may* require modifications ship as patches |
| 5 | **No discrimination against persons or groups** |
| 6 | **No discrimination against fields of endeavour** — including commercial and military use |
| 7 | **Distribution of licence** — rights apply to everyone who receives it, no extra agreement |
| 8 | **Licence must not be specific to Debian** |
| 9 | **Licence must not contaminate other software** on the same medium |

Here is the part that surprises people:

> **In 1998, Bruce Perens took the DFSG, removed the Debian-specific references, and the result
> became the *Open Source Definition* used by the Open Source Initiative.**
>
> **Confidence: high.** The industry-standard definition of "open source" is a lightly edited
> Debian policy document. Perens was Debian Project Leader at the time and was the primary author
> of both the Social Contract and the DFSG.

Point 6 deserves a mention because it's the one people try to violate with the best intentions: a
licence saying "not for military use" or "not for use by companies over $X revenue" is **not free**
by the DFSG, no matter how sympathetic the goal. Debian has held that line consistently, and it's a
recurring source of argument.

## 20.4 THE MECHANISM: the archive areas follow directly from the DFSG

This is where the philosophy becomes something you type.

```bash
grep -h -v '^#' /etc/apt/sources.list /etc/apt/sources.list.d/*.list 2>/dev/null | grep .
cat /etc/apt/sources.list.d/*.sources 2>/dev/null
```

On a Debian 12 install you'll see something close to:

```
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://security.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
```

Those trailing words are **archive areas**, and each one is a DFSG verdict:

| Area | Is the software DFSG-free? | Do its dependencies live in `main`? | Part of Debian? |
|---|---|---|---|
| **`main`** | **yes** | **yes** | **yes** — this *is* Debian |
| **`contrib`** | **yes** | **no** — needs something non-free to be useful | no (Social Contract §5) |
| **`non-free`** | **no** | — | no |
| **`non-free-firmware`** | **no** | — | no — split out of `non-free` for bookworm |

`contrib` is the subtle one. A package there is itself perfectly free — but it *requires* something
that isn't, so shipping it in `main` would make `main` not self-contained. A free game engine whose
only data files are proprietary belongs in `contrib`.

```bash
apt-cache policy | head -20                 # which areas are actually enabled
apt list --installed 2>/dev/null | wc -l
```

Find out whether anything on your machine is non-free:

```bash
dpkg-query -W -f='${binary:Package} ${Section}\n' 2>/dev/null \
  | grep -E '^\S+ (non-free|contrib)' | head -20
```

## 20.5 The Constitution, and votes that settled real fights

> **Confidence: moderate-high.** The Debian Constitution was ratified in 1998 and has been amended
> several times since.

The Constitution defines the offices and, critically, the **appeal path**:

| Body | Role |
|---|---|
| **Debian Developers** | the electorate. **Ultimate authority**, via General Resolution. |
| **Debian Project Leader (DPL)** | elected annually; represents the project, delegates authority, spends the budget. **Cannot dictate technical decisions.** |
| **Technical Committee** | decides technical disputes between developers when they can't agree |
| **Project Secretary** | runs votes, interprets the Constitution |
| **General Resolution (GR)** | a project-wide vote. **Can overrule anyone, including the DPL and the Technical Committee.** |

Votes use the **Condorcet method** with a "further discussion" option, which means a proposal has to
beat "let's keep talking" to pass.

### Three GRs that actually decided something

**2006 — the GFDL.** Is documentation under the GNU Free Documentation License *free*, given that
it permits "invariant sections" you may not modify? Debian decided: **GFDL with invariant sections
fails DFSG §3**, and such documentation moved to `non-free`. This affected a lot of GNU manuals and
was genuinely unpopular in some quarters. The project applied its own test to its closest allies'
work and got an inconvenient answer.

**2014 — the default init system.** The Technical Committee voted for **systemd** over upstart for
Debian 8 (jessie). It was close, contested, and the chair's casting vote was involved. A subsequent
General Resolution on "init system coupling" followed, and the argument continued for years. Volume
6 covers the technical substance; the point here is that **there was a defined procedure, it was
followed, and there is a public record of who voted for what.**

**2022 — non-free firmware, and this one is on your laptop.** Historically Debian's official
installation media contained no non-free firmware. If your wifi chip needed a proprietary blob, the
installer couldn't see your wifi, and you had to go find the firmware on another machine — a genuinely
miserable first experience that Debian tolerated for years on principle.

In 2022 the project voted to **include non-free firmware on official installation media**, enabled by
default, starting with **Debian 12 (bookworm)** — and to create the separate `non-free-firmware`
archive area so this material is distinguishable from other non-free software.

> **Confidence: high** on the GR happening in 2022 and bookworm being the first release to ship it.

```bash
grep -o 'non-free-firmware' /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null | head -3
dpkg -l | grep -i firmware | head
```

**If your wifi worked out of the box, that vote is why.** A values-versus-pragmatism dispute,
settled by a documented ballot, visible in your `sources.list`, three years later.

## 20.6 Why any of this affects the packaging

Governance sounds like a topic for a different book. It isn't, because Debian's technical rules are
**written down and binding** in a way most distributions' aren't:

```bash
apt show debian-policy 2>/dev/null | head -12
ls /usr/share/doc/debian-policy/ 2>/dev/null
```

**Debian Policy** is a versioned, citable document that maintainers are required to follow. A
package violating it can be filed as a **release-critical bug** and kept out of the next stable
release. You have already relied on three of its clauses without knowing:

| Policy requires | You used it in |
|---|---|
| every package ships `/usr/share/doc/<pkg>/copyright` | Volume 1 §5.4 |
| every package ships `changelog.Debian.gz` | Volume 1 §5.4 |
| **no package may install into `/usr/local`** | Volume 3 §16.6 |
| FHS compliance | Volume 3 §16.3 |

That's the practical payoff of the governance: **the guarantees are enforceable because they're
written down, and they're written down because the project had to formalise how it decides
things.**

---

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

# Chapter 23 — `apt`, and Why Dependency Resolution Is Genuinely Hard

## 23.1 The hook

> **You type `apt install thunderbird`. Sixty seconds later, forty packages are installed in a
> workable order.**
>
> **That is not a lookup. It is a search of a constraint space that is, in the general case,
> NP-complete — and apt does it fast enough that you don't notice.**

## 23.2 THE PROBLEM: it really is that hard

Consider what apt is given: roughly 60,000 packages, each with version constraints, alternatives,
conflicts, and virtual packages, and a request like "install X." It must find a set of package
versions that:

- includes X
- satisfies **every** `Depends` of every selected package
- violates **no** `Conflicts` or `Breaks`
- keeps everything already installed still satisfied
- and, ideally, is minimal and doesn't remove things you wanted

**That is a satisfiability problem.** Watch it encode:

| Debian relationship | Boolean clause |
|---|---|
| `Depends: A \| B` | (A ∨ B) |
| `Depends: A, B` | (A) ∧ (B) |
| `Conflicts: C` | ¬C |
| `Depends: A (>= 2)` | (A₂ ∨ A₃ ∨ …) — one variable per available version |

You can build arbitrary boolean formulas out of those. Which means:

> **Deciding whether a package is installable is NP-complete**, by reduction from 3-SAT.
>
> **Confidence: moderate-high.** This was established formally by Mancinelli, Boender, Di Cosmo,
> Vouillon, Durak, Leroy and Treinen in "Managing the Complexity of Large Free and Open Source
> Package-Based Software Distributions" (ASE 2006), out of the EU-funded EDOS and later Mancoosi
> projects. The `dose3` toolchain came from that work and is still used for Debian archive quality
> assurance.

So apt is not doing a lookup. It is running a solver, on a graph with tens of thousands of nodes,
and it usually finishes before you've finished reading the prompt.

## 23.3 The relationship vocabulary

Debian has more relationship types than most systems, and the distinctions matter.

| Field | Meaning | Installed by default? |
|---|---|---|
| **`Pre-Depends`** | must be **fully configured before this package is even unpacked** | yes |
| **`Depends`** | must be configured before *this* is configured | yes |
| **`Recommends`** | "you almost certainly want this" | **YES on Debian** |
| **`Suggests`** | "this might be useful" | no |
| **`Enhances`** | reverse `Suggests` — declared by the *other* package | no |
| **`Breaks`** | cannot be **configured** simultaneously with the named version | — |
| **`Conflicts`** | cannot be **unpacked** simultaneously | — |
| **`Provides`** | declares a **virtual package** name | — |
| **`Replaces`** | takes over files previously owned by another package | — |

**`Pre-Depends` versus `Depends`** is the one people miss. Ordinary `Depends` only has to be
satisfied by *configure* time, so dpkg has latitude to unpack several packages then configure them
in order. `Pre-Depends` is stronger: the dependency must be **completely installed and configured
before this package is unpacked at all** — because its own `preinst` script needs it. It's
deliberately rare, since it constrains dpkg's ordering freedom.

```bash
grep -c '^Pre-Depends:' /var/lib/dpkg/status
awk '/^Package:/{p=$2} /^Pre-Depends:/{print p": "$0}' /var/lib/dpkg/status | head -5
```

**`Recommends` being installed by default is a Debian choice**, and it's why `apt install` sometimes
pulls in more than you expected:

```bash
apt-cache show bash | grep -E '^(Depends|Recommends|Suggests):'
sudo apt install --no-install-recommends <package>       # opt out for one install
```

To turn it off globally — think first, since many packages assume their Recommends are present:

```bash
cat /etc/apt/apt.conf.d/*recommends* 2>/dev/null
# echo 'APT::Install-Recommends "false";' | sudo tee /etc/apt/apt.conf.d/99norecommends
```

**`Provides` — virtual packages** — is how alternatives work. Nothing depends on `postfix`
specifically; things depend on `mail-transport-agent`, and several packages provide it:

```bash
apt-cache showpkg mail-transport-agent 2>/dev/null | head -20
apt-cache show exim4-daemon-light 2>/dev/null | grep -i provides
```

## 23.4 Inspecting the graph

```bash
apt-cache depends bash                 # what bash needs
apt-cache rdepends bash | head -20     # what needs bash  ← the scary one
apt-cache policy bash                  # installed version, candidate, and SOURCES
apt-cache show bash | head -20
```

`apt-cache policy` is the one to reach for when a package won't upgrade to the version you expect:

```bash
apt-cache policy
apt-cache policy bash
```

```
bash:
  Installed: 5.2.15-2+b7
  Candidate: 5.2.15-2+b7
  Version table:
 *** 5.2.15-2+b7 500
        500 http://deb.debian.org/debian bookworm/main amd64 Packages
        100 /var/lib/dpkg/status
```

Those numbers on the left are **pin priorities** (§23.7). `100` for `/var/lib/dpkg/status` means
"what's already installed," which is why apt won't gratuitously downgrade you.

**Why is this thing even installed?** The best tool for this is `aptitude`:

```bash
sudo apt install aptitude
aptitude why libssl3
aptitude why-not <package>
```

`aptitude why` prints the dependency chain from something you explicitly asked for down to the
package in question. It's the answer to "I never installed this, where did it come from?"

And apt's own record of what you asked for versus what came along for the ride:

```bash
apt-mark showmanual | head -20      # you asked for these
apt-mark showauto | wc -l           # these came as dependencies
apt autoremove --dry-run            # auto packages nothing needs any more
```

> **That manual/auto distinction is how `autoremove` works.** apt marks dependency-installed
> packages as `auto`; when nothing manual depends on them any more, they become removable. If
> `autoremove` wants to delete something you actually use, the fix is
> `sudo apt-mark manual <package>`, not to avoid `autoremove`.

## 23.5 Watching the solver work

```bash
apt-get -s install thunderbird              # SIMULATE — changes nothing
apt-get -s remove libc6                     # ← try this, and read the output
```

That second one is worth doing. `libc6` is depended on by nearly everything, so apt will propose
removing most of your system — and then, because the operation is dangerous, it demands you type a
sentence to confirm. **Simulate it; don't run it.**

When apt can't find a solution it says so, and the message is more informative than it first looks:

```
The following packages have unmet dependencies:
 foo : Depends: libbar (>= 2.0) but 1.5 is to be installed
E: Unable to correct problems, you have held broken packages.
```

"Held broken packages" usually means either a genuine archive inconsistency (rare on stable) or that
you've mixed suites (§24.5).

Two other angles:

```bash
apt-get -s -o Debug::pkgProblemResolver=true install <pkg> 2>&1 | head -40
aptitude install <pkg>       # offers ALTERNATIVE solutions interactively
```

**`aptitude`'s resolver is genuinely different from apt's** — it searches for multiple candidate
solutions and lets you step through them with `n` (next solution). When apt says "no," aptitude will
sometimes show you three ways forward and let you pick. That's the single best reason to have it
installed.

> **Confidence: moderate** on the current state of apt's own solver. Recent apt versions have gained
> a new solver implementation; the classic `pkgProblemResolver` heuristic is what most deployed
> systems still use. `apt --version` and the changelog will tell you what you have.

## 23.6 Repositories, and the signature chain

> **You just downloaded and executed root-privileged maintainer scripts (§21.6) from a server on the
> internet. Why is that not insane?**

Because of a chain of hashes with a signature at the top. Look at it:

```bash
ls /var/lib/apt/lists/ | head
```

```
deb.debian.org_debian_dists_bookworm_InRelease
deb.debian.org_debian_dists_bookworm_main_binary-amd64_Packages.lz4
security.debian.org_debian-security_dists_bookworm-security_InRelease
...
```

The structure:

```
   InRelease                    ← PGP-signed, in-line, by the Debian archive key
      │  contains:
      │    Suite, Codename, Date, VALID-UNTIL
      │    SHA256 hashes of every Packages / Sources / Contents file
      ▼
   Packages                     ← one stanza per package
      │  contains:
      │    Filename: pool/main/h/hello/hello_2.10-3_amd64.deb
      │    Size, SHA256 of THAT .deb
      ▼
   hello_2.10-3_amd64.deb       ← verified against the hash above
```

**One signature, at the top, transitively covers every package in the archive.** apt verifies the
signature on `InRelease`, then checks each downloaded file against the hash chain. A tampered `.deb`
fails its hash; a tampered `Packages` fails the `InRelease` hash; a tampered `InRelease` fails the
signature.

```bash
head -20 /var/lib/apt/lists/*bookworm_InRelease 2>/dev/null
grep -A2 -m1 '^Package: bash$' /var/lib/apt/lists/*_main_binary-amd64_Packages* 2>/dev/null | head
```

**`Valid-Until` matters more than it looks.** Without it, an attacker who can intercept your traffic
could serve you an old-but-correctly-signed package list forever, freezing you on versions with
known vulnerabilities. The expiry means apt refuses stale metadata:

```bash
grep -E '^(Date|Valid-Until):' /var/lib/apt/lists/*InRelease 2>/dev/null | head -4
```

That's also why a machine that's been off for months complains about release files being expired
before it will upgrade.

### Keys, and why `apt-key` was removed

```bash
ls /etc/apt/trusted.gpg.d/
ls /usr/share/keyrings/
```

The old mechanism was `apt-key add`, which put a key in a **global** trusted set. The flaw is
structural: **a key added to trust one third-party repository could then validly sign packages for
any repository, including Debian's own.** Add a vendor's key for their one utility, and that vendor
can now silently replace your `libc6`.

The replacement scopes each key to the repository it belongs to, via **`Signed-By:`**:

```
Types: deb
URIs: https://example.com/apt
Suites: stable
Components: main
Signed-By: /usr/share/keyrings/example-archive-keyring.gpg
```

> **Confidence: high** that `apt-key` is deprecated and removed from current Debian, and that
> `Signed-By` scoping is the recommended approach.
>
> **The practical rule: when a vendor's install instructions tell you to run `apt-key add`, they are
> out of date, and you should be scoping their key with `Signed-By` instead.**

## 23.7 `sources.list`, deb822, and pinning

Two syntaxes, both supported:

**One-line (classic):**
```
deb [arch=amd64 signed-by=/usr/share/keyrings/foo.gpg] http://deb.debian.org/debian bookworm main contrib
```

**deb822 (`.sources` files) — clearer, and what Debian is moving toward:**
```
Types: deb
URIs: http://deb.debian.org/debian
Suites: bookworm bookworm-updates
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
```

```bash
cat /etc/apt/sources.list 2>/dev/null
cat /etc/apt/sources.list.d/*.sources 2>/dev/null
```

> **Confidence: moderate-high** that deb822 is supported in Debian 12 and increasingly the default
> in newer installers. Your own files are the answer.

### Pinning

`/etc/apt/preferences.d/` lets you override which version apt prefers:

```
Package: *
Pin: release a=bookworm-backports
Pin-Priority: 100
```

| Priority | Effect |
|---|---|
| **< 0** | never install |
| 1–99 | install only if the package isn't installed at all |
| 100–499 | install unless a higher-priority source has it |
| **500** | the default for a normal release |
| 990 | the target release (`apt -t`) |
| **> 1000** | allow **downgrades** |

```bash
apt-cache policy
apt-config dump | grep -i default-release
```

> **The warning that belongs here.** Mixing suites — putting `unstable` in your `sources.list`
> alongside `stable` and pinning your way out of trouble — is known in Debian circles as a
> **"FrankenDebian,"** and it is the single most common way people break an otherwise reliable
> system. Packages from `unstable` pull in a newer `libc6`, which pulls in a newer everything, and
> you have silently upgraded to `unstable` one dependency at a time.
>
> If you need one newer package, in order of preference: **backports** (§24.4), a Flatpak, a
> container, or building it yourself into `/usr/local` (Volume 3 §16.6). Pinning `unstable` is the
> last resort and it is not a resort.

---

# Chapter 24 — Stable, Testing, Unstable: The Trade-off You Chose

## 24.1 The hook

> **Debian stable ships software that is often two years old, and this is presented as a feature.**
>
> **Meanwhile "unstable" is what most Debian developers run on their own laptops, every day,
> without incident.**
>
> **Both of those are true, and neither means what it sounds like.**

## 24.2 THE PROBLEM: you cannot have all three

Any distribution wants three things:

1. **Current software** — you get upstream's latest features and fixes
2. **Everything works together** — 60,000 packages, mutually consistent, tested as a set
3. **It doesn't change under you** — the machine behaves in March the way it did in January

**You can have any two.** Rolling releases pick 1 and 2 and give up 3. A frozen snapshot picks 2 and
3 and gives up 1.

Debian's answer is unusual: **run all three simultaneously as separate suites, and let packages flow
between them.**

## 24.3 THE MECHANISM: four suites and a conveyor belt

```
   ┌──────────────┐
   │ EXPERIMENTAL │  a staging area, NOT a distribution. Things too disruptive
   └──────┬───────┘  for unstable. Never installed by accident.
          │  (manual, by the maintainer)
          ▼
   ┌──────────────┐
   │   UNSTABLE   │  codename SID — permanently. Every new upload lands here.
   │    (sid)     │  Broken for a few hours at a time. No security team.
   └──────┬───────┘
          │  AUTOMATIC migration, if the rules below are met
          ▼
   ┌──────────────┐
   │   TESTING    │  what the next stable will be built from.
   └──────┬───────┘  Mostly works. See §24.5 for the security catch.
          │  FREEZE → fix release-critical bugs → RELEASE
          ▼
   ┌──────────────┐
   │    STABLE    │  frozen. Only security fixes and critical corrections.
   └──────────────┘  Full support ~3 years, then LTS.
```

**Migration from unstable to testing is automatic and rule-based**, run by a script the project calls
*britney*. A package moves when:

- it has been in unstable for a **minimum age** — roughly 10 days at normal urgency, fewer if the
  upload is marked more urgent
- it has **no new release-critical bugs** relative to the version already in testing
- it has **built successfully on all release architectures**
- **all its dependencies are satisfiable** in testing
- **it doesn't break** anything already in testing

> **Confidence: moderate-high** on the mechanism and the britney name; **moderate** on the exact day
> counts, which have been tuned over the years.

That last two rules are why migration is not per-package: a library and the twenty things that
depend on it must migrate **together**, as a set, or not at all. Which is exactly §23.2's constraint
problem, running continuously, on the whole archive.

**The freeze** is when testing stops accepting new versions, developers fix the remaining
release-critical bugs, and the result becomes the next stable. Debian releases **when the bugs are
fixed**, not on a date — the project's long-standing (and occasionally exasperating) position.

```bash
cat /etc/debian_version
grep -h -oE '(bookworm|trixie|bullseye|sid|stable|testing|unstable)' \
  /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null | sort -u
apt-cache policy | head
```

### The codenames, which are not random

Every Debian release is named after a **Toy Story** character. **Bruce Perens** — the Project Leader
who wrote the Social Contract and the DFSG (§20.3) — **worked at Pixar.**

> **Confidence: high** on both the Toy Story convention and Perens's Pixar connection.

| Version | Codename | | Version | Codename |
|---|---|---|---|---|
| 1.1 | buzz | | 8 | jessie |
| 1.2 | rex | | 9 | stretch |
| 1.3 | bo | | 10 | buster |
| 2.0 | hamm | | 11 | bullseye |
| 2.1 | slink | | **12** | **bookworm** |
| 2.2 | potato | | **13** | **trixie** |
| 3.0 | woody | | 14 | forky (planned) |
| … | … | | — | **sid** — *always* unstable |

**`sid` never becomes a release.** In Toy Story, Sid is the boy next door who breaks toys. It's also
backronymed "Still In Development." Unstable is permanently `sid`, which is why the symlink
`unstable → sid` never moves.

> **Confidence: moderate** on which release you're running — Debian 13 (trixie) succeeded bookworm,
> and depending on when you installed you may have either. `cat /etc/debian_version` is the answer.

## 24.4 The suites you also have, and probably didn't notice

Your `sources.list` has more than one line, and they're not decoration:

| Suite | For | Enabled by default? |
|---|---|---|
| `bookworm` | the release itself | yes |
| **`bookworm-security`** | **security fixes**, served from `security.debian.org` | **yes** |
| **`bookworm-updates`** | things that must change between point releases — **timezone data**, virus signatures, spam rules | yes |
| `bookworm-backports` | packages from testing, **rebuilt against stable** | **no — opt in** |
| `bookworm-proposed-updates` | staging for the next point release | no |

**Backports are the sanctioned answer to "I need a newer version of one thing."** They're built
against stable's libraries, so they don't drag in a new `libc6`, and they're **opt-in per package**:

```bash
# add the backports line, then:
apt-cache policy -t bookworm-backports <package>
sudo apt install -t bookworm-backports <package>
```

Note the `-t`. Without it, backports are pinned low and won't be selected — which is the design.
Adding the repository does **not** upgrade anything.

**Point releases** (12.1, 12.2, …) happen every couple of months and roll up accumulated security
and important fixes. They do not change versions or add features:

```bash
cat /etc/debian_version        # e.g. 12.5
```

## 24.5 The counterintuitive part: testing is less secure than stable

This surprises everyone, and it's worth stating plainly because people choose testing *for* security
reasons.

| Suite | Who fixes security issues | How fast |
|---|---|---|
| **stable** | the **Debian Security Team**, via `security.debian.org` | **dedicated, prioritised, often same-day** |
| **unstable** | the package maintainer, by normal upload | usually fast, but unsupported and no guarantee |
| **testing** | fixes arrive **only by migrating from unstable** | **slowest of the three** |

A security fix is uploaded to unstable. It then has to satisfy §24.3's migration rules — minimum
age, all architectures built, no new RC bugs — before it reaches testing. **That can be days, and
during a freeze it can be much longer.** There is a testing-security effort, but it is explicitly
best-effort and far less resourced than the stable team.

> **So the ranking for "how quickly do I get a security fix" is: stable, then unstable, then
> testing.**
>
> **Confidence: moderate-high.** This is the long-standing position stated in Debian's own security
> FAQ, and the mechanism above explains why it must be true.

**Which suite should you run?**

| If you… | Use |
|---|---|
| have a server, or want the machine to behave the same next month | **stable**, plus backports for the two things you need newer |
| want newer desktop software and can tolerate occasional breakage | **testing**, and accept the security caveat |
| are a Debian developer, or want the newest and can fix your own machine | **unstable** — and install `apt-listbugs` first |
| want stable's reliability and one modern application | **stable + Flatpak**, or a container |

> On a fresh single-user laptop, **stable plus backports** is almost always the right answer, and
> "my desktop environment is a year old" is a much smaller problem than "my machine broke during an
> upgrade and I don't yet know how to fix it."

## 24.6 Building from source, and when not to

> **THE PROBLEM.** You need a version that isn't packaged, or a compile-time option that isn't
> enabled, or a patch that hasn't been accepted.

### What you lose

Before the how, the why-not, because it's the part people skip:

| You give up | Consequence |
|---|---|
| **Security updates** | nobody will tell you your build is vulnerable. **This is the big one.** |
| Dependency tracking | apt doesn't know your build exists, and may remove a library it needs |
| Clean removal | `make install` has no `make uninstall` on many projects |
| Reproducibility | six months later you won't remember which flags you used |

So the ladder, best to worst:

1. **It's in stable.** Install it.
2. **It's in backports.** `apt -t bookworm-backports install`.
3. **A Flatpak or container exists.** Isolated, updatable, removable.
4. **Build it into `/usr/local`** (Volume 3 §16.6) — no package will collide, and `$PATH` prefers it.
5. **Build a proper `.deb`.** More work, but you get dependency tracking and clean removal.
6. **`make install` into `/usr`.** Don't. You are now fighting dpkg over file ownership.

### Getting Debian's source

Debian ships the source for everything, and it's one command away — you need `deb-src` lines
enabled:

```bash
# in sources.list, add a matching:  deb-src http://deb.debian.org/debian bookworm main
sudo apt update
mkdir -p ~/src && cd ~/src
apt source hello
sudo apt build-dep hello        # install everything needed to build it
cd hello-*/
ls debian/
```

The `debian/` directory **is** the packaging, and it's worth reading once:

| File | What it is |
|---|---|
| **`control`** | source and binary package metadata; the `Build-Depends` live here |
| **`rules`** | **an executable Makefile** with `build`, `binary`, `clean` targets. Modern ones are three lines using `dh`. |
| **`changelog`** | **the version comes from here**, not from `control`. Format is strictly parsed. |
| **`copyright`** | machine-readable DEP-5 format — this is the Policy-mandated file from Volume 1 §5.4 |
| **`patches/`** + **`patches/series`** | **quilt** patches applied to upstream source at build time |
| `install`, `dirs`, `docs` | which built files go into which binary package |
| `watch` | how to find new upstream releases automatically |

```bash
cat debian/control
cat debian/rules
head -20 debian/changelog
ls debian/patches/ 2>/dev/null && cat debian/patches/series 2>/dev/null
```

**Look at `debian/patches/` on a package that has some** — this is the discipline Chapter 25's
incident produced:

```bash
cd ~/src && apt source openssl 2>/dev/null && cd openssl-*/ && \
  cat debian/patches/series | head -20 && head -25 debian/patches/*.patch | head -40
```

Every patch carries a **DEP-3 header** documenting what it does, where it came from, and whether
it's been sent upstream:

```
Description: Fix FTBFS on hurd-i386
Origin: upstream, https://github.com/example/commit/abc123
Bug-Debian: https://bugs.debian.org/123456
Forwarded: https://github.com/example/pull/456
Author: Some Maintainer <them@debian.org>
Last-Update: 2024-01-15
```

> **Confidence: moderate-high** on DEP-3 being the standard patch header format. Read §25 and then
> come back to that `Forwarded:` field — its existence is not an accident.

### Building it

```bash
cd ~/src/hello-*/
dpkg-buildpackage -us -uc -b        # -us -uc: don't sign;  -b: binary only
ls ../*.deb
sudo apt install ../hello_*.deb
```

You now have a `.deb` you built, installed through apt, tracked by dpkg, and removable with
`apt purge`. That's genuinely better than `make install`, and it took one command more.

**And the lazy middle ground**, for upstream software with no Debian packaging:

```bash
sudo apt install checkinstall
./configure --prefix=/usr/local && make
sudo checkinstall            # runs `make install` and records what it touched into a .deb
```

`checkinstall` produces a crude package — no proper dependencies, no policy compliance — but it
means you can `apt remove` it later instead of hunting files by hand. For a one-off build that's
usually the right trade.

---

# Chapter 25 — The Incident: Two Lines, Twenty Months, Every Key

## 25.1 The hook

> **In May 2008, Debian announced that every cryptographic key generated on a Debian or
> Debian-derived system for the previous twenty months might be one of about 32,768 possible keys.**
>
> **Not weak. Not guessable-with-effort. *Enumerable* — the complete set could be, and within days
> was, precomputed and published.**
>
> **The cause was a two-line change made by a maintainer acting in good faith, who asked upstream
> first.**

## 25.2 What happened

> **Confidence: high** on the CVE, the DSA, the date, the discoverer, the duration, and the
> mechanism. **Moderate** on the exact function names and the precise content of the upstream
> mailing-list exchange, which I am recounting rather than quoting.

| | |
|---|---|
| **CVE** | CVE-2008-0166 |
| **Debian advisory** | DSA-1571-1 |
| **Announced** | **13 May 2008** |
| **Introduced** | Debian's `openssl` package around **September 2006** |
| **Duration** | roughly **20 months** |
| **Discovered by** | **Luciano Bello**, a Debian developer in Argentina |
| **Affected** | Debian, Ubuntu, and every derivative, plus **any key generated on them and deployed anywhere else** |

### The change

A Debian maintainer was running Debian's OpenSSL build under **Valgrind** — a memory-error
detector — as part of ordinary quality work. Valgrind reported reads of **uninitialised memory**.

Those reads were real, and they were **deliberate on OpenSSL's part.** OpenSSL's random number
generator mixed the contents of an uninitialised buffer into its entropy pool, on the theory that
whatever garbage happened to be in that memory was a free extra source of unpredictability.

That is a **dubious practice** — the entropy contribution is unquantifiable, and it makes every
memory-checking tool scream — but it was intentional.

The maintainer **asked upstream about it**, on the `openssl-dev` mailing list, before changing
anything. The reply he received was, in substance, that if removing those lines helped with
debugging then it was fine to do so.

**Nobody upstream looked at the actual patch.** The question was asked in general terms; the answer
was given in general terms; the specific diff was never reviewed by anyone who understood the RNG.

Two lines were commented out. **One of them was harmless.** The other was in the code path that fed
**all** the genuine entropy — process state, timing, `/dev/urandom` — into the pool.

### The consequence

With that line gone, essentially the only remaining input to the seed was the **process ID**.

```
   entropy actually mixed in  =  PID
   possible PIDs on Linux     =  1 .. 32768        (default kernel pid_max)
   ────────────────────────────────────────────────────────────────────
   distinct keys generatable  ≈  32,768 per (key type × key size × architecture)
```

Check the number that mattered on your own machine:

```bash
cat /proc/sys/kernel/pid_max
```

**32,768 possibilities is not a large search space.** Researchers precomputed the *complete set* of
affected SSH host keys, SSH user keys and SSL certificate keys within days of disclosure, and
published them. Breaking an affected key was not cryptanalysis — it was a table lookup.

### The blast radius, and the part people miss

Everything that used OpenSSL's PRNG on an affected system was compromised:

- **SSH host keys** — every affected server's identity, so man-in-the-middle attacks became trivial
- **SSH user keys** — every `ssh-keygen` run in that window
- **SSL/TLS certificate private keys** — including certificates signed by real CAs, which then had
  to be revoked en masse
- **OpenVPN keys**, **DNSSEC keys**, anything else generated with the affected library

> **And this is the detail most summaries omit: the flaw travelled with the *key*, not the
> *machine*.** A developer who generated an SSH key on their Debian laptop and installed the public
> half on a Solaris server, an OpenBSD router, or a network appliance had **just made that machine
> vulnerable too**, permanently, until the key was replaced. The affected systems were a superset of
> the affected distributions, and there was no way to enumerate them.

### Debian's response

Given Social Contract §3 — *"We will not hide problems"* (§20.3) — Debian had committed in advance to
handling this the hard way. It published a detailed advisory explaining exactly what went wrong, and
shipped **detection tooling**: `openssh-blacklist` and `openssl-blacklist` packages containing
fingerprints of the compromised keyspace, and an `ssh-vulnkey` command to test a key.

```bash
apt-cache search vulnkey blacklist 2>/dev/null | grep -i -E 'ssh|ssl'
dpkg -l | grep -i blacklist
```

You will almost certainly find nothing — the packages were retired once the transition was done.
That absence is the correct outcome.

## 25.3 Five things this teaches, and none of them is "that maintainer was careless"

The consensus assessment at the time, and since, is that this was a **systemic** failure. The
maintainer was doing legitimate quality work, spotted a genuine code smell, and **consulted
upstream before acting** — which is more diligence than most patches receive. The process around him
failed. That's the useful reading, and it's the one that generalises.

**1. Distribution patching is a security boundary, and an under-guarded one.**

Debian patches upstream software heavily, for good reasons — FHS compliance (Volume 3 §16.3), build
hardening, cross-architecture fixes, licensing. Every patch is **a change to someone else's code,
reviewed by fewer people than the original, and never seen by upstream unless someone sends it
there.** For most packages the risk is a build failure. For cryptographic code it's this.

```bash
cd ~/src && apt source openssl 2>/dev/null && ls openssl-*/debian/patches/ | head -20
```

**2. Asking a question is not the same as getting a review.**

He asked. The venue was a busy general mailing list, the question was framed in general terms, and
the answer addressed the general practice rather than the specific change. **Nobody read the diff.**
The modern discipline that came out of this class of failure is visible in every Debian package
today: quilt-managed patches with **DEP-3 headers** that must record `Origin:`, `Bug:`, and —
crucially — **`Forwarded:`**, i.e. *has upstream actually seen this?*

**3. Silencing a warning is not the same as fixing a bug.**

The uninitialised-memory read genuinely was bad practice, and OpenSSL should not have been doing it.
But "make the warning stop" and "fix the underlying problem" are different tasks, and here the first
was performed on the wrong line. **When a tool complains about security-critical code, the correct
output is a conversation with someone who understands that code — not a smaller diff.**

**4. Entropy failures are completely silent.**

This is the property that made twenty months possible. The keys **worked**. SSH connected. TLS
negotiated. Certificates validated. Every test passed, because there is no test for "this key came
from a small space" unless you already know the specific defect. Compare Volume 3 §19's ext4
incident — also silent, also invisible until a specific trigger. **Failures that produce correct-
looking output are the expensive ones.**

```bash
# what generates your randomness now
ls -l /dev/random /dev/urandom
cat /proc/sys/kernel/random/entropy_avail
man 2 getrandom | head -20
```

Modern kernels seed a CSPRNG from many independent sources — interrupt timing, hardware RNG where
present, seed files across reboots — and `getrandom(2)` is the interface that blocks until it's
properly seeded rather than silently returning weak output. Much of the hardening around
"is the pool actually initialised yet?" descends from this era.

**5. This is a large part of why Debian cares about reproducible builds.**

If the shipped binary can be independently rebuilt bit-for-bit from the published source, then
anyone can verify that the binary corresponds to the source everyone reviewed. It doesn't catch a
bad patch — the patch was in the public source too — but it closes the adjacent question of whether
the binary matches the source at all. Debian has led that work since roughly 2013.

> **Confidence: high** that Debian leads the Reproducible Builds effort; **moderate** on 2013 as the
> start date.

> **The pattern, and it is now the fourth time in this book.** Volume 1 §7 (Shellshock, and Steam's
> empty variable), Volume 2 §13 (Baron Samedit), Volume 3 §19 (ext4's write-that-wasn't), and now
> this. Every one is the same shape: **an assumption about what something guaranteed, which it never
> actually did — and code that behaved perfectly right up until it mattered.**
>
> Here the assumption was that removing a line flagged by a memory checker couldn't affect
> correctness. It was a reasonable assumption. It was wrong in the one place where being wrong was
> unrecoverable.

---

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

# Volume 4 Retrospective

**1. Debian's governance is not trivia; it's why the packaging has guarantees.** A written Social
Contract, the DFSG, and a Constitution with a defined appeal path mean Debian Policy is
**enforceable** — which is why every package really does ship a `copyright` file, really does obey
the FHS, and really does stay out of `/usr/local`. And the DFSG, with the Debian references removed,
**is** the Open Source Definition.

**2. Your `sources.list` is a philosophical document.** `main` / `contrib` / `non-free` /
`non-free-firmware` are DFSG verdicts, not categories of convenience. And if your wifi worked on
first boot, that's a 2022 General Resolution, visible on your disk.

**3. `dpkg` knows everything about one package and nothing about the internet.** Feed it an
unsatisfiable dependency and it unpacks the files, refuses to configure, and parks the package in
state `iU`. That half-state **is** the argument for apt.

**4. The dpkg database is plain text you can grep**, and `dpkg -S` is a search of `.list` files. An
unfashionable choice that means you can inspect and repair the state by hand when things go wrong.

**5. Debian will not silently overwrite your config files**, because it stored an MD5 of every one
at install time and compares three versions on upgrade. That's what the `rc` state means, and it's
why the modified-conffile audit in TRY THIS #3 is possible at all.

**6. A `.deb` is three files in an `ar` archive, in a mandated order**, so tools can read a
package's identity and dependencies from its first few kilobytes. Which also means you can — and for
anything from outside the archive, should — read a package's maintainer scripts before letting them
run as root.

**7. Dependency resolution is NP-complete**, by reduction from 3-SAT, and apt runs a solver over
tens of thousands of packages fast enough that you don't notice. `Recommends` being installed by
default is a Debian choice; `Pre-Depends` versus `Depends` is about unpack ordering; `aptitude why`
is the tool nothing else replaces.

**8. Testing is less secure than stable**, which is the opposite of what most people assume.
Security fixes reach stable through a dedicated team and reach testing only by migrating from
unstable on the ordinary schedule. Stable plus backports is almost always the right answer.

**9. One signature covers the whole archive**, through a hash chain from `InRelease` to `Packages`
to each `.deb`, with `Valid-Until` preventing freeze attacks. And `apt-key` was removed because a
key added for one vendor could validly sign for **all** repositories — `Signed-By` scopes it
properly.

**10. The 2008 OpenSSL disaster was a process failure, not a careless individual.** A maintainer
doing legitimate quality work removed a line flagged by a memory checker, having asked upstream
first — and nobody read the diff. Twenty months of keys drawn from 32,768 possibilities, silently,
because entropy failures produce output that looks perfectly correct. **The flaw travelled with the
key, not the machine**, so the affected population was never enumerable.

---

# Volume 4 is ready

**File: `volume-4-package-management.md`**

## What Volume 5 will cover: NETWORKING

Volume 4 downloaded packages over the internet, verified signatures, and talked about
`security.debian.org` without ever explaining what any of that means at the wire level. Volume 5
starts from the beginning.

- **A full end-to-end trace**: what actually happens between typing a URL and seeing a page — DNS
  resolution (including what `systemd-resolved` and `/etc/nsswitch.conf` do on Debian), ARP, the TCP
  handshake, TLS, and the HTTP request. Built as **one continuous trace you can follow with real
  tools**, not a list of protocols.
- **`ip`, `ss`, `ping`, `curl`, `dig`** — inspecting your own machine's actual network state, and
  why `ifconfig` and `netstat` are deprecated on Debian in favour of the `iproute2` suite.
- **Sockets and ports at the kernel level** — what "listening on port 80" concretely *is*, building
  directly on Volume 3 §14's socket exception and Volume 3 §18's file descriptors. You'll find every
  listening socket on your machine and identify the process behind each one.
- **SSH**: the security-driven origin story (Tatu Ylönen and a 1995 password sniffing incident at
  Helsinki University of Technology), why it displaced telnet and rsh so completely, and key-based
  authentication explained **from the asymmetric cryptography underneath** rather than as a recipe.
  Volume 4 §25's weak keys will make a great deal more sense afterwards.
- **The incident**: a verified case where plaintext protocols or an SSH-specific flaw caused real
  harm — researched and checked rather than assumed, as with the OpenSSL story.
- **TRY THIS ON YOUR MACHINE** — including watching your own DNS queries on the wire, finding what's
  listening and why, and inspecting an SSH key's actual mathematical structure.

Say **continue** when you'd like Volume 5.
