# TRY THIS ON YOUR MACHINE

Six things. **Five are verified**; the timer one needs a running systemd and is marked. Nothing is
destructive.

---

## 1. Make `set -e` fail to fire, five different ways

**Needs:** bash. *(All verified.)*

```bash
mkdir -p /tmp/se && cd /tmp/se
run() { printf '%-46s' "$1"; bash "$2" >/dev/null 2>&1; echo "exit $?"; }

printf 'set -e\nfalse\necho REACHED\n'                              > a.sh
printf 'set -e\nfalse && echo x\necho REACHED\n'                    > b.sh
printf 'set -e\nif ! false; then :; fi\necho REACHED\n'             > c.sh
printf 'set -e\nfalse | true\necho REACHED\n'                       > d.sh
printf 'set -e\ng(){ local x=$(false); }\ng\necho REACHED\n'        > e.sh
printf 'set -e\nn=0\n((n++))\necho REACHED\n'                       > f.sh

run "plain 'false'                  -> DIES"   a.sh
run "'false && cmd'                 -> lives"  b.sh
run "'if ! false'                   -> lives"  c.sh
run "'false | true'                 -> lives"  d.sh
run "'local x=\$(false)'             -> lives"  e.sh
run "'((n++))' when n=0             -> DIES"   f.sh
cd /tmp && rm -rf /tmp/se
```

**What you should see:** `a.sh` and `f.sh` exit 1; the other four exit 0.

**Why it's interesting:** four of these are commands that *failed* and did not stop the script, and
one — `((n++))` — is a command that *succeeded* conceptually and killed it. **`local x=$(false)` is
the worst of them**, because it looks like careful code: the `local` builtin's own exit status masks
the substitution's failure entirely. Declare and assign on separate lines. And note you must run
these as **files**: wrapping them in `( ... ) || echo` disables `set -e` by rule #1, which is exactly
how I got this wrong the first time (§40.3).

---

## 2. Watch a pipe eat your variable

**Needs:** bash. *(Verified.)*

```bash
count=0
printf 'a\nb\nc\n' | while read -r l; do count=$((count+1)); done
echo "after a pipe:        count=$count"

count=0
while read -r l; do count=$((count+1)); done < <(printf 'a\nb\nc\n')
echo "after process subst: count=$count"

count=0
shopt -s lastpipe 2>/dev/null; set +m
printf 'a\nb\nc\n' | while read -r l; do count=$((count+1)); done
echo "with lastpipe:       count=$count"
shopt -u lastpipe 2>/dev/null
```

**What you should see:** `0`, then `3`. The `lastpipe` variant may give 3 as well — it's a bash option
that runs the last pipeline element in the current shell, and it only works when job control is off.

**Why it's interesting:** the loop **visibly ran** and its result **visibly vanished**, which is what
makes this bug so disorienting. It's Volume 1 §2.6 and §6.4 combining: each pipeline element is a
forked child, and a child cannot modify its parent's variables. `< <(...)` gives the loop a file
descriptor instead of putting it in a pipeline, so it stays in the current shell.

---

## 3. Prove `run-parts` will silently ignore your cron script

**Needs:** `run-parts` (installed by default). *(Verified.)*

```bash
mkdir -p /tmp/rp
for n in goodname backup.sh my-job also_fine report.v2 README; do
    printf '#!/bin/sh\necho ran\n' > "/tmp/rp/$n"; chmod +x "/tmp/rp/$n"
done
echo "files present:"; ls /tmp/rp
echo; echo "files run-parts would actually execute:"
run-parts --test /tmp/rp
rm -rf /tmp/rp

echo; echo "=== now check your REAL cron directories ==="
for d in /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly; do
    echo "--- $d"
    comm -23 <(ls "$d" 2>/dev/null | sort) <(run-parts --test "$d" 2>/dev/null | xargs -r -n1 basename | sort) \
      | sed 's/^/    IGNORED: /'
done
```

**What you should see:** `goodname`, `my-job`, `also_fine` and `README` execute. **`backup.sh` and
`report.v2` do not appear** — silently.

**Why it's interesting:** `run-parts` only runs files matching `^[a-zA-Z0-9_-]+$`, so **a dot in the
filename means the job never runs and nothing tells you.** Naming a cron script `backup.sh` — the
most natural name in the world — is a reliable way to believe you have a nightly backup that has
never once executed. That last block audits your actual cron directories for the same mistake.

---

## 4. Compare cron's environment to your own

**Needs:** cron running. Adds and then removes a temporary crontab line.

```bash
( crontab -l 2>/dev/null; echo '* * * * * env > /tmp/cron-env.txt 2>&1' ) | crontab -
echo "waiting up to 65s for cron to fire..."
sleep 65
echo "=== in YOUR shell but NOT in cron ==="
comm -23 <(env | cut -d= -f1 | sort) <(cut -d= -f1 /tmp/cron-env.txt | sort) | head -20
echo; echo "=== PATH comparison ==="
echo "  yours: $PATH"
echo "  cron:  $(grep '^PATH=' /tmp/cron-env.txt | cut -d= -f2-)"
echo; echo "=== SHELL cron will use ==="
grep -E '^SHELL=' /etc/crontab

crontab -l | grep -v 'cron-env' | crontab -
rm -f /tmp/cron-env.txt
```

**What you should see:** cron's environment missing `DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`,
`XDG_RUNTIME_DIR`, `SSH_AUTH_SOCK` and much else, with a shorter `PATH` — and `/etc/crontab` saying
`SHELL=/bin/sh`, which on Debian is **dash** (Volume 1 §1.5).

**Why it's interesting:** this is the concrete answer to "it works when I run it manually." Your
interactive shell inherited a rich environment from your login session (Volume 1 §6.2); cron's parent
is `init`. Anything relying on `$PATH`, a desktop session, or bash syntax will behave differently —
and the difference is invisible until it isn't.

---

## 5. Watch a timer, and find how catch-up works

**Needs:** a running systemd. *(Describing — systemd isn't PID 1 on my test box. The
`systemd-analyze calendar` parts ARE verified.)*

```bash
echo "=== validate calendar expressions offline ==="
for c in "weekly" "Mon..Fri 09:00" "Sat *-*-1..7 04:00" "*:0/15" "nonsense"; do
    echo "--- OnCalendar=$c"
    systemd-analyze calendar "$c" 2>&1 | sed 's/^/    /' | head -4
done

echo; echo "=== what's scheduled on this machine ==="
systemctl list-timers --all

echo; echo "=== how Persistent= remembers ==="
sudo ls -l /var/lib/systemd/timers/
sudo cat /var/lib/systemd/timers/stamp-apt-daily.timer 2>/dev/null | head -1 || true
stat -c 'last fired: %y  %n' /var/lib/systemd/timers/stamp-* 2>/dev/null | head -5

echo; echo "=== Debian's own jitter, so the mirrors survive ==="
systemctl cat apt-daily.timer 2>/dev/null | grep -iE 'OnCalendar|Randomized|Persistent'

echo; echo "=== a transient one-off ==="
systemd-run --user --on-active=20s --unit=hello-demo /bin/echo "hello from a transient timer"
systemctl --user list-timers hello-demo.timer
sleep 25 && journalctl --user -u hello-demo.service -n 5
```

**What you should see:** `systemd-analyze calendar` resolving each expression to a normalised form
and a next-elapse time, and rejecting `nonsense` outright. The stamp files under
`/var/lib/systemd/timers/` with mtimes matching each timer's last run.

**Why it's interesting:** those **stamp files are the entire implementation of `Persistent=true`** —
at boot, systemd compares the stamp against the schedule and fires immediately if a window was
missed. That's what makes a weekly job on a laptop actually run weekly. And `systemd-analyze
calendar` is the fifth "validate before you activate" tool in this book, after `visudo`,
`findmnt --verify`, `sshd -t` and `systemd-analyze verify`.

---

## 6. Install the capstone, then break it deliberately

**Needs:** the script from §43.1, and `sudo` for the units.

```bash
sudo install -m 755 sysnap /usr/local/bin/sysnap
shellcheck /usr/local/bin/sysnap && echo "  shellcheck: clean"

echo "=== dry run first, always ==="
sysnap --dry-run --verbose

echo "=== real run ==="
sysnap --verbose
ls -lt ~/sysnap/ | head -3
cat ~/sysnap/*/SUMMARY.txt | head -20

echo "=== now prove the LOCK works ==="
( sysnap >/dev/null 2>&1 & sleep 0.2; sysnap --dry-run; wait ) 2>&1 | tail -2

echo "=== and prove it FAILS LOUDLY ==="
SNAPSHOT_ROOT=/proc/impossible sysnap; echo "  exit status: $?"

echo "=== what did the journal record? ==="
journalctl -t sysnap -n 10 --no-pager
```

**What you should see:** a `SUMMARY.txt` with per-section counts; the second concurrent invocation
refused with "another sysnap is already running"; a non-zero exit for the impossible output path; and
a `sysnap`-tagged line in the journal for each successful run.

**Why it's interesting:** the last two commands are the ones that matter, and they're the ones people
skip. **§41.4's Toy Story 2 backup ran every night and produced nothing, and nobody was told.** A
script that works is table stakes; a script that *tells you when it doesn't* is the actual
deliverable. Test the failure path deliberately, because an alarm you've never heard fire is
indistinguishable from a broken one.

---

