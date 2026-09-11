# 3. What This Opens Up

Five paths. For each: what the work actually looks like on a Tuesday, what you'd still need to learn,
and which volumes you already have.

## Systems / DevOps / Site Reliability Engineering

**What the day actually looks like.** Less "automating everything" than the name implies. A realistic
week: an on-call shift, one incident and the postmortem afterwards, reviewing someone's Terraform
change, chasing a memory leak in a service you didn't write, updating a runbook, and a lot of writing
— postmortems, design docs, and explanations for people who don't have your context.

**Volumes you already have:** 2 (permissions, processes, signals), 3 (disk and inode exhaustion — you
will diagnose this for real), 6 (systemd, boot failures, the journal), 7 (automation, and the
discipline of failing loudly).

**What you'd add:** Git properly; one configuration-management or IaC tool (Ansible, Terraform); one
cloud provider; an observability stack (Prometheus/Grafana or equivalent); one real programming
language, usually Python or Go; and — genuinely a skill — **incident communication under pressure.**

> **Honest note:** "DevOps engineer" means wildly different things between companies, from
> "sysadmin with a new title" to "software engineer who owns infrastructure." SRE at large companies
> is heavily software-engineering-weighted and often has a coding interview to match. Read the job
> description, not the title.

## Cloud infrastructure and platform engineering

**What the day actually looks like.** You build the platform other engineers deploy onto: cluster
operation, CI/CD, internal developer tooling, service mesh, cost control. The framing that's taken
hold is "platform as a product" — your users are colleagues, and adoption is voluntary, which makes
it as much a product job as an infrastructure one.

**Volumes you already have:** 8 (containers — you will understand what's underneath the abstraction,
which most of your colleagues won't), 5 (networking), 6 (cgroups and resource limits).

**What you'd add:** Kubernetes in real depth; **one cloud's IAM model in real depth** — this is
genuinely the hard part and the thing that separates people; Terraform; Go; and cloud networking
(VPCs, peering, load balancer behaviour).

> **Honest note:** the container part is the *easy* part once you have Volume 8. The expertise that's
> scarce is IAM and networking — the parts that are policy and blast radius rather than mechanism.

## Security research and penetration testing

**What the day actually looks like.** It splits. **Offensive consulting** is engagement-based and
involves far more report writing than anything in a film — you spend days finding things and days
explaining them to people who must act on them. **Research** is mostly reading other people's code,
fuzzing, and being wrong for long stretches before being right once.

**Volumes you already have, and more than you'd think:** 2 (you read a real privilege escalation and
understand setuid's sharp edges), 4 (the OpenSSL incident **is** a supply-chain security case study,
which is the discipline's current growth area), 5 (protocols and SSH), 8 (syscalls, seccomp,
namespaces — the basis of container-escape work).

**What you'd add:** depending on direction — C and reverse engineering, or web application security,
or cloud security; fuzzing tools (AFL++, syzkaller for the kernel); and disclosure ethics, which is a
real professional skill and not a formality.

> **Worth knowing:** the Qualys Research Team wrote the advisories for **both** Baron Samedit and
> regreSSHion — two of this book's incidents. Their published advisories are a genuinely excellent
> model of what good vulnerability research writing looks like, and they're free.
>
> **On certifications:** OSCP is the one with broad practical respect. Certification value varies a
> lot by region and employer — **verify against current job postings in your market** rather than
> taking anyone's word, including mine.

## Kernel and embedded development

**What the day actually looks like.** C, and a lot of reading code you didn't write. Hardware bring-up
against a datasheet. Device trees. Cross-compilation. Debugging with `printk`, `ftrace` and sometimes
a JTAG probe. Patches sent to a mailing list with `git send-email` and reviewed in public, bluntly.
**The feedback loops are slow** — measured in days for review rounds, not minutes.

**Volumes you already have:** 8 (syscalls, modules, and you've built a kernel), 6 (boot, initramfs,
the early userspace), 3 (filesystems), 2 (processes and signals from the kernel's side).

**What you'd add:** C at a high level; reading hardware datasheets; the kernel's coding style and
submission process; and patience for public review.

**Entry paths that actually work:** drivers and the staging tree; documentation fixes (real
contributions, and the standard on-ramp); `kernelnewbies.org`; and the Linux Foundation's mentorship
programmes.

> **Honest note:** mainline kernel development is a long apprenticeship and the review culture is
> direct in a way that surprises people. **Embedded Linux is usually the more accessible door** —
> board bring-up, Yocto, OpenWrt — and it uses the same knowledge.

## Open source contribution — and how a first patch actually happens

This is the one people most often want and least often know the mechanics of. So here it is
concretely, using Debian, since you just spent Volume 4 learning its packaging.

### The easiest real contribution: a good bug report

```bash
sudo apt install reportbug
reportbug <package>
```

`reportbug` gathers versions, relevant configuration and dependency state, and files against
`bugs.debian.org`. **A clear report with a reliable reproducer is a genuine contribution** and
maintainers say so. It's also how you find out whether you can communicate a technical problem, which
is most of what contributing is.

### Fixing a bug in an existing package

**1. Find something small and real.** Debian tags approachable bugs for newcomers; browse
`bugs.debian.org` filtered on the `newcomer` tag. **Better still: fix something that has personally
annoyed you**, because you can reproduce it and you actually care about the outcome.

**2. Get the source** — Volume 4 §24.6, and you need `deb-src` lines enabled:

```bash
apt-get source <package>
sudo apt build-dep <package>
cd <package>-*/
```

**3. Reproduce the bug.** If you can't reproduce it, you can't fix it, and saying so on the bug is
itself useful information.

**4. Make the change as a quilt patch with a DEP-3 header.** You saw these in Volume 4 §24.6:

```
Description: Short summary of what and, more importantly, WHY
Author: Your Name <you@example.com>
Bug-Debian: https://bugs.debian.org/NNNNNN
Forwarded: https://upstream.example/pull/123
Last-Update: 2026-01-15
```

> **The `Forwarded:` field is the one that matters, and you know exactly why.** Volume 4 §25's
> OpenSSL disaster was a Debian patch that upstream never reviewed. That field exists so the next
> person can see whether anyone upstream has looked at this. **Send your fix upstream too.**

**5. Build and check it:**

```bash
dpkg-buildpackage -us -uc -b
lintian ../<package>_*.deb
```

**6. Submit it.** Either attach a `debdiff` to the bug report and tag it `patch`, or — for the many
packages now hosted on `salsa.debian.org`, Debian's GitLab — open a merge request.

### And going further

Packaging something new means finding a **sponsor** (an existing Developer who reviews and uploads for
you) via `mentors.debian.net`, and eventually applying to become a Debian Maintainer and then a
Debian Developer. It's a real process with real review, which is the point.

```bash
sudo apt install debian-policy developers-reference lintian devscripts
```

### The honest part, for any project

- **The hard bit is not the code.** It's finding something small enough to finish and real enough to
  matter.
- **Most rejected first patches fail on process, not content.** Read `CONTRIBUTING`, follow the commit
  message conventions, match the code style. This is not gatekeeping; it's how a project with
  thousands of contributors stays reviewable.
- **Review will be blunt and impersonal.** It is about the patch. Maintainers are reading dozens of
  these.
- **Documentation and test fixes are real contributions**, and they're the on-ramp everyone
  underestimates — including because they force you to read the code properly.
- **Explain *why*, not just *what*.** The diff shows what changed. The commit message exists to
  explain why it should.

---

