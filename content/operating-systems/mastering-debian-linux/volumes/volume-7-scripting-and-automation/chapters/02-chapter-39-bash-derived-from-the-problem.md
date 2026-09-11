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

