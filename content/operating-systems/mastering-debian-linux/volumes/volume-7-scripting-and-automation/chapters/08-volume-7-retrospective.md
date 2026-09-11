# Volume 7 Retrospective

**1. The thing worth automating is small.** Not a disk image — a package list, a handful of modified
config files, a partition layout and a LUKS header. Everything else on your machine is reproducible
from a Debian ISO, and Volume 4 §21.7 already tracks exactly which files aren't.

**2. Quote every expansion, and `"${arr[@]}"` is the only correct array form.** `$arr` silently gives
you element zero, which is the worst failure mode available — it looks like it works.

**3. A pipe creates a subshell, and a child cannot modify its parent.** `cmd | while read; do
count=...; done` visibly runs and visibly loses its result. `< <(cmd)` fixes it. This is Volume 1
§2.6 and §6.4 producing a bug that looks like magic.

**4. `set -euo pipefail` has seven documented holes**, and two of them are vicious: `local x=$(cmd)`
swallows the failure entirely because `local`'s own status masks it, and `(( n++ ))` **kills** the
script when `n` is 0 because arithmetic zero is shell-false. Use `n=$(( n + 1 ))`.

**5. `pipefail` will spuriously fail any pipeline with an early-exiting consumer.** `yes | head -1`
returns **141** — which Volume 2 §12.4.1 decoded as 128 + SIGPIPE, the mechanism that makes every
Unix pipeline terminate. pipefail cannot distinguish "the pipeline worked as designed" from "the
pipeline failed."

**6. I wrote a bug of exactly the class I'd just documented.** `have ss && collect ...` as the last
line of a function makes the function's exit status the `&&` list's, which under `set -e` silently
kills the script two sections early. Caught only by running it and checking `$?`. **`set -euo
pipefail` makes failures loud; it doesn't make you listen.**

**7. My own test harness was defeated by the rule it was testing.** Wrapping a `set -e` test in
`( ... ) || echo` disables `set -e` by exception #1. To test errexit, use a file and check the exit
status.

**8. cron has eight specific limitations**, and #4 is the one that matters: output is mailed to the
user, and on a desktop with no MTA it goes **nowhere**. Your job can fail nightly for a year in
complete silence. Plus `SHELL=/bin/sh` means dash, and `run-parts` **silently ignores any filename
containing a dot** — verified, and a reliable way to have a backup that has never run.

**9. Toy Story 2's `rm -rf` was not the failure.** The failure was a backup that had been silently
broken for weeks. "The job ran" is not "the job worked," and a backup you've never restored from is a
hypothesis. The film survived on a home workstation that existed for unrelated reasons.

**10. systemd timers address all eight of cron's limitations** — but the decisive one is that
stdout and stderr go to the **journal**, tagged with the unit, whether or not anyone is listening.
Plus `Persistent=true` for catch-up (implemented as stamp files you can look at), `RandomizedDelaySec`
for jitter — which Debian's own `apt-daily.timer` uses with 12 hours of it — and cgroup resource
limits from Volume 6 §36.5.

**11. `systemd-analyze calendar` is the fifth "validate before you activate" tool in this book**,
after `visudo`, `findmnt --verify`, `sshd -t` and `systemd-analyze verify`. Debian gives you one for
every configuration file that can ruin your day.

**12. Test the failure path.** `OnFailure=`, a non-zero exit when a collector produces nothing, and a
deliberate broken run to confirm the alarm fires. **An alarm nobody has heard is indistinguishable
from a broken one** — which is the whole of §41.4 in a sentence.

---

