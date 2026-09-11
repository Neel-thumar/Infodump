# Volume 1 is ready

**File: `volume-1-the-shell.md`**

## What Volume 2 will cover: USERS, PERMISSIONS, AND PROCESSES

Volume 1 treated your machine as if you were the only person on it. Volume 2 removes that assumption —
which is the assumption Unix was actually built *without*, since it was designed for a shared
minicomputer, not a laptop.

- **Why multi-user permissions existed at all**: timesharing was the original use case, and every
  design decision in the permission model assumes hostile-ish co-tenants rather than a personal
  machine.
- **`/etc/passwd` and `/etc/shadow`**: the actual security problem that forced passwords out of a
  world-readable file, and why the split took as long as it did.
- **Permission bits derived from first principles** — not memorised as a table. Octal notation will
  make sense rather than being something you look up, and `umask` will stop being mysterious.
- **`sudo` internals**: what the **setuid** bit really does at `execve()` time (a direct extension of
  §2.7), how `/etc/sudoers` is evaluated, and Debian's specific choice to leave the root account
  password-less-and-locked when you create a sudo user during install — with the reasoning, not just
  the fact.
- **Processes in depth**: what a PID actually is, the process tree, signals as a mechanism (we've
  already seen 143 = 128 + SIGTERM), `ps`/`top`/`kill`, job control with `&`/`fg`/`bg`, and `/proc`
  as a genuine window into live kernel state — which §5 of TRY THIS has already given you a taste of.
- **The incident**: a verified privilege-escalation vulnerability from the sudo/setuid history,
  chosen and checked rather than assumed, that shows exactly where this model's sharp edges are.
- **TRY THIS ON YOUR MACHINE**: including watching a setuid binary change its own effective UID
  mid-execution, and reading the kernel's live view of a process's credentials.

Say **continue** when you'd like Volume 2.
