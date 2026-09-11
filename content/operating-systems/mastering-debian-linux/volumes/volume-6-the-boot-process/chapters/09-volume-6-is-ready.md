# Volume 6 is ready

**File: `volume-6-the-boot-process.md`**

## What Volume 7 will cover: SCRIPTING AND AUTOMATION

Volume 6 read a lot of system state with increasingly elaborate one-liners. Volume 7 turns that into
something maintainable.

- **Bash from first principles** — variables, quoting, conditionals, loops, functions,
  arrays — taught through **a real problem you'd actually automate**, not `foo` and `bar`. And built
  on Volume 1: the expansion order from §2.4, why `"$var"` is not optional, and why Volume 1 §7's
  Steam incident is the thing we're defending against.
- **`set -euo pipefail`**, derived rather than cargo-culted. Volume 1 §2.8 showed a pipeline
  swallowing a failure and `$?` reporting success; Volume 1 §7.6 showed `set -u` preventing a deleted
  home directory. Volume 7 explains exactly what each flag does, and — importantly — **where each one
  will bite you**, because they are not free.
- **`cron` versus systemd timers** — what cron genuinely can't do (no dependency ordering, no
  resource limits, no logging beyond mail, no catch-up after downtime, and a
  `PATH` that isn't yours), and how `.timer` units address each. Including `OnCalendar=`,
  `Persistent=`, and `systemd-run` for one-off jobs.
- **A capstone script we build together**: something genuinely useful on your machine — a backup or
  system-audit tool with proper error handling, a lock file, structured logging to the journal, a
  dry-run mode, and a timer unit to run it. Written to be read in six months.
- **TRY THIS ON YOUR MACHINE** — including making a script fail in every way `set -e` *doesn't*
  catch, and watching a timer's catch-up behaviour after simulated downtime.

Say **continue** when you'd like Volume 7.
