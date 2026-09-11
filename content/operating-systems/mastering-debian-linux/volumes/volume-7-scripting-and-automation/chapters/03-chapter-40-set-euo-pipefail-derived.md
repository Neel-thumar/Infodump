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

