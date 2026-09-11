# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 3 — The Filesystem, Deeply

---

### Where Volumes 1 and 2 left off

You have already used the filesystem as something other than a place to keep documents, three times,
without it being explained:

| What you did | Volume | What it really was |
|---|---|---|
| `tr '\0' '\n' < /proc/$$/environ` | 1 §6.3 | reading **a process's memory** as a file |
| `cat /proc/$$/fd/3` after deleting the file | 1 §3.4 | reading **an open file descriptor** as a file |
| `stat -c '%f' /dev/null` → `0x21b6` | 2 §10.3 | a **character device** with ordinary permission bits |

None of those are documents. All of them opened with `open()`, read with `read()`, and obeyed the
nine permission bits from Volume 2 §10. **That is not an accident, and this volume is about why.**

Volume 3 also settles three specific debts:

| Debt | Where |
|---|---|
| Why deleting an open file frees no space (V1 §3.4) | §15.6 |
| Why `rm` needs write permission on the *directory* (V2 §10.5) | §15.3 |
| The claim that `/usr` exists because a disk filled up — which I said I'd **check** | §16.4 |

**Requirements.** Everything here runs on a stock Debian install. A few demonstrations need `sudo`.
Two optional packages make things nicer:

```bash
sudo apt install manpages       # for `man hier`
sudo apt install strace         # if you skipped it in Volume 1
```

**As in Volume 2, every demonstration in this volume was run before it was written down.** One of
them produced a result I would otherwise have asserted incorrectly — §19.6 — and that correction is
left visible.

---

