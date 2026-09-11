# Chapter 42 — systemd Timers

## 42.1 The hook

> **§41.3 listed eight things cron can't do. systemd timers address all eight — and cost you two
> files instead of one line.**
>
> **Whether that trade is worth it depends entirely on whether you'd notice the job failing.**

## 42.2 THE MECHANISM: a pair of units

Volume 6 §36.6 introduced `.timer` units and deferred them here. A timer is **two units with the
same stem**:

```
   sysnap.service    ← WHAT to run    (a normal service, Type=oneshot)
   sysnap.timer      ← WHEN to run it
```

The timer activates the service. That separation is the whole design, and it buys you something
immediately: **you can run the job by hand, right now, with the exact environment it will have on
schedule:**

```bash
sudo systemctl start sysnap.service      # run it NOW
journalctl -u sysnap.service -n 30       # ...and see everything it printed
```

> **That one capability answers §41.3's failings #1 and #4 together.** "Works manually, fails in
> cron" happens because your interactive environment and cron's are different. With a service unit
> there is only **one** environment, and you can invoke it whenever you like.

A minimal pair:

```ini
# /etc/systemd/system/sysnap.service
[Unit]
Description=System snapshot
Documentation=man:sysnap(1)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sysnap --output /var/backups/sysnap
```

```ini
# /etc/systemd/system/sysnap.timer
[Unit]
Description=Run system snapshot weekly

[Timer]
OnCalendar=weekly
Persistent=true
RandomizedDelaySec=1h

[Install]
WantedBy=timers.target
```

**Note there is no `[Install]` in the service.** You don't enable `sysnap.service` — you enable
`sysnap.timer`, and it pulls the service in when it fires.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sysnap.timer
systemctl list-timers sysnap.timer
```

## 42.3 `OnCalendar`, and a validator that works offline

systemd's calendar syntax is more expressive than cron's five fields, and — unlike cron — **you can
check your expression before trusting it** *(verified: this works with no running systemd)*:

```bash
systemd-analyze calendar "weekly"
systemd-analyze calendar "Mon..Fri 09:00"
systemd-analyze calendar "Sat *-*-1..7 04:00"
systemd-analyze calendar "every tuesday-ish"
```

Real output *(verified)*:

```
Original form: weekly
Normalized form: Mon *-*-* 00:00:00
Next elapse: Mon 2026-09-14 00:00:00 UTC
From now: 2 days left

Original form: Sat *-*-1..7 04:00
Normalized form: Sat *-*-01..07 04:00:00
Next elapse: Sat 2026-10-03 04:00:00 UTC
From now: 3 weeks 0 days left

Failed to parse calendar specification 'every tuesday-ish': Invalid argument
```

> **`Sat *-*-1..7 04:00` means "the first Saturday of the month"** — days 1 through 7 that are also a
> Saturday. That expression is awkward in cron and impossible to verify without waiting a month.
>
> And **this is the fifth "check before you activate" tool in this book**: `visudo` (Volume 2 §11.5),
> `findmnt --verify` (Volume 3 §17.5), `sshd -t` (Volume 5 §30.9), `systemd-analyze verify`
> (Volume 6 §36.3), and now `systemd-analyze calendar`.

The format:

```
   DayOfWeek Year-Month-Day Hour:Minute:Second
```

| Expression | Means |
|---|---|
| `hourly`, `daily`, `weekly`, `monthly`, `yearly` | the obvious shorthands |
| `*-*-* 03:30:00` | every day at 03:30 |
| `Mon..Fri 09:00` | weekdays at 09:00 |
| `*-*-01 00:00:00` | first of every month |
| `*-01,04,07,10-01` | quarterly |
| `*:0/15` | **every 15 minutes** |
| `Sat *-*-1..7 04:00` | first Saturday of the month |

## 42.4 How each of cron's eight failings is addressed

| # | cron's failing | systemd's answer |
|---|---|---|
| **1** | **`$PATH` isn't yours** | `Environment=`, `EnvironmentFile=`, `WorkingDirectory=` — **and one testable environment** |
| **2** | no dependency ordering | `After=network-online.target`, `Requires=`, `Wants=` (Volume 6 §36.6) |
| **3** | no resource limits | `MemoryMax=`, `CPUQuota=`, `IOWeight=`, `TasksMax=` (Volume 6 §36.5) |
| **4** | **logging is email → nowhere** | **stdout/stderr go to the journal automatically, tagged with the unit** |
| **5** | no catch-up | **`Persistent=true`** |
| **6** | no randomised delay | `RandomizedDelaySec=` |
| **7** | no overlap prevention | **systemd refuses to start an already-active service** |
| **8** | the shell is `dash` | there is no shell — `ExecStart=` execs directly |

Four of those deserve more than a table row.

### #4 — logging, which is the one that matters

Everything the script writes to stdout or stderr is captured by journald, tagged with the unit, and
queryable (Volume 6 §36.7):

```bash
journalctl -u sysnap.service                    # everything it has ever printed
journalctl -u sysnap.service -b                 # this boot
journalctl -u sysnap.service --since "1 week ago"
journalctl -u sysnap.service -p err
```

> **§41.4's Toy Story 2 lesson was that "the job ran" is not "the job worked."** With cron, the
> job's output was mailed into a void. With a service unit, **the output is in the journal whether or
> not anyone is listening**, and you can go and look at any time.
>
> One caveat you already know: Volume 6 §36.8 showed that on a default Debian install
> `/var/log/journal` doesn't exist, so the journal is **not persistent across reboots**. Fix that
> first, or this advantage evaporates at the next restart.

### #5 — `Persistent=true`, and how it works

```bash
ls -l /var/lib/systemd/timers/
```

systemd writes a **stamp file** per persistent timer recording when it last fired. At boot, if the
scheduled window has passed since that stamp, **the timer fires immediately**.

> **This is anacron's behaviour (§41.6), generalised to every timer** — not just the
> `cron.daily`-style directories. On a laptop that's closed most nights, it's the difference between
> a weekly job running weekly and a weekly job never running at all.

### #6 — `RandomizedDelaySec`, and Debian using it

```bash
systemctl cat apt-daily.timer 2>/dev/null
```

```ini
[Timer]
OnCalendar=*-*-* 6,18:00
RandomizedDelaySec=12h
Persistent=true
```

**Twelve hours of jitter**, so that every Debian machine on Earth doesn't hit the mirrors at 06:00:00
simultaneously. §41.3's failing #6, solved in Debian's own shipped configuration.

### #7 — no overlap, for free

If `sysnap.service` is still running when the timer next fires, systemd **won't start a second
copy** — the unit is already active. You get this without writing any locking code.

> **You should still write the lock** (§43 does). systemd protects you from *its own* scheduling
> overlapping; it does nothing about you running the script by hand while the timer's copy is
> midway. Belt and braces.

## 42.5 Monotonic timers

`OnCalendar` is wall-clock. The monotonic family is relative, which is often what you actually want:

```ini
[Timer]
OnBootSec=15min          # 15 minutes after boot
OnUnitActiveSec=6h       # ...and every 6 hours after the last run
```

| Directive | Relative to |
|---|---|
| `OnActiveSec=` | when the timer was activated |
| `OnBootSec=` | system boot |
| `OnStartupSec=` | systemd start |
| **`OnUnitActiveSec=`** | **when the service last ran** |
| `OnUnitInactiveSec=` | when the service last finished |

> **`OnBootSec=` + `OnUnitActiveSec=` is the right pattern for "every N hours while the machine is
> on."** Unlike `OnCalendar=*-*-* 0/6:00`, it doesn't try to catch up on four missed windows when you
> open the laptop, and it spaces runs by actual elapsed time rather than clock position.

## 42.6 User timers

Everything above works per-user, with no root at all:

```bash
mkdir -p ~/.config/systemd/user
# write ~/.config/systemd/user/mytask.{service,timer}
systemctl --user daemon-reload
systemctl --user enable --now mytask.timer
systemctl --user list-timers
journalctl --user -u mytask.service
```

> **One gotcha:** by default a user's systemd instance stops when their last session ends, so user
> timers don't run when you're logged out. To change that:
>
> ```bash
> loginctl enable-linger "$USER"
> loginctl show-user "$USER" -p Linger
> ```

## 42.7 Debian's own timers

```bash
systemctl list-timers --all
```

| Timer | Does |
|---|---|
| `apt-daily.timer` | downloads package lists — with 12h jitter |
| `apt-daily-upgrade.timer` | installs security upgrades if configured |
| `fstrim.timer` | weekly SSD TRIM (Volume 3 §17.7) |
| `logrotate.timer` | rotates logs — **migrated from `/etc/cron.daily`** |
| `man-db.timer` | rebuilds the `man -k` index (Volume 1 §5.2) |
| `e2scrub_all.timer` | online ext4 metadata checking |

```bash
systemctl cat fstrim.timer 2>/dev/null
systemctl list-timers --all | awk 'NR==1 || /apt-daily/'
```

> **Debian runs both cron and timers**, and has been migrating packages from one to the other
> gradually rather than by decree — which is the same incrementalism Volume 6 §37.5 identified in its
> systemd adoption generally.

## 42.8 One-off jobs: `systemd-run`

For something you want once, without writing files:

```bash
systemd-run --user --on-active=30s --unit=hello /bin/echo "hello from a transient timer"
systemctl --user list-timers hello.timer
journalctl --user -u hello.service
```

```bash
# and a scoped, resource-limited one-off — useful for a suspect command
systemd-run --user --scope -p MemoryMax=100M -- stress-ng --vm 1 --vm-bytes 200M
```

`systemd-run` creates a transient unit that disappears afterwards. It's also the sane replacement for
`nohup` (Volume 2 §12.6) when you want something to survive your logout **and** be logged.

---

