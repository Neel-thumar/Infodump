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

# Chapter 38 — What's Actually Worth Automating

## 38.1 The hook

> **Most shell-scripting tutorials teach you to write `hello.sh`, then a loop that counts to ten,
> then a function that adds two numbers.**
>
> **Nobody has ever needed any of those.**
>
> **So here's a different question: what do you actually have, right now, that you'd lose if this
> laptop died tonight — and how much of it could a script reconstruct?**

## 38.2 THE PROBLEM: your machine is mostly reproducible, except for the part that isn't

Think about restoring this laptop onto new hardware. What do you actually need?

| Thing | Reproducible from a Debian ISO? |
|---|---|
| The base system | **yes** — that's what the installer does |
| Installed packages | **yes, if you have the list** (Volume 4 §23.4) |
| Package *contents* | **yes** — that's what the archive is for |
| **Your edits to `/etc`** | **NO** — and Debian tracks exactly which files those are (Volume 4 §21.7) |
| **`/home`** | **NO** — Volume 3 §16.2 called it the only genuinely irreplaceable thing |
| **Your LUKS header** | **NO**, and without it the disk is unrecoverable (Volume 6 §35.3) |

> **So the interesting artifact is small.** Not a disk image — **a list of packages, a handful of
> modified config files, a partition layout, and a LUKS header backup.** Kilobytes, not gigabytes.
> That's a thing worth generating automatically and keeping somewhere else.

And while we're walking the system anyway, the same pass can answer the security questions from
Volumes 2 and 5 — what's setuid, what's listening, what failed — because **the cost of collecting
them is the same walk.**

## 38.3 The thing we're building

Over §39 to §43 we'll build **`sysnap`** — a system snapshot and audit tool. It will:

```
   1. record every package you EXPLICITLY installed        (Volume 4 §23.4)
   2. find and copy every config file you've MODIFIED      (Volume 4 §21.7)
   3. record the partition/LVM/LUKS layout                 (Volume 3 §17, Volume 6 §35)
   4. audit the security surface:
        • setuid and setgid binaries                       (Volume 2 §11.8)
        • sockets listening on non-loopback addresses      (Volume 5 §29.5)
        • failed systemd units                             (Volume 6 §36.6)
   5. warn about disk AND inode exhaustion                 (Volume 3 §15.9)
   6. write it all to a timestamped directory
   7. log a structured summary to the journal              (Volume 6 §36.7)
   8. run itself weekly, and tell you when it fails        (§42)
```

**Nothing it does is destructive.** It reads, and it writes only into a directory you nominate. That
matters, because §41.4's incident is about what happens when automation touches things it shouldn't.

By the end you'll have a script that is **read-only, idempotent, safely re-runnable, locked against
overlapping instances, logged, and scheduled** — which is a meaningfully different artifact from
`hello.sh`.

---

# Chapter 39 — Bash, Derived From the Problem

Every construct below is introduced because the script needs it, in the order it needs it.

## 39.1 The shebang, and Volume 1's trap

```bash
#!/usr/bin/env bash
```

Volume 1 §1.5 established that **on Debian, `/bin/sh` is `dash`, not bash** — and that a script
declaring `#!/bin/sh` and then using `[[ ]]`, arrays, or `local` will fail.

```bash
bash -c 'if [[ "a" == "a" ]]; then echo "bash: fine"; fi'
sh   -c 'if [[ "a" == "a" ]]; then echo "sh: fine"; fi'
```

```
bash: fine
sh: 1: [[: not found
```

*(Verified in Volume 1.)* **`sysnap` uses arrays and `[[ ]]`, so it must declare bash.** Two forms:

| Shebang | Behaviour |
|---|---|
| `#!/bin/bash` | the bash at that exact path |
| **`#!/usr/bin/env bash`** | **the first `bash` on `$PATH`** |

`env bash` is more portable (macOS and BSD put bash elsewhere), and it respects a newer bash
installed in `/usr/local/bin` (Volume 3 §16.6). The trade-off is that it obeys `$PATH`, which is a
consideration for a setuid script — but Volume 2 §13.6 established the kernel ignores setuid on
scripts anyway, so it's moot here.

## 39.2 Variables, and the rule Volume 1 derived

```bash
SNAPSHOT_ROOT="${SNAPSHOT_ROOT:-$HOME/sysnap}"
timestamp="$(date +%Y-%m-%d_%H%M%S)"
outdir="$SNAPSHOT_ROOT/$timestamp"
```

Three things are happening, and all three are Volume 1 §2.4's expansion order:

**No spaces around `=`.** `VAR = value` runs a *command* called `VAR`. Assignment is syntax, not an
operator.

**`"${SNAPSHOT_ROOT:-$HOME/sysnap}"` — the default-value form.** If the variable is unset or empty,
substitute the default. This is how you make a script configurable by environment variable without
requiring one.

**And the quoting.** Volume 1 §2.4 showed that word splitting and globbing happen to *the result of*
variable expansion:

```bash
mkdir -p /tmp/q && cd /tmp/q
d="two words"
mkdir -p "$d"
ls -d $d      # BROKEN — two arguments
ls -d "$d"    # correct
cd /tmp && rm -rf /tmp/q
```

> **The rule, stated once and applied everywhere after: quote every expansion.** `"$var"`,
> `"$(cmd)"`, `"${arr[@]}"`, `"$@"`. Not "when spaces are possible" — **always**, because the cost is
> two characters and the cost of the exception is Volume 1 §7.6's deleted home directories.

### Parameter expansion worth knowing

These replace a great deal of `sed` and `cut`, and they're built in — no subprocess:

```bash
path="/var/log/syslog.1.gz"

echo "${path##*/}"        # syslog.1.gz    — strip longest leading */
echo "${path%/*}"         # /var/log       — strip shortest trailing /*
echo "${path%%.*}"        # /var/log/syslog — strip longest trailing .*
echo "${path%.gz}"        # /var/log/syslog.1
echo "${#path}"           # 21             — length
echo "${path//\//_}"      # _var_log_syslog.1.gz  — replace ALL
echo "${path/\//|}"       # |var/log/syslog.1.gz  — replace FIRST
```

| Form | Meaning |
|---|---|
| `${v:-default}` | use `default` if `v` unset **or empty** |
| `${v-default}` | use `default` only if **unset** (empty is fine) |
| `${v:=default}` | ...and **assign** it |
| **`${v:?message}`** | **abort with `message` if unset or empty** — §40.4 |
| `${v:+alt}` | use `alt` **only if `v` is set** |
| `${#v}` | length |
| `${v#pat}` / `${v##pat}` | strip shortest / longest **prefix** |
| `${v%pat}` / `${v%%pat}` | strip shortest / longest **suffix** |
| `${v/pat/rep}` / `${v//pat/rep}` | replace first / all |
| `${v^^}` / `${v,,}` | upper / lower case |

Mnemonic for `#` and `%`: on a US keyboard `#` is left of `%`, and `#` strips from the **left**.

## 39.3 Command substitution

```bash
timestamp="$(date +%Y-%m-%d_%H%M%S)"
kernel="$(uname -r)"
debian_version="$(cat /etc/debian_version)"
```

**Use `$(...)`, never backticks.** Backticks nest badly, and the escaping rules inside them are
genuinely confusing:

```bash
echo "$(echo "$(echo nested)")"     # fine
```

**And note what command substitution strips: trailing newlines.** Usually what you want. When it
isn't:

```bash
printf 'a\nb\n\n\n' > /tmp/nl.txt
v="$(cat /tmp/nl.txt)"; printf 'captured %d chars\n' "${#v}"   # 3: "a\nb"
rm -f /tmp/nl.txt
```

## 39.4 Conditionals: `[[ ]]`, `[ ]`, and exit status

Here's a thing worth internalising: **`[` is a command.** Volume 1 §2.5's `type -a`:

```bash
type -a [
type -a [[
```

```
[ is a shell builtin
[ is /usr/bin/[
[[ is a shell keyword
```

`[` is a *builtin and a real program on disk*. `[[` is **bash syntax**. That difference has
consequences:

| | `[ ]` (a command) | `[[ ]]` (syntax) |
|---|---|---|
| Word splitting inside | **yes** — so `[ -f $f ]` breaks on spaces | **no** — `[[ -f $f ]]` is safe |
| Globbing inside | yes | no |
| `&&`, `\|\|` inside | no — use `-a`, `-o` | **yes** |
| `=~` regex | no | **yes** |
| `<` `>` string compare | needs escaping | **yes** |
| POSIX / works in dash | **yes** | **no** (Volume 1 §1.5) |

```bash
f="two words.txt"; touch "/tmp/$f"
[ -f "/tmp/$f" ] && echo "  [ ] with quotes: ok"
[[ -f /tmp/$f ]] && echo "  [[ ]] without quotes: also ok"
rm -f "/tmp/$f"
```

> **In a bash script, use `[[ ]]`.** It's safer by default. Reserve `[ ]` for `#!/bin/sh` scripts,
> where you have no choice.

**The tests `sysnap` needs:**

```bash
[[ -f $path ]]        # exists and is a regular file
[[ -d $path ]]        # is a directory
[[ -r $path ]]        # readable by me
[[ -x $path ]]        # executable
[[ -s $path ]]        # exists and is NON-EMPTY
[[ -L $path ]]        # is a symlink (Volume 3 §15.5)
[[ -z $str ]]         # string is empty
[[ -n $str ]]         # string is non-empty
[[ $a == "$b" ]]      # string equality  (note: RHS quoted, LHS not — see below)
[[ $a == pre* ]]      # PATTERN match — RHS unquoted is a glob
[[ $a =~ ^[0-9]+$ ]]  # regex
(( n > 5 ))           # ARITHMETIC comparison — not [[ ]]
```

> **A subtlety that bites:** inside `[[ ]]`, an **unquoted** right-hand side of `==` is a *pattern*,
> not a literal. `[[ $f == *.txt ]]` is a glob match; `[[ $f == "*.txt" ]]` tests for that literal
> filename. Quote the RHS when you mean equality; leave it bare when you mean matching.

**And the real point: conditionals test exit status** (Volume 1 §2.8). `if` doesn't take a boolean —
it takes a *command* and checks whether it returned 0:

```bash
if command -v shellcheck >/dev/null 2>&1; then
    echo "  shellcheck present"
fi

if ! systemctl is-active --quiet ssh 2>/dev/null; then
    echo "  ssh not running"
fi
```

**`command -v X >/dev/null` is the correct way to test for a program.** Not `which` (an external
program with inconsistent exit statuses across systems), and not `[[ -x /usr/bin/X ]]` (which
hardcodes a path that Volume 3 §16.6 told you may be shadowed by `/usr/local`).

## 39.5 Loops, and the gotcha that eats an hour

### `for` over a list

```bash
for dir in /etc /usr/local /home; do
    [[ -d $dir ]] && printf '%s: %s\n' "$dir" "$(du -sh "$dir" 2>/dev/null | cut -f1)"
done
```

**Never loop over `ls`.** `for f in $(ls)` breaks on any filename containing a space, and Volume 1
§3.6 showed filenames can contain almost anything. Use a glob, which the shell expands into
*separate arguments* (Volume 1 §1.3):

```bash
for f in /etc/apt/sources.list.d/*.list; do
    [[ -e $f ]] || continue        # glob didn't match — see Volume 1 §3.6's nullglob
    echo "  found: $f"
done
```

That `[[ -e $f ]] || continue` guard is necessary because bash's default is to pass an unmatched
pattern through literally. Volume 1 §3.6 covered `shopt -s nullglob` as the alternative.

### `while read` over lines

```bash
while IFS= read -r line; do
    printf '  [%s]\n' "$line"
done < /etc/hostname
```

**Every part of `while IFS= read -r line` is load-bearing:**

| Part | Without it |
|---|---|
| `IFS=` | leading and trailing **whitespace is stripped** from each line |
| **`-r`** | **backslashes are interpreted** — `C:\new` becomes `C:<newline>ew` |
| `line` | with multiple names, `read` splits on `$IFS` |

### THE GOTCHA: a pipe creates a subshell

*(Verified.)*

```bash
count=0
printf 'a\nb\nc\n' | while read -r l; do count=$((count+1)); done
echo "after pipe:        count=$count"

count=0
while read -r l; do count=$((count+1)); done < <(printf 'a\nb\nc\n')
echo "after redirection: count=$count"
```

```
after pipe:        count=0
after redirection: count=3
```

> **The pipe version counted nothing.** Volume 1 §2.6 explained why: each side of a pipeline runs in
> a **forked child**, and Volume 1 §6.4 established that **a child cannot modify its parent's
> variables**. The loop incremented `count` in a subshell that then exited, taking the value with it.
>
> Two fixes, both shown above:
> - **`< <(command)`** — *process substitution* (Volume 5 §18.6), which gives the loop a file
>   descriptor instead of putting it in a pipeline
> - **`< file`** — a plain redirection when the source is a file
>
> This is one of the most common and most baffling bash bugs, because the loop visibly runs and
> visibly does the right thing, and the result visibly vanishes.

**The safest form for filenames**, which handles even newlines in names:

```bash
while IFS= read -r -d '' f; do
    printf '  %s\n' "$f"
done < <(find /etc/apt -maxdepth 1 -type f -print0)
```

`find -print0` separates with NUL bytes; `read -d ''` reads up to a NUL. Since NUL is the one byte a
filename cannot contain (Volume 3 §15), this is airtight.

## 39.6 Arrays

```bash
declare -a sections=(packages configs storage security)

sections+=(disk)                       # append

echo "  count:     ${#sections[@]}"
echo "  all:       ${sections[*]}"
echo "  first:     ${sections[0]}"
echo "  last:      ${sections[-1]}"

for s in "${sections[@]}"; do
    echo "    section: $s"
done
```

> **`"${arr[@]}"` is the only correct way to expand an array**, and the near-misses all fail
> differently:
>
> | Form | Produces |
> |---|---|
> | **`"${arr[@]}"`** | **each element as a separate word, quoting preserved** ✔ |
> | `"${arr[*]}"` | **one** word, elements joined by the first char of `$IFS` |
> | `${arr[@]}` | each element, then **word-split and globbed** — Volume 1 §2.4 |
> | `$arr` | **element 0 only** — silently, which is the worst failure mode |

**Associative arrays** need declaring, and are genuinely useful for a report:

```bash
declare -A findings
findings[setuid]=14
findings[listening]=2
findings[failed_units]=0

for k in "${!findings[@]}"; do
    printf '  %-14s %s\n' "$k" "${findings[$k]}"
done
```

`"${!arr[@]}"` gives the **keys**. (For an indexed array it gives the indices, which is how you loop
over a sparse array.)

## 39.7 Functions

```bash
log() {
    printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2
}

section_header() {
    local name="$1"
    printf '\n===== %s =====\n' "${name^^}"
}

log "starting"
section_header "packages"
```

Four things matter here:

**1. `local` is not optional.** Without it, every variable is **global** and functions silently
clobber each other's state. `local` is a bashism; POSIX `sh` has no equivalent.

**2. Arguments are `$1`, `$2`, … and `"$@"`** — the same mechanism as a script's arguments, because
Volume 1 §2.6 established that a function call isn't a new process, just a new positional-parameter
frame.

**3. Output to `>&2` for logging.** Volume 3 §18.3 explained why stdout and stderr are separate:
**if `log` wrote to stdout, its output would be captured by `$(...)` whenever the function was used
in a substitution**, and would be piped into the next command in a pipeline. Diagnostics go to
stderr; *results* go to stdout. That's the whole convention.

**4. Functions return an exit status, not a value.** This is the conceptual hurdle:

```bash
count_setuid() {
    find /usr/bin /usr/sbin -perm -4000 -type f 2>/dev/null | wc -l
}

n="$(count_setuid)"          # capture STDOUT
echo "  setuid binaries: $n"

is_encrypted() {
    lsblk -no FSTYPE 2>/dev/null | grep -q crypto_LUKS
}

if is_encrypted; then echo "  LUKS in use"; else echo "  no LUKS volume found"; fi
```

> **`return` sets `$?` and only accepts 0–255** — it's the same 8-bit exit status from Volume 1
> §2.8. To return *data*, either `echo` it and capture with `$(...)`, or assign to a variable the
> caller named. There is no third option.

## 39.8 Arithmetic, and a preview of trouble

```bash
count=0
count=$((count + 1))
(( count += 5 ))
echo "  count=$count"

if (( count > 3 )); then echo "  greater than 3"; fi
```

| Form | Is |
|---|---|
| `$(( expr ))` | an **expansion** — produces a value |
| `(( expr ))` | a **command** — produces an exit status |

And that distinction is about to cause a genuine problem. `(( expr ))` returns exit status **0 if the
result is non-zero**, and **1 if the result is zero** — arithmetic truth, inverted into shell truth.

Which means `(( count++ ))` when `count` is 0 evaluates to 0 (post-increment yields the *old* value),
and therefore **returns exit status 1**. Hold that thought for §40.3.

## 39.9 Putting §39 together

A first, deliberately imperfect version:

```bash
#!/usr/bin/env bash
# sysnap — system snapshot. Version 1: no error handling yet.

SNAPSHOT_ROOT="${SNAPSHOT_ROOT:-$HOME/sysnap}"
outdir="$SNAPSHOT_ROOT/$(date +%Y-%m-%d_%H%M%S)"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

mkdir -p "$outdir"
log "writing to $outdir"

# 1. packages you explicitly asked for  (Volume 4 §23.4)
apt-mark showmanual > "$outdir/packages-manual.txt"
log "manual packages: $(wc -l < "$outdir/packages-manual.txt")"

# 2. config files you've modified  (Volume 4 §21.7)
dpkg-query -W -f='${Conffiles}\n' \
  | awk 'NF==2 && $2!="obsolete" {print}' \
  | while IFS=' ' read -r f h; do
        [[ -f $f ]] || continue
        [[ "$(md5sum "$f" | cut -d' ' -f1)" != "$h" ]] && printf '%s\n' "$f"
    done > "$outdir/configs-modified.txt" 2>/dev/null
log "modified configs: $(wc -l < "$outdir/configs-modified.txt")"

log "done"
```

**This works, and it is not yet safe.** Specifically:

- If `mkdir -p` fails (full disk, bad permissions) **the script carries on and writes nowhere**
- If `SNAPSHOT_ROOT` is somehow empty, `outdir` is a path starting with `/` — Volume 1 §7.6's Steam
  bug shape
- If `apt-mark` fails, the file is created **empty**, and the log cheerfully reports 0 packages
- Two copies running at once will interleave

§40 fixes the first three. §43 fixes the fourth.

## 39.10 `shellcheck`, which you should install right now

```bash
sudo apt install shellcheck
shellcheck myscript.sh
```

ShellCheck is a static analyser for shell scripts, and it catches essentially every mistake in this
chapter — unquoted expansions, `for f in $(ls)`, the subshell-pipe bug, `[ ]` where `[[ ]]` was
meant, useless `cat`s (Volume 1 §4.1).

```bash
cat > /tmp/bad.sh <<'EOF'
#!/bin/bash
for f in $(ls /etc)
do
  if [ -f $f ]; then
    echo "found" $f
  fi
done
EOF
shellcheck /tmp/bad.sh
rm -f /tmp/bad.sh
```

Each warning carries a wiki code (`SC2086`, `SC2045`) you can look up.

> **Run shellcheck on everything.** It is the single highest-value tool in this volume, it is
> packaged in Debian, and it finds real bugs in scripts that appear to work — which, as §40 is about
> to show, is the category of bug that matters.

---

# Chapter 40 — `set -euo pipefail`, Derived

## 40.1 The hook

> **Every serious bash style guide tells you to start scripts with `set -euo pipefail`. Most of them
> don't explain what the three flags do, and almost none of them tell you where each one *fails to
> fire* or *fires when you didn't want it to*.**
>
> **Both halves matter, because a safety feature you trust incorrectly is worse than one you don't
> have.**

## 40.2 `set -e` — exit on error

By default, **bash ignores failures and carries on.** Which produces Volume 1 §7.6's Steam bug shape:

```bash
cat > /tmp/noe.sh <<'EOF'
outdir="/nonexistent/deeply/nested"
mkdir "$outdir"                    # FAILS
echo "important data" > "$outdir/data.txt"    # also fails
echo "Backup complete!"            # ...and this cheerfully lies
EOF
bash /tmp/noe.sh; echo "exit status: $?"
rm -f /tmp/noe.sh
```

```
mkdir: cannot create directory '/nonexistent/deeply/nested': No such file or directory
/tmp/noe.sh: line 3: /nonexistent/deeply/nested/data.txt: No such file or directory
Backup complete!
exit status: 0
```

**"Backup complete!" and exit status 0**, from a script that backed nothing up. That is the default,
and it's why `set -e` exists:

```bash
set -e     # or: set -o errexit
```

> With `errexit`, the shell exits immediately when a command returns non-zero — **except in a list of
> cases that is longer than anyone expects.**

## 40.3 Where `set -e` does NOT fire — and how my own test got this wrong

I tested these while writing, and **my first attempt produced results that contradicted what I
expected**. The reason turned out to be the most useful thing in the chapter, so here it is.

### The mistake

I wrote tests shaped like this:

```bash
( set -e; count=0; ((count++)); echo "survived" ) || echo "DIED"
```

and got **`survived`** — apparently disproving my claim that `((count++))` kills a script.

**The harness was wrong.** That subshell sits on the **left-hand side of `||`** — and "any command in
a `&&`/`||` list except the last" is *exactly* one of the cases where `set -e` is disabled. **My test
for whether `set -e` fires had `set -e` switched off inside it**, by the very rule I was testing.

Re-run as actual script files, checking the exit status *(all five verified)*:

| Script | Result |
|---|---|
| `set -e; count=0; ((count++)); echo REACHED` | **exit 1, nothing printed — DIED** |
| `set -e; count=0; count=$((count+1)); echo REACHED` | exit 0, printed — survived |
| `set -e; f() { local x; x=$(false); echo REACHED; }; f` | **exit 1 — DIED** |
| `set -e; g() { local x=$(false); echo REACHED; }; g` | **exit 0, printed — SURVIVED** |
| `set -e; false && echo never; echo REACHED` | exit 0, printed — survived |

> **The lesson underneath the lesson:** `set -e`'s exceptions are subtle enough that they can
> invalidate your test for `set -e`'s exceptions. If you're checking whether errexit fires, put the
> code in a **file**, run it, and check `$?`. Don't wrap it in anything.

### The list

`set -e` does **not** exit when the failing command is:

**1. Any command in a `&&` or `||` list, except the last.** *(Verified.)*

```bash
false || echo "  this runs, and the script continues"
false && echo "  never runs"
echo "  ...and execution reaches here too"
```

This is the one that makes `cmd || true` a working idiom — and the one that invalidated my test.

**2. The condition of `if`, `while`, or `until`.** *(Verified.)*

```bash
if ! grep -q nonexistent /etc/hostname; then
    echo "  grep failed; the script did NOT exit"
fi
```

This is by design — otherwise `if` would be useless — but it means **a function called in a condition
loses errexit for its whole body**, not just for the call.

> **Confidence: high** that errexit is suspended inside a function invoked in a condition context.
> This is the single most-cited reason experienced people distrust `set -e`.

**3. A command inverted with `!`.**

**4. Any command in a pipeline except the last.** *(Verified — §40.5.)*

**5. `local x=$(cmd)` — and this one is genuinely nasty.** *(Verified.)*

```bash
f() { local x; x=$(false); echo "not reached"; }    # DIES correctly
g() { local x=$(false); echo "REACHED"; }           # SURVIVES
```

**Why:** `local` is a *builtin command*. Its exit status is `local`'s own — which is 0, because
declaring the variable succeeded. The command substitution's failure is discarded before `set -e`
ever sees it.

> **So: declare and assign on separate lines.** `local x` then `x=$(cmd)`. Same for `export`,
> `declare` and `readonly`, which have the identical problem. This is a real bug source in scripts
> that look careful.

**6. `(( expr ))` evaluating to zero.** *(Verified — the script died silently.)*

§39.8 set this up: `(( ))` returns exit status 1 when the arithmetic result is 0. So:

```bash
count=0
(( count++ ))     # post-increment yields 0 → exit status 1 → set -e KILLS THE SCRIPT
```

And it dies **silently**, with no message, because nothing failed in any visible way.

> **The fixes**, in order of preference:
> ```bash
> count=$(( count + 1 ))     # an EXPANSION, not a command — no exit status involved
> (( ++count ))              # pre-increment yields 1 — works, but fragile if count is -1
> (( count++ )) || true      # explicit, and honest about what you're suppressing
> ```
> **Use the first one.** It has no exit status at all, so the trap can't spring.

## 40.4 `set -u` — Volume 1's Steam debt

Volume 1 §7.6 showed Valve's `rm -rf "$STEAMROOT/"*` deleting users' home directories when
`STEAMROOT` was empty, and noted `set -u` would have stopped it. Here's the mechanism:

```bash
cat > /tmp/u.sh <<'EOF'
set -u
echo "value is [${NOPE}]"
echo "unreachable"
EOF
bash /tmp/u.sh; echo "exit: $?"
rm -f /tmp/u.sh
```

```
/tmp/u.sh: line 2: NOPE: unbound variable
exit: 1
```

**The script stopped.** Volume 1 §7.6's entire incident, prevented by one line.

**Where `set -u` bites you:**

| Situation | Problem | Fix |
|---|---|---|
| Testing whether a variable is set | `[[ -z $MAYBE ]]` **errors** instead of testing | `[[ -z ${MAYBE:-} ]]` |
| `"$@"` with no arguments | errored in **bash < 4.4** | modern bash is fine — *verified* |
| `"${arr[@]}"` on an empty array | same historical issue | `"${arr[@]:-}"` if supporting old bash |
| Sourcing someone else's script | their code may not be `-u` clean | `set +u` around the `source` |

> **The idiom to internalise: `${VAR:-}` means "expand to empty if unset, and don't complain."** It's
> how you write `-u`-safe code that still handles optional variables.

**And the more explicit sibling**, which gives a *message* rather than a generic error:

```bash
bash -c 'ROOT=""; : "${ROOT:?refusing to run with an empty ROOT}"; echo unreachable'
```

```
bash: line 1: ROOT: refusing to run with an empty ROOT
```

The `:` is the null command — it does nothing but expand its arguments, which triggers the check.
**For anything that will be interpolated into a destructive path, use this rather than relying on
`-u`**, because it documents the intent and produces a message a human can act on.

## 40.5 `set -o pipefail` — Volume 1's other debt

Volume 1 §2.8 showed this and deferred the fix:

```bash
false | true; echo "  status: $?"
```

```
  status: 0
```

**The failure is invisible.** A pipeline's exit status is its *last* command's, so `grep pattern file
| head` reports success even when `grep` couldn't open the file.

```bash
set -o pipefail
false | true; echo "  with pipefail: $?"
set +o pipefail
```

With `pipefail`, the status is **the rightmost non-zero** status in the pipeline. And
`PIPESTATUS` has the full picture either way:

```bash
false | true | false | true
echo "  PIPESTATUS: ${PIPESTATUS[*]}"
```

### Where `pipefail` bites — and it's a good story

*(Verified.)*

```bash
( set -o pipefail; yes 2>/dev/null | head -1 >/dev/null; echo "  with pipefail:    $?" )
(                  yes 2>/dev/null | head -1 >/dev/null; echo "  without pipefail: $?" )
```

```
  with pipefail:    141
  without pipefail: 0
```

**141.** Volume 2 §12.4.1 decoded exactly that number: **128 + 13 = SIGPIPE**.

> **Here's the full chain, and it spans three volumes.** `head -1` prints one line and exits, closing
> its end of the pipe. `yes` writes again, into a pipe with no reader, and **the kernel kills it with
> SIGPIPE** — which is the mechanism Volume 2 §12.4.1 identified as *how every Unix pipeline knows
> when to stop*.
>
> So `yes` "failing" is not a failure. It is the pipeline working exactly as designed. **But
> `pipefail` cannot tell the difference**, and reports 141.

Which means `set -o pipefail` will spuriously fail **any** pipeline with an early-exiting consumer —
`| head`, `| grep -q`, `| head -n 5`, `| sed 1q`. Common patterns, all of them.

**The fix is to be explicit about which failures you care about:**

```bash
# tolerate the SIGPIPE, keep pipefail everywhere else
first_line="$( { some_command || true; } | head -1 )"

# or turn it off for one pipeline
set +o pipefail
count="$(long_output | head -100 | wc -l)"
set -o pipefail
```

## 40.6 `trap` — cleanup that actually happens

`set -e` makes your script exit at unpredictable points. Which is only safe if **cleanup happens
regardless of where it exits.**

```bash
cat > /tmp/tr.sh <<'EOF'
set -euo pipefail

tmpdir="$(mktemp -d)"
cleanup() {
    local status=$?
    rm -rf "$tmpdir"
    (( status == 0 )) && echo "cleanup: normal exit" >&2 \
                      || echo "cleanup: exiting with status $status" >&2
    return 0
}
trap cleanup EXIT
trap 'echo "interrupted" >&2; exit 130' INT TERM

echo "working in $tmpdir" >&2
echo "data" > "$tmpdir/file"
false                        # <- boom
echo "never reached"
EOF
bash /tmp/tr.sh; echo "final status: $?"
rm -f /tmp/tr.sh
```

| Trap | Fires on |
|---|---|
| **`EXIT`** | **any exit — normal, `set -e`, explicit `exit`.** The reliable one. |
| `ERR` | a command failing under `set -e` (with the same exceptions as §40.3) |
| `INT` | Ctrl+C — **SIGINT**, Volume 2 §12.4 |
| `TERM` | `kill` — SIGTERM |
| `HUP` | terminal closed — Volume 2 §12.6 |

> **`trap cleanup EXIT` is the single most valuable line in a script that creates temporary files.**
> It fires on every exit path including the ones `set -e` creates, so `mktemp -d` never leaks. And
> note `local status=$?` as the **first** line of the handler — capture the exit status before
> anything else clobbers it.

**Also note `mktemp -d`, not a name you invented.** Volume 5 §19.7 covered why: a predictable
temporary path in a world-writable directory is a symlink attack, and Volume 2 §10.6's sticky bit
does not prevent it.

## 40.7 The honest summary

```bash
set -euo pipefail
```

| Flag | Buys you | Costs you |
|---|---|---|
| `-e` | script stops on unhandled failure | **seven exception cases** (§40.3), some silent |
| `-u` | no more empty-variable disasters | must write `${VAR:-}` for optional variables |
| `-o pipefail` | pipeline failures become visible | **spurious 141s** on `\| head` (§40.5) |

> **Use it. And do not mistake it for error handling.**
>
> `set -euo pipefail` converts *silent* failures into *loud* ones. It does not decide what should
> happen when something fails, it does not clean up, and it does not tell you which of seven
> exceptions just swallowed your error. A script that genuinely matters still checks the things that
> matter, explicitly:
>
> ```bash
> mkdir -p "$outdir" || { echo "cannot create $outdir" >&2; exit 1; }
> : "${SNAPSHOT_ROOT:?SNAPSHOT_ROOT must be set}"
> command -v apt-mark >/dev/null || { echo "apt-mark not found" >&2; exit 1; }
> ```

---

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

# Chapter 43 — The Capstone: `sysnap`

Everything from §39 to §42, as one artifact. **It is read-only** — it collects, and writes only into
a directory you nominate.

## 43.1 The script

```bash
#!/usr/bin/env bash
#
# sysnap — snapshot the reproducible state of a Debian system.
# Read-only: collects information, modifies nothing.

set -euo pipefail

VERSION="1.0"
PROGNAME="${0##*/}"
SNAPSHOT_ROOT="${SNAPSHOT_ROOT:-$HOME/sysnap}"
LOCKFILE="${TMPDIR:-/tmp}/sysnap.lock"
DRY_RUN=0
VERBOSE=0

declare -A COUNTS=()
declare -a WARNINGS=()

# --------------------------------------------------------------- logging
log()  { printf '[%(%H:%M:%S)T] %s\n' -1 "$*" >&2; }
vlog() { (( VERBOSE )) && log "  $*"; return 0; }
warn() { WARNINGS+=("$*"); printf '[%(%H:%M:%S)T] WARN: %s\n' -1 "$*" >&2; }
die()  { printf '%s: %s\n' "$PROGNAME" "$*" >&2; exit 1; }

usage() {
    cat <<EOF
$PROGNAME $VERSION — snapshot a Debian system's reproducible state

Usage: $PROGNAME [OPTIONS]

  -o, --output DIR   parent directory for snapshots (default: \$HOME/sysnap)
  -n, --dry-run      show what would be collected; write nothing
  -v, --verbose      report each step
  -h, --help         this message

Exits non-zero if any collector produced a warning.
EOF
}

# --------------------------------------------------------------- helpers
have() { command -v "$1" >/dev/null 2>&1; }

# collect NAME COMMAND... — run COMMAND, save stdout, record the line count
collect() {
    local name="$1"; shift
    if (( DRY_RUN )); then
        log "would collect: $name  (\$ $*)"
        COUNTS[$name]=0
        return 0
    fi
    if "$@" > "$outdir/$name.txt" 2>/dev/null; then
        COUNTS[$name]=$(wc -l < "$outdir/$name.txt")
        vlog "$name: ${COUNTS[$name]} lines"
    else
        COUNTS[$name]=0
        warn "$name: collector exited non-zero"
    fi
    return 0                      # ← see §43.2. This is not optional.
}

# --------------------------------------------------------------- sections
sec_packages() {                                    # Volume 4 §23.4
    have apt-mark || { warn "apt-mark not found; skipping packages"; return 0; }
    collect packages-manual apt-mark showmanual
    collect packages-all    dpkg-query -W -f='${binary:Package}\t${Version}\n'
    return 0
}

sec_configs() {                                     # Volume 4 §21.7
    have dpkg-query || { warn "dpkg-query not found; skipping configs"; return 0; }
    if (( DRY_RUN )); then
        log "would collect: configs-modified"
        COUNTS[configs-modified]=0
        return 0
    fi
    local out="$outdir/configs-modified.txt"
    : > "$out"
    local f h n=0
    while IFS=' ' read -r f h _; do
        [[ -f $f && -r $f ]] || continue
        [[ "$(md5sum "$f" | cut -d' ' -f1)" == "$h" ]] && continue
        printf '%s\n' "$f" >> "$out"
        n=$(( n + 1 ))            # ← NOT (( n++ )) — §40.3 case 6
    done < <(dpkg-query -W -f='${Conffiles}\n' 2>/dev/null \
             | awk 'NF>=2 && $2!="obsolete"')
    COUNTS[configs-modified]=$n
    vlog "configs-modified: $n files"
    return 0
}

sec_storage() {                                     # Volume 3 §15.9, §17
    have lsblk && collect storage-lsblk lsblk -f
    collect storage-df  df -h
    collect storage-dfi df -i                       # INODES, not just bytes
    [[ -r /etc/fstab ]] && collect storage-fstab cat /etc/fstab
    return 0
}

sec_security() {                                    # Volume 2 §11.8, Volume 5 §29.5
    collect security-setuid find / -xdev -perm -4000 -type f
    collect security-setgid find / -xdev -perm -2000 -type f
    have ss && collect security-listening ss -tlnH
    return 0
}

sec_system() {
    collect system-kernel uname -a
    [[ -r /etc/os-release ]] && collect system-osrelease cat /etc/os-release
    [[ -r /proc/cmdline ]]   && collect system-cmdline   cat /proc/cmdline
    return 0
}

# --------------------------------------------------------------- lifecycle
cleanup() {
    local status=$?               # capture FIRST — §40.6
    (( status == 0 )) || log "exiting with status $status"
    return 0
}

main() {
    while (( $# )); do
        case "$1" in
            -o|--output)  SNAPSHOT_ROOT="${2:?--output needs a directory}"; shift 2 ;;
            -n|--dry-run) DRY_RUN=1; shift ;;
            -v|--verbose) VERBOSE=1; shift ;;
            -h|--help)    usage; exit 0 ;;
            *)            die "unknown option: $1 (try --help)" ;;
        esac
    done

    : "${SNAPSHOT_ROOT:?SNAPSHOT_ROOT must not be empty}"   # §40.4

    trap cleanup EXIT
    trap 'log "interrupted"; exit 130' INT TERM

    outdir="$SNAPSHOT_ROOT/$(date +%Y-%m-%d_%H%M%S)"
    if (( DRY_RUN )); then
        log "DRY RUN — nothing will be written"
    else
        mkdir -p "$outdir" || die "cannot create $outdir"
        log "writing to $outdir"
    fi

    local -a sections=(packages configs storage security system)
    local s
    for s in "${sections[@]}"; do
        vlog "--- section: $s"
        "sec_$s"
    done

    local total=0 k
    for k in "${!COUNTS[@]}"; do total=$(( total + COUNTS[$k] )); done

    if (( ! DRY_RUN )); then
        {   printf 'sysnap %s\ngenerated: %s\nhost: %s\n\n' \
                   "$VERSION" "$(date -Is)" "$(hostname)"
            for k in $(printf '%s\n' "${!COUNTS[@]}" | sort); do
                printf '  %-24s %s\n' "$k" "${COUNTS[$k]}"
            done
            if (( ${#WARNINGS[@]} )); then
                printf '\nwarnings:\n'
                printf '  - %s\n' "${WARNINGS[@]}"
            fi
        } > "$outdir/SUMMARY.txt"
        cat "$outdir/SUMMARY.txt"
    fi

    log "collected $total records across ${#COUNTS[@]} files, ${#WARNINGS[@]} warnings"

    if have logger && (( ! DRY_RUN )); then
        logger -t sysnap -p user.info \
          "snapshot ok dir=$outdir files=${#COUNTS[@]} records=$total warnings=${#WARNINGS[@]}"
    fi

    (( ${#WARNINGS[@]} == 0 )) || return 1          # §41.4: fail loudly
}

# Take the lock for the whole run — §42.4 failing #7, belt and braces
exec 9>"$LOCKFILE"
flock -n 9 || die "another sysnap is already running"

main "$@"
```

Install it:

```bash
sudo install -m 755 sysnap /usr/local/bin/sysnap     # Volume 3 §16.6: /usr/local is YOURS
shellcheck /usr/local/bin/sysnap
sysnap --dry-run -v
sysnap -v
```

Verified output on a real run:

```
[05:18:07] writing to /tmp/cap/out/2026-09-11_051807
[05:18:07]   --- section: packages
[05:18:09]   packages-manual: 729 lines
[05:18:09]   packages-all: 866 lines
...
  configs-modified         1
  packages-all             866
  packages-manual          729
  security-setgid          4
  security-setuid          11
  storage-df               8
  storage-dfi              8
  storage-fstab            1
  storage-lsblk            6
  system-cmdline           1
  system-kernel            1
  system-osrelease         13
[05:18:07] collected 1649 records across 12 files, 0 warnings
```

## 43.2 The bug I wrote while writing this chapter

The `return 0` at the end of every section function is not stylistic padding. **My first version
didn't have it, and the script silently stopped two sections early.**

Here's what happened, verified:

```
[05:17:49]   security-setuid: 11 lines
[05:17:50]   security-setgid: 4 lines
[05:17:50] exiting with status 1
```

**`sec_system` never ran.** No error message, no indication of what went wrong.

**The cause.** `sec_security` ended with:

```bash
have ss && collect security-listening ss -tlnH
```

My test machine has no `ss`. So `have ss` returned 1, the `&&` list returned 1, and **that was the
function's last command — so the function returned 1.** Called bare under `set -e`, a function
returning non-zero **exits the script.**

Isolated *(both halves verified)*:

```bash
# dies at `sec`, exit status 1, nothing after it runs
set -euo pipefail
have() { command -v "$1" >/dev/null 2>&1; }
sec() { have definitely-not-real && echo "collected"; }
sec
echo "REACHED"                # never printed

# with `return 0` appended to sec, this prints and exits 0
```

> **This is §40.3's list biting in practice**, in code written by someone who had just finished
> documenting §40.3. Which is the honest point of including it:
>
> **`cmd_a && cmd_b` as the final line of a function is a landmine under `set -e`**, because the
> function's exit status becomes the `&&` list's. It's completely invisible in review — the line
> looks like a conditional action, not a return value.
>
> **Three fixes**, in order of preference:
> ```bash
> sec() { if have ss; then collect ...; fi; }     # clearest
> sec() { have ss && collect ...; return 0; }     # explicit
> sec() { have ss && collect ... || true; }       # terse, easy to misread
> ```
>
> And the reason I caught it at all is that I **ran the script and checked the exit status** rather
> than reading it. §40.7's point exactly: `set -euo pipefail` converts silent failures into loud
> ones, and then you still have to listen.

Note the same class of fix elsewhere in the script: `n=$(( n + 1 ))` rather than `(( n++ ))`, because
§40.3 case 6 would kill the script on the very first increment when `n` is 0.

## 43.3 The service unit

```ini
# /etc/systemd/system/sysnap.service
[Unit]
Description=System configuration snapshot
Documentation=https://example.invalid/sysnap
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sysnap --output /var/backups/sysnap --verbose

# §41.3 failing #1 — an explicit, testable environment
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WorkingDirectory=/

# §41.3 failing #3 — Volume 6 §36.5's cgroup resource control
MemoryMax=256M
CPUQuota=50%
TasksMax=64

# it only ever reads; let the kernel enforce that
ProtectSystem=strict
ReadWritePaths=/var/backups/sysnap
ProtectHome=read-only
PrivateTmp=true
NoNewPrivileges=true

# §43.5
OnFailure=sysnap-failure@%n.service
```

> **`ProtectSystem=strict` mounts the entire filesystem read-only for this service**, with only
> `ReadWritePaths=` writable. `NoNewPrivileges=true` means the process cannot gain privileges via
> setuid — Volume 2 §11.8's mechanism, disabled at the kernel level for this unit specifically.
>
> These are cheap and worth having on anything scheduled. A backup script has no business writing
> outside its output directory, and now it structurally cannot.

## 43.4 The timer unit

```ini
# /etc/systemd/system/sysnap.timer
[Unit]
Description=Run system snapshot weekly

[Timer]
OnCalendar=Sun 04:00
Persistent=true            # §42.4 failing #5 — catch up if the laptop was off
RandomizedDelaySec=30min   # §42.4 failing #6
AccuracySec=1m

[Install]
WantedBy=timers.target
```

```bash
systemd-analyze calendar "Sun 04:00"        # check BEFORE installing
sudo systemctl daemon-reload
sudo systemctl enable --now sysnap.timer
systemctl list-timers sysnap.timer
sudo systemctl start sysnap.service         # run it now, once
journalctl -u sysnap.service -n 30
```

## 43.5 Failing loudly — §41.4's actual lesson

Toy Story 2's backups ran nightly and produced nothing, and **nobody was told**. The fix is one
directive plus one templated unit:

```ini
# /etc/systemd/system/sysnap-failure@.service
[Unit]
Description=Report failure of %i

[Service]
Type=oneshot
ExecStart=/usr/bin/logger -t sysnap -p user.err "UNIT FAILED: %i"
ExecStart=/usr/bin/notify-send -u critical "sysnap failed" "See journalctl -u %i"
```

The `@` makes it a **template**: `OnFailure=sysnap-failure@%n.service` passes the failing unit's name
in as `%i`, so one handler serves every unit you point at it.

Test that the alarm actually works, which is the whole point:

```bash
sudo systemctl start sysnap.service         # should succeed
sudo SNAPSHOT_ROOT=/nonexistent/path systemctl start sysnap.service 2>&1 | tail -3
journalctl -t sysnap -p err -n 10
systemctl --failed
```

> **Verify the failure path, not just the success path.** A monitoring system nobody has ever seen
> fire is indistinguishable from one that doesn't work — which is precisely the Pixar failure mode.

And a monthly nudge to check the thing exists at all:

```bash
ls -lt /var/backups/sysnap/ | head -5
diff -u <(ls /var/backups/sysnap/*/packages-manual.txt | tail -2 | head -1 | xargs cat) \
        <(apt-mark showmanual) | head -20
```

## 43.6 What you now have

```
   /usr/local/bin/sysnap                    the script      (Volume 3 §16.6)
   /etc/systemd/system/sysnap.service       what to run     (Volume 6 §36)
   /etc/systemd/system/sysnap.timer         when            (§42)
   /etc/systemd/system/sysnap-failure@.service   the alarm  (§43.5)
   /var/backups/sysnap/<timestamp>/         the output
```

A weekly, logged, locked, resource-limited, read-only, self-alarming job that captures everything
about this machine that a Debian ISO can't reproduce — and complains when it doesn't.

**Extensions worth making it yours:**

```bash
# the LUKS header — Volume 6 §35.3 said this, and it is the one that is unrecoverable
sudo cryptsetup luksHeaderBackup /dev/nvme0n1p3 --header-backup-file "$outdir/luks-header.img"

# actually COPY the modified configs, not just list them
tar czf "$outdir/etc-modified.tar.gz" -T "$outdir/configs-modified.txt" 2>/dev/null

# failed units — Volume 6 §36.6
collect system-failed systemctl list-units --state=failed --no-legend

# prune old snapshots (the only line that deletes anything — write it carefully)
find "$SNAPSHOT_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +90 -print
```

> **Note that last one prints rather than deletes.** Volume 1 §7.6 and §41.4 are both about deletion
> going wrong. When you add `-delete`, run it with `-print` first, every time, and keep `-mindepth 1`
> so the expression can never match `$SNAPSHOT_ROOT` itself.

---

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

# Volume 7 is ready

**File: `volume-7-scripting-and-automation.md`**

## What Volume 8 will cover: ADVANCED DEEP DIVES, AND THE SYNTHESIS

The final volume, and it closes the book.

- **Syscalls as the boundary.** Volume 1 §2.7 walked through `execve()` without ever saying what a
  system call *is* mechanically — the CPU privilege transition, the `syscall` instruction, the kernel
  entry path. We'll count them, trace them, and look at what `strace` is actually doing.
- **Kernel modules and drivers** — what `.ko` files are, how `modprobe` resolves dependencies, why
  Secure Boot forces module signing (Volume 6 §32.6), and building one.
- **Containers demystified** — **namespaces and cgroups are the whole trick**, and you'll build a
  container by hand with `unshare` and `nsenter`, no Docker involved. Volume 6 §36.5's cgroups and
  Volume 3 §17.4's bind mounts turn out to be two of the three ingredients.
- **Compiling your own kernel** — why you'd ever want to, and Debian's `make deb-pkg` path that
  produces a real `.deb` (Volume 4) rather than a pile of files in `/`.
- **Firewalls**: `nftables`, why Debian moved from `iptables`, and building one rule you can verify —
  flagged clearly, since it can affect network access.
- **The synthesis**: one page-load traced through **every volume at once** — shell, permissions,
  filesystem, packages, network, boot, and automation, all visible in a single action.
- **And a "rabbit holes worth falling into" section** — the genuinely obscure and delightful corners
  of Linux and Debian that didn't fit anywhere else.

Say **continue** when you'd like Volume 8.
