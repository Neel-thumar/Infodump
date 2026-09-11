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

