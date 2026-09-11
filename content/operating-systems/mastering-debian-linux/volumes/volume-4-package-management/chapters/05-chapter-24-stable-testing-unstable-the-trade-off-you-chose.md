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

