# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 2 — Users, Permissions, and Processes

---

### Where Volume 1 left off

Volume 1 treated your laptop as though you were the only person on it. Every command ran as you,
every file was yours, and the only boundary that mattered was between the shell and the kernel.

That is not the machine Unix was designed for, and almost every design decision in this volume only
makes sense once you drop the assumption.

Volume 1 also left three specific loose ends that get resolved here:

| Loose end | Where |
|---|---|
| `143 = 128 + 15` — what a signal actually *is* | §12.4 |
| Why `.` isn't on your `$PATH` — the trojan risk | §11.6, where `sudo` fixes it properly |
| Shellshock's environment inheritance being a *feature* | §11.6, where `sudo` deliberately breaks it |

**Everything in this volume runs on a stock Debian install.** A few demonstrations need `sudo` (you
have it if you left the root password blank during installation — §11.4 explains why). Nothing here
is destructive; every file created lives in `/tmp` or your home directory and is cleaned up.

One command worth installing for §12:

```bash
sudo apt install psmisc      # provides pstree
```

**A note on verification.** Where a demonstration in this volume shows expected output, I ran it on a
live Debian-derived system while writing. Two of them behaved differently from how I first wrote them
— §11.3 and §11.7 — and both corrections are left visible in the text, because the reason they
surprised me is more useful than the demo I originally intended.

---

