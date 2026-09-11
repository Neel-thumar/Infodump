# Chapter 41 — `cron`, and the Things It Cannot Do

## 41.1 The hook

> **You write a script. It works perfectly when you run it. You put it in cron. It fails silently,
> forever, and you find out three months later when you need it.**
>
> **This is close to a universal experience, and there are eight separate reasons for it.**

## 41.2 THE MECHANISM: Debian's cron layout

> **Confidence: moderate-high.** `cron` dates to early Unix; the implementation most Linux systems
> descend from is **Paul Vixie's**, from around 1987. Debian's `cron` package is a Vixie derivative.

Debian has **five** places cron jobs live, and knowing which is which saves confusion:

```bash
crontab -l 2>/dev/null                  # YOUR personal crontab
ls -l /var/spool/cron/crontabs/ 2>/dev/null
cat /etc/crontab
ls /etc/cron.d/
ls /etc/cron.hourly/ /etc/cron.daily/ /etc/cron.weekly/ /etc/cron.monthly/
```

| Location | Format | Runs as |
|---|---|---|
| `crontab -e` → `/var/spool/cron/crontabs/$USER` | 5 fields + command | **you** |
| **`/etc/crontab`** | **6 fields — an extra USER column** | whoever's named |
| **`/etc/cron.d/*`** | 6 fields, same as above | whoever's named |
| `/etc/cron.{hourly,daily,weekly,monthly}/` | **executable scripts, not crontab lines** | root |

The time fields:

```
   ┌───────────── minute        0–59
   │ ┌─────────── hour          0–23
   │ │ ┌───────── day of month  1–31
   │ │ │ ┌─────── month         1–12
   │ │ │ │ ┌───── day of week   0–7  (0 and 7 are both Sunday)
   │ │ │ │ │
   30 3 * * *   /usr/local/bin/sysnap
```

Plus shortcuts: `@reboot`, `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`.

**Debian's `/etc/crontab` is worth reading, because two lines in it explain a lot:**

```
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

17 *	* * *	root	cd / && run-parts --report /etc/cron.hourly
25 6	* * *	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )
47 6	* * 7	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.weekly )
52 6	1 * *	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.monthly )
```

**`SHELL=/bin/sh`** — which on Debian is **dash** (Volume 1 §1.5). So a cron command using bash
syntax fails, even though the same line works in your interactive shell.

**`test -x /usr/sbin/anacron ||`** — if `anacron` is installed, cron **skips** these and lets anacron
handle them (§41.6).

### The `run-parts` trap, verified

The `cron.daily` directories are run by `run-parts`, which **only executes files whose names match
`^[a-zA-Z0-9_-]+$`.** A dot in the filename means the file is **silently ignored**:

```bash
mkdir -p /tmp/rp
printf '#!/bin/sh\necho ran\n' > /tmp/rp/goodname
printf '#!/bin/sh\necho ran\n' > /tmp/rp/backup.sh
chmod +x /tmp/rp/*
run-parts --test /tmp/rp
rm -rf /tmp/rp
```

```
/tmp/rp/goodname
```

*(Verified — `backup.sh` is absent from the output.)*

> **`backup.sh` in `/etc/cron.daily/` will never run, and nothing will tell you.** No error, no log
> entry, no mail. It is one of the most reliable ways to believe you have a backup when you don't —
> which §41.4 is about.
>
> **Name it `backup`.** Check with `run-parts --test /etc/cron.daily`.

## 41.3 THE PROBLEM: eight things cron doesn't do

### 1. `$PATH` is not yours

This is the number one cause of "it works when I run it manually." Volume 1 §2.5 and §6.5 established
that `$PATH` is inherited from the parent process — and cron's parent is `init`, not your login
shell.

**Prove it on your own machine**, then remove it:

```bash
( crontab -l 2>/dev/null; echo '* * * * * env > /tmp/cron-env.txt 2>&1' ) | crontab -
sleep 65
diff <(sort /tmp/cron-env.txt) <(env | sort) | head -20
crontab -l | grep -v 'cron-env' | crontab -
rm -f /tmp/cron-env.txt
```

You'll find cron's environment is drastically smaller: no `DISPLAY`, no `DBUS_SESSION_BUS_ADDRESS`,
no `XDG_RUNTIME_DIR` (Volume 3 §17.6), a minimal `PATH`, and often a different `LANG`.

> **The fix is to never rely on `$PATH` in a cron job.** Use absolute paths, or set `PATH=` explicitly
> at the top of the crontab.

### 2. No dependency ordering

You cannot say "run after the network is up." `@reboot` fires early and at an unpredictable point
relative to everything else. A job that needs DNS may run before `resolved` is listening (Volume 5
§27.4).

### 3. No resource limits

A cron job that leaks memory will happily consume the machine. There is no `MemoryMax`, no
`CPUQuota`, no `TasksMax` — the concepts don't exist in cron.

### 4. Logging is email, and on a laptop that means nowhere

**This is the important one.** cron captures a job's stdout and stderr and **mails them to the
owning user.**

```bash
systemctl is-active postfix exim4 2>/dev/null || echo "  no MTA running"
ls -l /var/mail/ 2>/dev/null
grep -iE '^MAILTO' /etc/crontab /etc/cron.d/* 2>/dev/null
```

> **On a default Debian desktop there is no mail transport agent.** So a failing cron job produces
> output that cron tries to mail, the mail cannot be delivered, and **the output is discarded.**
>
> Your job fails every night, at the same time, for a year, and the system tells you nothing.

You can see cron *ran* something in the journal, but not what it produced:

```bash
journalctl -t CRON --since "1 day ago" | tail -20
grep -i cron /var/log/syslog 2>/dev/null | tail -10
```

That tells you the command was invoked. It does not tell you whether it worked.

### 5. No catch-up

If the machine was asleep at 03:30, the 03:30 job **simply didn't happen**. cron has no memory of
missed windows. On a laptop that is closed most nights, a nightly job may effectively never run.

### 6. No randomised delay

Every machine with the same crontab line fires at **exactly** the same second. For a fleet hitting a
package mirror, that's a self-inflicted denial of service — which is precisely why Debian's own
`apt-daily.timer` uses a randomised delay (§42.4).

### 7. No overlap prevention

A job that takes 90 minutes, scheduled hourly, will run concurrently with itself forever, each
instance making things slower. cron will not notice.

### 8. The shell is `dash`, not bash

§41.2. Bash syntax in a crontab command fails.

## 41.4 THE INCIDENT: Toy Story 2, and the backup that wasn't

> **Confidence: moderate-high on the substance, moderate on specifics.** This has been recounted
> first-hand by Pixar staff — including Oren Jacob and Galyn Susman — in Pixar's own published
> "Studio Stories" material, so it's better sourced than most industry folklore. Details such as the
> exact year (1998 or 1999) and the precise nature of the backup failure vary between tellings.

During production of **Toy Story 2**, someone ran a recursive delete on the wrong directory on the
Unix server holding the film's assets.

The way it's told, people noticed in real time. Woody's hat vanished. Then his boots. Then Woody.
Someone physically pulled the machine off the network, but by then **most of the film's assets were
gone** — the figure usually quoted is around 90%.

**That part is not the interesting part.** Deletions happen; that's what backups are for.

**The interesting part is what happened next.** They went to restore from backup, and discovered the
backups **had been silently failing for weeks**. The backup job was running. It was producing no
usable output. Nothing had reported an error to anyone.

The film was recovered only because **Galyn Susman**, the supervising technical director, had been
working from home following the birth of her child and had a full copy of the film on her home
workstation. They drove to her house, wrapped the machine in blankets, and drove it back.

> **A film with a nine-figure budget survived on a domestic computer that happened to exist for
> unrelated reasons.**

### The three lessons, and they're all this chapter

**1. The `rm -rf` was not the failure.** It was the *trigger*. The failure was a backup system that
had been broken for weeks with nobody aware. **A deletion is survivable. An unmonitored backup is
not.**

**2. "The job ran" is not "the job worked."** cron invoked the backup. cron's job was done. Whether
the backup contained anything was never checked by anything. §41.3's failing #4 — output mailed
nowhere — is exactly how a job stays broken for weeks while appearing to run nightly.

**3. Verification is a separate task from the backup.** A backup you have never restored from is a
hypothesis. The only test that counts is a restore.

> **Which is why §43's capstone does three things that look like overkill for a personal laptop:**
> it **logs a structured summary to the journal** on every run, it **exits non-zero when a section
> produces nothing**, and its timer unit has an **`OnFailure=` handler**. Because a script that fails
> loudly on Tuesday is worth more than one that works silently until the Tuesday it doesn't.
>
> And there's a small resonance worth noticing: Debian's release codenames come from **Toy Story**
> (Volume 4 §24.3). Your machine is called `bookworm` because of the film that nearly didn't survive
> its own backup system.

## 41.5 What cron is still good for

I don't want to be unfair to a tool that has worked for fifty years:

| cron wins when | Because |
|---|---|
| The script must run on non-systemd systems | Devuan, Alpine, BSD, containers — Volume 6 §37.4 |
| You want one line, right now, with no unit files | `crontab -e` is genuinely faster |
| Per-user jobs on a multi-user box | `crontab -e` needs no root |
| The job is trivial and failure doesn't matter | a log rotation, a cache clear |

And Debian runs both, so this is not an either/or:

```bash
systemctl is-active cron 2>/dev/null
systemctl list-timers --all 2>/dev/null | head
```

## 41.6 `anacron` — cron's answer to failing #5

Debian installs `anacron` on desktop systems specifically because laptops are not always on.

```bash
dpkg -l anacron 2>/dev/null | tail -1
cat /etc/anacrontab 2>/dev/null
ls -l /var/spool/anacron/ 2>/dev/null
```

```
# period  delay  job-identifier   command
1         5      cron.daily       run-parts --report /etc/cron.daily
7         10     cron.weekly      run-parts --report /etc/cron.weekly
@monthly  15     cron.monthly     run-parts --report /etc/cron.monthly
```

anacron records the **date each job last ran** in `/var/spool/anacron/`, and at boot runs anything
whose period has elapsed — after a delay, so it doesn't compete with login.

> **anacron fixes failing #5 for the `cron.daily`-style directories only.** It does nothing for your
> personal `crontab -e` entries, nothing for the PATH problem, nothing for logging, and nothing for
> overlap. It's a targeted patch, not a general answer — which is where §42 comes in.

---

