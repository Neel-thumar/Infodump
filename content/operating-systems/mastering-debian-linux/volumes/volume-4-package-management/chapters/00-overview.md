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

