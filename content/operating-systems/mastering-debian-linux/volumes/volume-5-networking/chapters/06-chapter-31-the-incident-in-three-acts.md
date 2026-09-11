# Chapter 31 — The Incident, in Three Acts

The story of SSH is unusually complete: a problem that was fatal, a fix that genuinely worked, and a
reminder that working perfectly at the protocol level doesn't make software correct.

## 31.1 Act I — 1988: trusted-host authentication was already broken

> **Confidence: high** on the event, the date and the mechanisms; **moderate** on the machine
> counts, which vary between sources.

On **2 November 1988**, **Robert Tappan Morris**, a Cornell graduate student, released a
self-propagating program onto the internet. The **Morris Worm** used three vectors:

| Vector | What it exploited |
|---|---|
| a `sendmail` DEBUG mode left enabled in shipped builds | a remote command interface |
| a `fingerd` buffer overflow via `gets()` | memory corruption |
| **`rsh` / `rexec` trust relationships plus weak passwords** | **§30.2's `.rhosts` model** |

That third vector is the one for this chapter. **The worm read `/etc/hosts.equiv` and `.rhosts`
files, learned which machines trusted the current one, and walked the trust graph.** No exploit
needed — it was using the authentication system exactly as designed.

It reached roughly **6,000 of the internet's ~60,000 machines** — about ten percent. The damage came
from a bug in the worm itself: its check for "am I already running here" had a deliberate
one-in-seven chance of ignoring the answer, so hosts got reinfected until they were unusable.

**Consequences:** **CERT/CC** was founded at Carnegie Mellon within weeks, and Morris became the
first person convicted under the US Computer Fraud and Abuse Act.

> **The lesson available in 1988 was that IP-address-plus-claimed-username is not authentication.**
> It took another seven years and Act II before anyone built the replacement.

## 31.2 Act II — 1994: the sniffing attacks

> **Confidence: moderate-high** on the CERT advisory and the general facts; **moderate** on the
> scale, which CERT described qualitatively rather than precisely.

In **February 1994**, CERT published advisory **CA-1994-01, "Ongoing Network Monitoring Attacks."**

Attackers had obtained root on machines at network-adjacent locations — universities and providers
carrying large volumes of transit traffic — and installed **packet sniffers**. Because `telnet`,
`rlogin` and `ftp` all send credentials in plaintext (§30.2), every login that crossed those hosts
was captured.

The advisory described the compromise as affecting a very large number of accounts, in the tens of
thousands or more.

**Three things made this qualitatively worse than a normal breach:**

1. **It was completely passive.** No exploit, no crash, no log entry. The attack was *reading*.
2. **The yield compounded.** Each captured credential gave access to another machine, from which to
   sniff more. Attackers moved outward from a few hosts to a large fraction of the academic internet.
3. **There was no defence available.** You could not tell users to stop using `telnet` — there was
   nothing else. The only advice CERT could give was "change all your passwords," which achieved
   nothing while the sniffers were still running.

**This is the environment Ylönen was in when he wrote SSH the following year** (§30.3). The Helsinki
incident was one instance of a global pattern.

### Act II's ending is unusually clean

Security stories in this book mostly end with mitigation. **This one ends with the problem being
solved and staying solved.**

Password sniffing on the wire — the attack that dominated network security for two decades — is
simply **not a thing any more** for SSH, and hasn't been for twenty-five years. Not "harder." Not
"mitigated." The encryption means there is nothing on the wire to capture, and the host key check
means there's nobody in the middle to capture it.

**Why it worked, when so many security improvements don't:**

| | |
|---|---|
| **Drop-in replacement** | `ssh` for `rsh`, `scp` for `rcp`. No workflow change, no persuasion needed |
| **Strictly better, not a trade-off** | you didn't give up anything to adopt it |
| **Free, with source** | it spread through the academic networks that were being attacked |
| **The alternative was indefensible** | there was no argument for plaintext once an option existed |

> **That combination is rare, and it's worth remembering when evaluating any security proposal:
> adoption is a property of the design, not of how right you are.**

## 31.3 Act III — 2024: and yet

> **Confidence: high** on the CVE, the date, Qualys, and the regression; **moderate** on exact
> Debian package versions.

On **1 July 2024**, the Qualys Research Team disclosed **CVE-2024-6387**, nicknamed
**"regreSSHion":** an **unauthenticated remote code execution as root** in OpenSSH's server.

**The mechanism** is about `LoginGraceTime` — the timer that disconnects a client which connects but
never authenticates. When it expires, `sshd` handles `SIGALRM`. And the handler called functions
that are **not async-signal-safe** — `syslog()`, which reaches `malloc()` and `free()`.

```
   A signal handler can fire at ANY instruction, including
   halfway through a heap operation in the main flow.

   If SIGALRM arrives at exactly the wrong moment, the handler's own
   malloc() re-enters a heap in an inconsistent state → corruption
   → and with enough precision, controlled corruption → code execution.
```

**And the name is the interesting part: this was a *regression*.** The identical bug had been
found and fixed in **2006** as CVE-2006-5051. It was **reintroduced in OpenSSH 8.5p1** (around
October 2020) when a directive guarding the vulnerable code was removed. It then sat there for
nearly four years.

| | |
|---|---|
| Affects | OpenSSH 8.5p1 – 9.7p1, on **glibc**-based Linux |
| Debian | **bookworm shipped 9.2p1 — affected**, fixed in a security update |
| Exploitation | **hard.** Qualys reported needing thousands of attempts and hours, and it depends on defeating ASLR |

```bash
ssh -V
dpkg -l openssh-server 2>/dev/null | tail -1
sudo sshd -T 2>/dev/null | grep -i logingracetime
```

### Why Act III belongs here

**Three honest points, and they're the ending the chapter needs:**

**1. Solving the protocol problem completely does not make the implementation correct.** SSH's
cryptography did its job perfectly. The bug was in signal handling — C, concurrency, and the heap.
The threat model that produced SSH is closed; the threat model that produces memory-safety bugs
never was.

**2. Fixed bugs come back.** A patch from 2006 was removed in 2020 by someone tidying up, and nobody
noticed for four years. **This is Volume 4 §25 in a different costume** — a change that looked
locally harmless, in security-critical code, with nobody reviewing it against the reason the code
existed. It is also the argument for regression tests that encode *why*, not just *what*.

**3. Compare Volume 2 §13's Baron Samedit.** `sudo`, ten years, unauthenticated local root, memory
corruption in C. `sshd`, four years, unauthenticated *remote* root, memory corruption in C. **Two of
the most-audited security-critical programs in existence, same failure class.** That is the strongest
practical argument for the memory-safe reimplementations now underway — not that C programmers are
careless, but that the very best of them, under the most scrutiny, still produce this.

> **And the pattern for the sixth time in this book.** Shellshock, Baron Samedit, ext4's silent
> write, Debian's weak keys, Kaminsky's DNS, and now regreSSHion: **something was assumed to
> guarantee a property it did not actually guarantee.** Here the assumption was that a signal handler
> could safely call `syslog()`. It cannot, it never could, and the code worked anyway for four years.

---

