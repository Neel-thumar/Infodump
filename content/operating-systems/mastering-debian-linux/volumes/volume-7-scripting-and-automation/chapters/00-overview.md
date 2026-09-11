# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 7 — Scripting and Automation

---

### Where the first six volumes left off

Volume 7 is where the book stops explaining and starts building. Almost every chapter so far ended
with a command worth running regularly, and none of them were worth typing twice:

| You learned to check | Volume |
|---|---|
| which config files you've modified vs stock Debian | 4 §21.7 |
| every setuid binary on the system | 2 §11.8 |
| every listening socket and the process behind it | 5 §29.5 |
| which packages you asked for vs came as dependencies | 4 §23.4 |
| whether your LUKS header is backed up | 6 §35.3 |
| disk **and inode** usage | 3 §15.9 |
| failed systemd units | 6 §36.6 |

**Those seven commands are a machine-rebuild kit**, and by the end of this volume they'll be one
script that runs itself weekly and tells you when it fails. That's the capstone in §43.

Three specific debts also come due:

| Debt | From | Closed in |
|---|---|---|
| A pipeline swallowing a failure — `false \| true` reports success | 1 §2.8 | **§40.5** |
| `set -u` would have prevented Steam's deleted home directories | 1 §7.6 | **§40.4** |
| `.timer` units, "Volume 7's cron replacement" | 6 §36.6 | **§42** |

**Requirements.** Everything here is on a stock Debian install:

```bash
sudo apt install shellcheck     # strongly recommended — §39.10
command -v flock logger run-parts systemd-analyze
```

> **Verification note.** This volume is unusually well verified, because bash runs anywhere. Every
> behavioural claim in §39 and §40 was tested — **and one of my tests was wrong in a way that turned
> out to be the most instructive thing in the chapter.** That's §40.3, and I've left the mistake in.

---

