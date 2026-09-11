# Chapter 38 — What's Actually Worth Automating

## 38.1 The hook

> **Most shell-scripting tutorials teach you to write `hello.sh`, then a loop that counts to ten,
> then a function that adds two numbers.**
>
> **Nobody has ever needed any of those.**
>
> **So here's a different question: what do you actually have, right now, that you'd lose if this
> laptop died tonight — and how much of it could a script reconstruct?**

## 38.2 THE PROBLEM: your machine is mostly reproducible, except for the part that isn't

Think about restoring this laptop onto new hardware. What do you actually need?

| Thing | Reproducible from a Debian ISO? |
|---|---|
| The base system | **yes** — that's what the installer does |
| Installed packages | **yes, if you have the list** (Volume 4 §23.4) |
| Package *contents* | **yes** — that's what the archive is for |
| **Your edits to `/etc`** | **NO** — and Debian tracks exactly which files those are (Volume 4 §21.7) |
| **`/home`** | **NO** — Volume 3 §16.2 called it the only genuinely irreplaceable thing |
| **Your LUKS header** | **NO**, and without it the disk is unrecoverable (Volume 6 §35.3) |

> **So the interesting artifact is small.** Not a disk image — **a list of packages, a handful of
> modified config files, a partition layout, and a LUKS header backup.** Kilobytes, not gigabytes.
> That's a thing worth generating automatically and keeping somewhere else.

And while we're walking the system anyway, the same pass can answer the security questions from
Volumes 2 and 5 — what's setuid, what's listening, what failed — because **the cost of collecting
them is the same walk.**

## 38.3 The thing we're building

Over §39 to §43 we'll build **`sysnap`** — a system snapshot and audit tool. It will:

```
   1. record every package you EXPLICITLY installed        (Volume 4 §23.4)
   2. find and copy every config file you've MODIFIED      (Volume 4 §21.7)
   3. record the partition/LVM/LUKS layout                 (Volume 3 §17, Volume 6 §35)
   4. audit the security surface:
        • setuid and setgid binaries                       (Volume 2 §11.8)
        • sockets listening on non-loopback addresses      (Volume 5 §29.5)
        • failed systemd units                             (Volume 6 §36.6)
   5. warn about disk AND inode exhaustion                 (Volume 3 §15.9)
   6. write it all to a timestamped directory
   7. log a structured summary to the journal              (Volume 6 §36.7)
   8. run itself weekly, and tell you when it fails        (§42)
```

**Nothing it does is destructive.** It reads, and it writes only into a directory you nominate. That
matters, because §41.4's incident is about what happens when automation touches things it shouldn't.

By the end you'll have a script that is **read-only, idempotent, safely re-runnable, locked against
overlapping instances, logged, and scheduled** — which is a meaningfully different artifact from
`hello.sh`.

---

