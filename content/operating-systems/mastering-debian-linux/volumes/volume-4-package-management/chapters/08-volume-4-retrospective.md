# Volume 4 Retrospective

**1. Debian's governance is not trivia; it's why the packaging has guarantees.** A written Social
Contract, the DFSG, and a Constitution with a defined appeal path mean Debian Policy is
**enforceable** — which is why every package really does ship a `copyright` file, really does obey
the FHS, and really does stay out of `/usr/local`. And the DFSG, with the Debian references removed,
**is** the Open Source Definition.

**2. Your `sources.list` is a philosophical document.** `main` / `contrib` / `non-free` /
`non-free-firmware` are DFSG verdicts, not categories of convenience. And if your wifi worked on
first boot, that's a 2022 General Resolution, visible on your disk.

**3. `dpkg` knows everything about one package and nothing about the internet.** Feed it an
unsatisfiable dependency and it unpacks the files, refuses to configure, and parks the package in
state `iU`. That half-state **is** the argument for apt.

**4. The dpkg database is plain text you can grep**, and `dpkg -S` is a search of `.list` files. An
unfashionable choice that means you can inspect and repair the state by hand when things go wrong.

**5. Debian will not silently overwrite your config files**, because it stored an MD5 of every one
at install time and compares three versions on upgrade. That's what the `rc` state means, and it's
why the modified-conffile audit in TRY THIS #3 is possible at all.

**6. A `.deb` is three files in an `ar` archive, in a mandated order**, so tools can read a
package's identity and dependencies from its first few kilobytes. Which also means you can — and for
anything from outside the archive, should — read a package's maintainer scripts before letting them
run as root.

**7. Dependency resolution is NP-complete**, by reduction from 3-SAT, and apt runs a solver over
tens of thousands of packages fast enough that you don't notice. `Recommends` being installed by
default is a Debian choice; `Pre-Depends` versus `Depends` is about unpack ordering; `aptitude why`
is the tool nothing else replaces.

**8. Testing is less secure than stable**, which is the opposite of what most people assume.
Security fixes reach stable through a dedicated team and reach testing only by migrating from
unstable on the ordinary schedule. Stable plus backports is almost always the right answer.

**9. One signature covers the whole archive**, through a hash chain from `InRelease` to `Packages`
to each `.deb`, with `Valid-Until` preventing freeze attacks. And `apt-key` was removed because a
key added for one vendor could validly sign for **all** repositories — `Signed-By` scopes it
properly.

**10. The 2008 OpenSSL disaster was a process failure, not a careless individual.** A maintainer
doing legitimate quality work removed a line flagged by a memory checker, having asked upstream
first — and nobody read the diff. Twenty months of keys drawn from 32,768 possibilities, silently,
because entropy failures produce output that looks perfectly correct. **The flaw travelled with the
key, not the machine**, so the affected population was never enumerable.

---

