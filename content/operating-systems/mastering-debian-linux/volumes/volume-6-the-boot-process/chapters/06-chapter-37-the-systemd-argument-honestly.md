# Chapter 37 — The systemd Argument, Honestly

Volume 4 §20.5 mentioned the 2014 Technical Committee vote and the General Resolutions, and promised
the substance here. This chapter is that promise. It is a genuinely interesting engineering *and*
governance dispute, and it deserves better than either of the two caricatures — "obviously correct
modernisation" and "corporate takeover of Linux."

## 37.1 The timeline

> **Confidence: moderate-high** on the sequence; **moderate** on the vote details, which I flag
> individually.

| When | What |
|---|---|
| **2010** | systemd announced by **Lennart Poettering** and **Kay Sievers**, both then at Red Hat |
| 2011 | **Fedora 15** — first major distribution to adopt it |
| 2012 | **udev is merged into the systemd source tree** — §37.3, objection 3 |
| **Feb 2014** | **Debian's Technical Committee votes for systemd** over upstart for jessie. Reported as **4–4, decided by the chair's casting vote** (Bdale Garbee). *(Confidence: moderate on the exact split.)* |
| **Nov 2014** | **General Resolution on "init system coupling"**, proposed by Ian Jackson — asking whether Debian should *require* packages to work without systemd. **"Further discussion" won**, so the GR did not pass and the TC decision stood. *(Confidence: moderate.)* |
| 2014 | **Ian Jackson resigns from the Technical Committee.** *(Confidence: moderate-high.)* |
| 2014–15 | **Devuan** forks from Debian, specifically to be systemd-free |
| 2015 | **Debian 8 (jessie)** ships with systemd as default |
| **Dec 2019** | Second GR, on **"init system diversity."** Several options; the winning position was roughly *"systemd is the default, and we support exploring alternatives."* *(Confidence: moderate — I would check the Debian vote page before quoting the option letter or exact wording.)* |

```bash
apt show debian-policy 2>/dev/null | head -5
# and the votes themselves are public record at www.debian.org/vote/
```

**Two things about that timeline are worth noticing before the arguments.**

First: **the process worked as designed.** A dispute went to the Technical Committee, the TC decided,
the decision was appealed via General Resolution as the Constitution permits, the GR failed, and the
decision stood. Volume 4 §20.5's governance machinery, exercised on the hardest question the project
had faced. You can read every ballot.

Second: **it was close.** A 4–4 tie broken by a casting vote is not a mandate. Anyone describing this
as an obvious decision that only cranks opposed is misrepresenting the record.

## 37.2 What both sides agreed on

It's easy to forget that §36.2's failures were not in dispute. Essentially nobody defended:

- PID-file supervision (Failure 3)
- serial startup dominated by waiting (Failure 1)
- 150 lines of bash per service (Failure 5)

**The argument was never "SysVinit is fine."** It was about whether systemd's *particular* answer —
its scope, its coupling, and its governance — was the right price for fixing them.

## 37.3 The objections, steelmanned

I'm going to state each as strongly as I can, then respond, then give my honest read. Some of them
are much better than others and I'll say which.

### Objection 1 — Scope, and the coupling that follows

**The case.** systemd did not stay an init system. Over a decade it absorbed:

| Function | Component |
|---|---|
| init and service supervision | `systemd` |
| logging | `journald` |
| **device management** | **`udev`** |
| login and session management | `logind` |
| DNS resolution | `resolved` |
| time synchronisation | `timesyncd` |
| network configuration | `networkd` |
| containers | `nspawn` |
| boot loading | `systemd-boot` |
| scheduled jobs | `.timer` units |
| home directories | `homed` |

**The objection is not "these are bad."** It's that **one project, with one upstream, one release
cadence and one set of maintainers, now controls a large fraction of the base system** — and that the
components increasingly assume each other's presence. Downstream distributions and alternative
implementations progressively lose the ability to choose per-component.

**The response.** They are separate binaries, most are optional, and Debian demonstrably ships
without `resolved`, `networkd` and `timesyncd` (§36.8, verified by the `is-active` check). Shared
code and shared interfaces reduce duplication and bugs.

**My honest read: the response is factually correct and does not answer the objection.** The
objection is about *governance and coupling trajectory over time*; the response is about *the current
binary layout*. Both statements are true and they're about different things. Ten years on, Debian
does still ship without half of it — which is evidence for the response — while writing software that
works on both systemd and non-systemd systems has become genuinely unusual — which is evidence for
the objection.

### Objection 2 — "Do one thing well"

**The case.** systemd violates the Unix philosophy of small composable tools.

**The response.** The Unix philosophy is about composable *tools operating on streams*. An init
system is not a tool — it is a **supervisor with irreducibly global state**, which is exactly the
category the philosophy doesn't cover. And the argument proves far too much: `sendmail`, X11,
`bash`, and the Linux kernel itself were never "one thing well."

**My honest read: this is the weakest of the objections**, and I think it should be retired. It's an
aesthetic preference presented as a technical principle, and when pressed it usually turns into
Objection 1 or 3, both of which are better arguments. I'd rather say that than pretend all six are
equally strong.

### Objection 3 — udev, and this one is strong

**The case.** `udev` was an independent project used by everyone. Around 2012 it was **merged into
the systemd source tree** and became progressively harder to build standalone. Distributions that
didn't want systemd had no choice but to **fork it** — which Gentoo did, producing **eudev**.

**This is a concrete, documented case of coupling removing someone else's options**, with a real fork
as the evidence. It isn't a prediction; it happened.

**The response.** Sharing code between udev and systemd genuinely reduced duplication, and the
maintainers were under no obligation to support a standalone build they didn't use.

**My honest read: the objection is largely correct.** It's the strongest concrete instance of
Objection 1, and "we weren't obliged to" is an accurate statement about obligations that concedes
the substance. **Confidence: high** that udev was absorbed and that eudev exists as a consequence.

### Objection 4 — Binary logs

**The case.** journald's format is binary. You cannot `grep` a journal file, you cannot `tail` it
with standard tools, and corruption can render a segment unreadable rather than partially readable.
Thirty years of log-processing tooling stops applying.

**The response.** The format is documented, `journalctl` provides indexed structured queries that
`grep` cannot (§36.7), the trusted `_`-prefixed fields are a real security gain, and journald can
forward everything to syslog.

**My honest read: the complaint is real and, on Debian specifically, largely defused** — because
Debian runs `rsyslog` alongside journald by default (§36.8, verified), so `/var/log/syslog` still
exists and every traditional tool still works. Debian hedged, and the hedge worked. On a
distribution that ships journald alone, the objection has more force.

### Objection 5 — PID 1 is much larger now

**The case.** More code in PID 1 means more attack surface and more ways to make a system
unrecoverable, because **a crash in PID 1 is a kernel panic.** systemd's PID 1 is vastly larger than
SysVinit's.

And there are concrete instances. **CVE-2021-33910** (Qualys, July 2021) was a stack exhaustion in
systemd's unit-name escaping, reachable via a very long mount point path, which **crashed PID 1 and
therefore panicked the kernel** — a local denial of service.

> **Confidence: moderate-high** on that CVE and its mechanism.

**The response.** A great deal of the functionality lives in helper daemons, not PID 1. And
SysVinit's tiny PID 1 did not prevent init *scripts* — running as root, in shell — from being a
substantial security surface.

**My honest read: real, and partially mitigated.** PID 1 is still much bigger than it was, the
consequences of a bug in it are still worse than for any other process, and there have been real
CVEs. The counter-argument is fair but doesn't make the concern go away.

### Objection 6 — How the disagreement was conducted

**The case.** systemd's upstream acquired a reputation for dismissiveness toward bug reports and
downstream concerns. That's a social objection rather than a technical one, but it materially
affected how the project was received, and it made some distributions' maintainers reluctant to
depend on it.

**And the necessary other half**, which any honest account has to include: **the systemd developers
received an extraordinary volume of abuse over this, including death threats.** Poettering has
written publicly about it.

**My honest read: both things are true, and reporting only one is dishonest.** A technical dispute
became genuinely toxic, in both directions, and that poisoned the discussion for years. It also means
a lot of what was written about systemd between 2012 and 2016 is worthless as technical analysis and
should be read with that in mind — including some of the material still circulating today.

## 37.4 What actually happened

Ten years on, the record is clear enough to check the predictions.

**systemd won essentially universally.** Debian, Ubuntu, Fedora, RHEL, SUSE, Arch, openSUSE. The
holdouts are deliberate — Devuan, Alpine (which uses OpenRC and musl), Gentoo (which offers both),
and Void.

```bash
ps -p 1 -o comm=
```

**What the critics got right:**

- **Coupling increased.** Writing software that works on both systemd and non-systemd systems is now
  a specialist activity. Some software hard-depends on systemd interfaces.
- **udev really did have to be forked** (Objection 3).
- **PID 1 bugs really did panic kernels** (Objection 5).
- **The scope really did keep expanding** — `homed` and `systemd-boot` came *after* the 2014
  argument, so "it will keep absorbing things" was a correct prediction rather than a slur.

**What the critics got wrong:**

- **Debian did not become unusable without systemd.** Devuan works. `sysvinit-core` is still
  installable (§36.8, verified in the packaging).
- **The predicted catastrophic instability didn't arrive.** systemd is, on the whole, reliable.
- Debian **did** retain per-component choice for the optional daemons, and still exercises it
  (§36.8's `is-active` check).

**What the advocates got right:**

- **Boot times improved dramatically**, and `systemd-analyze critical-chain` (§36.3) makes the
  remaining cost measurable rather than mysterious.
- **The cgroup supervision argument was correct and is now uncontroversial** (§36.5). This is the
  strongest vindication: it solved a real problem that had no in-place fix, and Volume 2 §12.2's
  PID-reuse hazard is simply gone for managed services.
- **Declarative units are better than 150 lines of bash.** Almost nobody disputes this any more.
- **Socket activation was genuinely novel** in mainstream Linux (§36.4) and removes dependencies
  rather than merely satisfying them.

## 37.5 An honest assessment

> **The core engineering was good and has been vindicated. The coupling and governance concerns were
> also partly vindicated. And the two are not in tension — they were never the same claim.**

If I had to compress it:

| Claim | Verdict |
|---|---|
| SysVinit's failures were real and unfixable in place | **yes** — §36.2 |
| cgroup supervision was the right answer | **yes, decisively** |
| Socket activation was a genuine advance | **yes** |
| Declarative units beat shell scripts | **yes** |
| The scope would keep expanding | **the critics were right** |
| Coupling would reduce others' options | **partly right** — udev is the proof |
| PID 1 growth carries real risk | **yes** — with real CVEs |
| "It violates the Unix philosophy" | **the weakest argument**, and it should be retired |
| Debian would become unable to run without it | **no** |
| The discussion was conducted badly | **yes, by both sides** |

And the meta-point, which is the reason this chapter exists:

> **The best criticisms of systemd were never about whether its core design was good. They were
> about *scope*, *coupling* and *governance* — questions about who controls what, over what
> timescale, with what obligations to downstream.** Those are legitimate engineering questions, they
> were largely drowned out by the worse arguments, and they remain open.
>
> Which is also why Debian's answer — **adopt the core, decline the optional components, keep the
> alternative installable, and vote on it in public** — looks better in hindsight than either the
> maximalist or the rejectionist position. Volume 4 §20.5's governance machinery is what made that
> nuanced answer *expressible* at all.

---

