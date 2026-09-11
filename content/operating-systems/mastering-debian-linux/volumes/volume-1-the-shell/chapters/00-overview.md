# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 1 — The Shell, and What a Computer Actually Does When You Type

---

### How this guide works

Every major idea in this book gets three things, in this order:

1. **THE PROBLEM** — what was actually broken or missing, framed as a question you might have asked
   yourself.
2. **THE MECHANISM** — how it really works, in technical depth, with commands you can run to see it
   for yourself.
3. **THE INCIDENT** — a real bug, outage, security flaw, or design argument that proves why the
   mechanism matters. Not a hypothetical.

**On historical accuracy.** Computing history before about 1990 is patchily documented, often
recounted from memory decades later, and heavily embellished by repetition. Where I am confident, I
say so plainly. Where I am not, you will see a flag like this:

> **Confidence: moderate.** Widely repeated in secondary sources; I have not verified the primary
> source, and dates in this era are frequently off by a year.

I would rather leave you calibrated than leave you with a good story. If something here matters to
you, the flags tell you where to go check.

**On Debian specifically.** This is not a generic Linux book. Where something is a Debian project
decision rather than a Linux fact, it will be marked as such — because those decisions are the ones
that will confuse you when you read documentation written for Fedora or Arch.

### Before you start

Everything in Volume 1 works on a stock Debian install with no extra packages, **except** the
`strace` demonstrations in §8.1, which need one install. If you want everything to work:

```bash
sudo apt update
sudo apt install strace
```

Check what you're running, so that when something in this book doesn't match your machine you know
whether it's a version difference:

```bash
cat /etc/os-release
uname -a
echo "$BASH_VERSION"
```

On Debian 12 (bookworm) you should see something like `VERSION="12 (bookworm)"` and a bash version of
`5.2.x`. Nothing here is version-fragile, but it's good practice to know.

---

