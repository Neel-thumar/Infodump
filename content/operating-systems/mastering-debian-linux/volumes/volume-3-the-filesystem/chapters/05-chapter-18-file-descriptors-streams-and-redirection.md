# Chapter 18 — File Descriptors, Streams, and Redirection

## 18.1 The hook

> **A program has input and output. That's two channels. So why does Unix give every process
> *three*?**

## 18.2 What a file descriptor actually is

Volume 1 §2.2 showed `/proc/$$/fd/` and called them descriptors. Here's the structure underneath,
and it has **three levels**, not one:

```
   PER-PROCESS FD TABLE          OPEN FILE DESCRIPTIONS         INODES
   (one per process)             (system-wide)                  (one per file)
   ┌─────┬──────────┐            ┌────────────────────┐         ┌──────────────┐
   │ fd 0│      ────┼───────────►│ offset: 0          │────────►│ inode 2801667│
   │ fd 1│      ────┼─────┐      │ flags: O_RDONLY    │    ┌───►│ mode, size,  │
   │ fd 2│      ────┼───┐ │      └────────────────────┘    │    │ blocks, ...  │
   │ fd 3│      ────┼─┐ │ │      ┌────────────────────┐    │    └──────────────┘
   └─────┴──────────┘ │ └─┴─────►│ offset: 4096       │────┘
                      │          │ flags: O_WRONLY|   │
                      │          │        O_APPEND    │
                      │          └────────────────────┘
                      │          ┌────────────────────┐         ┌──────────────┐
                      └─────────►│ offset: 0          │────────►│ inode 2801902│
                                 └────────────────────┘         └──────────────┘
```

| Level | Holds | Shared how |
|---|---|---|
| **fd table** | small integers → pointers | **per process**; copied by `fork()` |
| **open file description** | **the file offset** and the status flags | **shared** by `fork()` and `dup2()` |
| **inode** | everything from Chapter 15 | shared by everyone who opens the file |

**The middle level is the one that explains real behaviour**, and you can see it. *(Verified.)*

```bash
( /bin/echo "from child 1"; /bin/echo "from child 2" ) > /tmp/shared.txt
cat /tmp/shared.txt
```

```
from child 1
from child 2
```

Two separate `/bin/echo` **processes**, one redirection. Both inherited the same **open file
description** across `fork()`, so they shared one offset — the second wrote *after* the first
instead of on top of it.

Now two separate redirections:

```bash
/bin/echo "first"  > /tmp/sep.txt
/bin/echo "second" > /tmp/sep.txt
cat /tmp/sep.txt
rm -f /tmp/shared.txt /tmp/sep.txt
```

```
second
```

Two `open()` calls, two independent open file descriptions, each starting at offset 0 with
`O_TRUNC`. The second obliterated the first.

> **That's why `>>` exists and isn't just "`>` that doesn't truncate."** `>>` sets **`O_APPEND`** on
> the open file description, which makes every write seek-to-end **atomically in the kernel**. Two
> processes appending to the same log with `>>` cannot interleave mid-line; two processes with `>`
> and manual seeking absolutely can.

## 18.3 The three standard descriptors, and why there are three

By convention — not by kernel enforcement — every process starts with:

| fd | Name | Direction | Default |
|---|---|---|---|
| **0** | `stdin` | in | your terminal |
| **1** | `stdout` | out | your terminal |
| **2** | `stderr` | out | your terminal |

```bash
ls -l /proc/$$/fd/0 /proc/$$/fd/1 /proc/$$/fd/2
```

All three point at your pty (Volume 1 §2.2). So why split output in two, when they go to the same
place anyway?

**Because they don't stay in the same place.** Consider what happens with only one output stream:

```
   prog > results.txt        →  error messages land IN results.txt, corrupting your data
   prog | analyse            →  error text is fed to `analyse` AS INPUT
```

Both are obviously broken, and both are fixed by having a second output channel that redirection
doesn't touch by default. Watch it:

```bash
ls /etc /nonexistent-dir > /tmp/out.txt
```

```
ls: cannot access '/nonexistent-dir': No such file or directory
```

**The error appeared on your terminal even though you redirected output**, and `/tmp/out.txt`
contains only the real listing. That separation is the entire point.

```bash
head -3 /tmp/out.txt
ls /etc /nonexistent-dir 2>/dev/null | wc -l     # count only the good output
rm -f /tmp/out.txt
```

> **The historical anecdote — Confidence: moderate.** The story usually told is that early Unix had
> only `stdout`, and error messages were getting mixed into output that was being sent to a
> **phototypesetter** — so the errors were typeset onto expensive photographic paper. That
> reportedly prompted the split. I've seen this repeated in several places and attributed to the
> Bell Labs typesetting work, but I have not verified it against a primary source, and details vary
> between tellings.
>
> **The reasoning, though, doesn't depend on the anecdote being right.** The two failure modes above
> are obvious the first time you redirect anything, and a second channel is the obvious fix.

## 18.4 Redirection mechanics

Volume 1 §2.6 showed the three-syscall pattern the shell uses between `fork()` and `execve()`. Now
the full vocabulary:

| Syntax | What the shell does | Notes |
|---|---|---|
| `> f` | `open(f, O_WRONLY\|O_CREAT\|O_TRUNC)`, `dup2(fd,1)` | **truncates** |
| `>> f` | same with `O_APPEND` instead of `O_TRUNC` | atomic append |
| `< f` | `open(f, O_RDONLY)`, `dup2(fd,0)` | |
| `2> f` | same as `>` but `dup2(fd,2)` | |
| `2>&1` | **`dup2(1, 2)`** | make fd 2 point where **fd 1 points right now** |
| `&> f` | both stdout and stderr | bash shorthand for `> f 2>&1` |
| `>| f` | truncate even with `set -o noclobber` | |
| `<> f` | open read-write on fd 0 | rare, but exists |
| `2>&-` | **close** fd 2 | |
| `\|` | `pipe()`, then `dup2()` in both children | Volume 1 §1.4 |
| `n< f` | open on an arbitrary descriptor | §18.6 |

## 18.5 The gotcha: `2>&1` order matters

This is the single most common redirection bug, and once you read `2>&1` as **"dup2(1,2) — copy
wherever fd 1 currently points"** it becomes obvious rather than mysterious.

*(Both halves verified.)*

```bash
ls /nonexistent > /tmp/o1.txt 2>&1
echo "'> f 2>&1'  file contains: [$(cat /tmp/o1.txt)]"

ls /nonexistent 2>&1 > /tmp/o2.txt
echo "'2>&1 > f'  file contains: [$(cat /tmp/o2.txt)]"

rm -f /tmp/o1.txt /tmp/o2.txt
```

```
'> f 2>&1'  file contains: [ls: cannot access '/nonexistent': No such file or directory]
ls: cannot access '/nonexistent': No such file or directory
'2>&1 > f'  file contains: []
```

The second one printed the error **to your terminal** and left the file empty. Trace it:

```
CORRECT:   ls /nonexistent > f 2>&1
   step 1   > f      →  fd 1 now points at the FILE
   step 2   2>&1     →  fd 2 = copy of fd 1  →  fd 2 points at the FILE
   result: both in the file ✔

WRONG:     ls /nonexistent 2>&1 > f
   step 1   2>&1     →  fd 2 = copy of fd 1  →  fd 1 is still the TERMINAL,
                                                 so fd 2 → TERMINAL
   step 2   > f      →  fd 1 now points at the file.  fd 2 is UNCHANGED.
   result: stdout in the file, stderr on the terminal ✘
```

> **`2>&1` copies a destination, it does not create an alias.** Redirections are processed strictly
> **left to right**, and each one is a snapshot of where the source descriptor points at that
> moment. Change fd 1 afterwards and fd 2 does not follow.

There's a genuinely useful trick that falls out of this — **swap** the two streams:

```bash
ls /etc /nonexistent 3>&1 1>&2 2>&3 3>&- | head -2
```

Save fd 1 on fd 3, point fd 1 at stderr, point fd 2 at the saved fd 3, close the temporary. Now the
pipe carries only the *errors*.

## 18.6 Descriptors above 2

The shell can open descriptors for its own use, which Volume 1 §3.4 and §15.6 both used:

```bash
exec 3< /etc/passwd        # open for reading on fd 3, in the SHELL itself
head -1 <&3                # read from it
head -1 <&3                # read again — the offset persisted
exec 3<&-                  # close
```

The offset persisted between commands because both `head`s inherited **the same open file
description** (§18.2). That is the middle level of the diagram, doing something visible.

Writing works the same way, and is the right pattern for a script that logs:

```bash
exec 4> /tmp/log.txt
echo "step 1 complete" >&4
echo "step 2 complete" >&4
exec 4>&-
cat /tmp/log.txt && rm /tmp/log.txt
```

One `open()` for the whole script instead of one per line.

**And the filesystem gives you descriptors back as paths:**

```bash
ls -l /dev/fd /dev/stdin /dev/stdout /dev/stderr
echo hello > /dev/stdout
```

`/dev/fd` is a symlink to `/proc/self/fd`. This is Chapter 14's principle closing the loop: **file
descriptors are named in the filesystem**, so a program that only accepts a *filename* can be handed
a *stream*:

```bash
diff <(ls /usr/bin) <(ls /usr/sbin) | head -5
```

`<(...)` is **process substitution**. Bash runs the command, connects it to a pipe, and passes
`/dev/fd/63` as the argument. `diff` believes it received two filenames:

```bash
echo <(true) <(true)
```

```
/dev/fd/63 /dev/fd/62
```

## 18.7 Here-documents and here-strings

```bash
cat <<'EOF'
Literal text. $HOME is NOT expanded because EOF is quoted.
EOF

NAME=Debian
cat <<EOF
Unquoted delimiter: variables ARE expanded. Running $NAME.
EOF

cat <<-EOF
	Leading TABS are stripped with <<-  (tabs only, not spaces).
	EOF

grep root <<< "$(getent passwd root)"     # here-STRING
```

| Form | Expands variables? |
|---|---|
| `<<EOF` | **yes** |
| `<<'EOF'` or `<<"EOF"` | **no** — literal |
| `<<-EOF` | yes, and strips leading **tabs** |
| `<<< "string"` | it's already a string |

Quoting the delimiter is the right default when writing config files or scripts from a script, or
`$PATH` in your heredoc becomes the shell's `$PATH`.

---

