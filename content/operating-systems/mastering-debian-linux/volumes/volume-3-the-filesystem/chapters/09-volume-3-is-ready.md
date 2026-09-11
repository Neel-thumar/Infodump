# Volume 3 is ready

**File: `volume-3-the-filesystem.md`**

## What Volume 4 will cover: DEBIAN'S PACKAGE MANAGEMENT, SPECIFICALLY

Volume 3 kept pointing at dpkg and moving on — `dpkg -S`, `dpkg -L`, conffiles, `/usr/local` being
off-limits to packages. Volume 4 is that, properly, and it's the most Debian-specific volume in the
book.

- **Debian's own history**: Ian Murdock, 1993, where the name came from, and the founding documents
  — the **Debian Social Contract** and the **Debian Free Software Guidelines**. Debian's governance
  is genuinely unlike other distributions': a written constitution, an elected Project Leader, and a
  General Resolution process that has settled real fights. That's not trivia; it explains why
  `non-free` is a separate archive area and why some hardware doesn't work out of the box.
- **`dpkg` versus `apt`** — the actual relationship, derived rather than asserted. `dpkg` installs
  *one* package and knows nothing about where to find others; `apt` resolves dependencies and
  fetches. You'll see exactly what breaks when you use the wrong layer.
- **Opening a `.deb` by hand** — it's an `ar` archive containing two tarballs and a version string.
  We'll take one apart and read its `control` file, its maintainer scripts, and its file list
  *before* installing anything.
- **Why dependency resolution is genuinely hard** — it is NP-complete in the general case, and
  modern apt uses a real solver. Plus `sources.list`, pinning, and Debian's
  **stable / testing / unstable (sid) / experimental** model — what that trade-off actually buys and
  costs you.
- **Building from source versus packaging**, and why `checkinstall` and `make install` into
  `/usr/local` (§16.6) are the sane middle ground.
- **The incident**: the **2008 Debian OpenSSL weak-key disaster** — a two-line patch to silence a
  Valgrind warning that destroyed the entropy of every key generated on Debian for nearly two years.
  I'll verify the specifics rather than repeating the summary version, because the details are
  frequently mangled and the actual sequence of events is more interesting than the folklore.
- **TRY THIS ON YOUR MACHINE** — including dissecting a `.deb`, finding out which package owns every
  file on your system, watching apt's solver explain itself, and locating the Debian easter eggs
  Volume 1 only started on.

Say **continue** when you'd like Volume 4.
