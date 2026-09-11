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

