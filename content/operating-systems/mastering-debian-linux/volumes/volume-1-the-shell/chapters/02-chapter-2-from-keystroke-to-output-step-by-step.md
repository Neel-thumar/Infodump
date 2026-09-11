# Chapter 2 — From Keystroke to Output, Step by Step

## 2.1 The hook

> You press `l`, `s`, `Enter`. Roughly 40 milliseconds later, filenames appear. **How many distinct
> pieces of software touched that, and in what order?**

The answer is about eight, and most of them are invisible. We are going to walk the whole path, and
at each step there is a command you can run to see that layer actually existing.

Here is the map. Don't try to absorb it yet — it's a reference for the rest of the chapter.

```
   [1] keyboard  →  kernel input subsystem (evdev)
                       ↓
   [2] terminal emulator (gnome-terminal / xterm / the VT)
                       ↓  writes to the pty MASTER
   [3] pseudoterminal + LINE DISCIPLINE   ← kernel code: echo, backspace, Ctrl-C
                       ↓  shell reads from the pty SLAVE
   [4] bash + readline  — line editing, history, tab completion
                       ↓  you press Enter; bash now has a string
   [5] bash PARSES and EXPANDS  — brace, tilde, $var, split, glob, quote removal
                       ↓
   [6] bash RESOLVES the command  — alias? function? builtin? $PATH search?
                       ↓
   [7] fork()   — kernel makes a near-copy of bash
                       ↓
       (child sets up redirections here, using ordinary syscalls)
                       ↓
   [8] execve()  — kernel replaces the child's program image with /usr/bin/ls
                       ↓
   [9] ls runs, writes to fd 1 → pty slave → pty master → emulator → screen
                       ↓
  [10] ls exits;  bash was blocked in wait4();  bash sets $?
```

## 2.2 Step 1–2: where is your terminal, actually?

There are two genuinely different situations and it's worth knowing which you're in.

**A virtual console** (press Ctrl+Alt+F3 to get one; Ctrl+Alt+F2 or F7 usually gets you back to the
desktop) is driven directly by kernel code. Its device is `/dev/tty1` through `/dev/tty6`.

**A terminal emulator** (gnome-terminal, konsole, xterm, the terminal in VS Code) is an ordinary
userspace program that draws a rectangle of text. It has no direct connection to your keyboard at
all — it gets key events from X11 or Wayland like any other GUI application.

So how does a shell running "inside" it get input? Through a **pseudoterminal**, or **pty**: a kernel
device that comes in pairs. One end is the **master**, held by the terminal emulator. The other is
the **slave**, which looks and behaves exactly like a real serial terminal, and is what the shell
opens as its standard input, output and error.

See yours:

```bash
tty
```

```
/dev/pts/0
```

That's the **slave** end. Your terminal emulator holds the corresponding master. Look at what your
shell actually has open:

```bash
ls -l /proc/$$/fd/
```

```
lrwx------ 1 you you 64 Sep 10 14:22 0 -> /dev/pts/0
lrwx------ 1 you you 64 Sep 10 14:22 1 -> /dev/pts/0
lrwx------ 1 you you 64 Sep 10 14:22 2 -> /dev/pts/0
lrwx------ 1 you you 64 Sep 10 14:22 255 -> /dev/pts/0
```

**File descriptors 0, 1 and 2 — stdin, stdout, stderr — all point at the same pty.** That is why
output and error messages interleave on your screen by default, and it's why redirecting one doesn't
affect the other. (Descriptor 255 is a bash implementation detail; it keeps a copy of the terminal
for its own use.)

And see all the ptys currently allocated on your machine — one per open terminal:

```bash
ls /dev/pts/
```

## 2.3 Step 3: the line discipline — the layer nobody teaches you

Here is something genuinely surprising.

> Run `cat` with no arguments. Type some characters. Press Backspace. **The character disappears.**
>
> `cat` has no editing code. `cat` has not received *anything* yet. **Who deleted that character?**

The answer is the **line discipline** — a piece of kernel code sitting between the pty and whatever
program is reading from it. In its default **canonical mode** (also called "cooked mode"), it:

| Does this | Which is why |
|---|---|
| Buffers input until you press Enter | programs get whole lines, not characters |
| Handles Backspace and Ctrl+U (kill line) | `cat`, `wc`, and every other program get editing for free |
| Echoes what you type back to the screen | the program doesn't have to |
| Turns Ctrl+C into a **SIGINT signal** | you can interrupt a program that isn't checking for it |
| Turns Ctrl+Z into SIGTSTP, Ctrl+\\ into SIGQUIT | job control works everywhere |
| Turns Ctrl+D at the start of a line into **end-of-file** | `cat` stops, `bash` logs you out |

All of that is **kernel code**, not shell code, not `cat` code. Look at the current settings:

```bash
stty -a
```

```
speed 38400 baud; rows 43; columns 178; line = 0;
intr = ^C; quit = ^\; erase = ^?; kill = ^U; eof = ^D; ...
-parenb -parodd -cmspar cs8 -hupcl -cstopb cread -clocal -crtscts
-ignbrk -brkint -ignpar -parmrk -inpck -istrip -inlcr -igncr icrnl ixon ...
opost -olcuc -ocrnl onlcr -onocr -onlret ...
isig icanon iexten echo echoe echok -echonl -noflsh ...
```

Read the fourth block: `isig icanon ... echo`. `icanon` is canonical mode. `echo` is echoing. `isig`
is "turn control characters into signals." And `intr = ^C` is literally the mapping you rely on
every day.

**The twist:** bash itself turns most of this *off*. When bash is sitting at a prompt waiting for
you, it puts the terminal into **non-canonical (raw) mode** so that its own readline library can
handle arrow keys, history search, and tab completion — none of which the line discipline knows
about. Then, just before running a child program, bash **puts it back**.

Which is why `stty -a` above showed `icanon`: bash restored canonical mode before executing `stty`.
You are seeing the state your *programs* run in, not the state bash's prompt runs in.

§8.3 has a hands-on demo that makes this visible and reversible.

## 2.4 Steps 4–5: parsing and expansion, in the order that matters

You press Enter. Bash now holds a string. What it does next has a **defined order**, and knowing that
order explains most shell bugs you will ever write.

From the bash manual, expansions happen in this sequence:

| # | Expansion | Example |
|---|---|---|
| 1 | **Brace expansion** | `file{1,2,3}` → `file1 file2 file3` |
| 2 | **Tilde expansion** | `~/docs` → `/home/you/docs` |
| 3 | **Parameter/variable, arithmetic, command substitution** (left to right) | `$HOME`, `$((2+2))`, `$(date)` |
| 4 | **Word splitting** — on `$IFS`, and **only on unquoted results of step 3** | `$var` containing `a b` → two words |
| 5 | **Pathname expansion** (globbing) | `*.txt` → the matching filenames |
| 6 | **Quote removal** | `"hello"` → `hello` |

Watch the order happen:

```bash
mkdir -p /tmp/order && cd /tmp/order
touch a1.txt a2.txt
d=/tmp/order
echo ${d}/a{1,2}.txt      # brace happens FIRST, before $d is even looked at
echo $d/*.txt             # variable, THEN glob
```

Now the single most important consequence, which is step 4:

> **Word splitting and globbing happen to the *result* of variable expansion, not to the variable
> itself.**

Which is why this happens:

```bash
cd /tmp/order
touch "two words.txt"
f="two words.txt"

ls $f          # BROKEN
ls "$f"        # correct
```

```
ls: cannot access 'two': No such file or directory
ls: cannot access 'words.txt': No such file or directory
two words.txt
```

Unquoted, bash expanded `$f` to `two words.txt`, then **split it on whitespace** into two separate
arguments. `ls` received two filenames, neither of which exists. The quotes suppress step 4.

> **The rule: quote your variable expansions. Always. `"$var"`, `"$@"`, `"$(cmd)"`.** Not "when you
> think there might be spaces" — always, because the cost of the habit is two characters and the cost
> of the exception is Chapter 7.

Clean up:

```bash
cd /tmp && rm -rf /tmp/order
```

## 2.5 Step 6: how bash decides what `ls` means

Bash resolves a command name in a fixed order. `type -a` shows you every stage that matches:

```bash
type -a ls
type -a cd
type -a echo
type -a bash
```

```
ls is aliased to `ls --color=auto'
ls is /usr/bin/ls
cd is a shell builtin
echo is a shell builtin
echo is /usr/bin/echo
bash is /usr/bin/bash
```

The resolution order:

| Order | Kind | Why it exists |
|---|---|---|
| 1 | **Alias** | expanded at parse time, before anything else |
| 2 | **Function** | shell functions you or a script defined |
| 3 | **Builtin** | compiled into bash — `cd`, `export`, `echo`, `read`, `[` |
| 4 | **`$PATH` search** | an actual file on disk |

Notice from that output that **`echo` exists twice** — as a bash builtin and as a real program at
`/usr/bin/echo`. The builtin wins. This matters more than it looks: the builtin and the external
program have subtly different flag handling, so a script that relies on `echo -e` may behave
differently depending on which shell runs it. (This is one reason experienced people write `printf`
instead.)

```bash
echo -e "a\tb"          # bash builtin: interprets \t
/usr/bin/echo -e "a\tb" # external coreutils echo
printf 'a\tb\n'         # always does what you meant
```

### The `$PATH` search, mechanically

```bash
echo "$PATH"
echo "$PATH" | tr ':' '\n'
```

```
/usr/local/bin
/usr/bin
/bin
/usr/local/games
/usr/games
```

For a command containing no `/`, bash walks that list **left to right**, and for each directory
checks whether `dir/name` exists and is executable by you. **First match wins.** No match → "command
not found."

Two things about that list on Debian:

**First, `/bin` and `/usr/bin` are the same directory.**

```bash
ls -ld /bin /sbin /lib
```

```
lrwxrwxrwx 1 root root 7 ... /bin -> usr/bin
lrwxrwxrwx 1 root root 8 ... /sbin -> usr/sbin
lrwxrwxrwx 1 root root 7 ... /lib -> usr/lib
```

This is the **"usr-merge"**, completed for Debian 12 (bookworm). Historically `/bin` held commands
needed before `/usr` was mounted, and `/usr/bin` held everything else — a split that stopped making
sense once initramfs mounted everything before init started.

> **Confidence: moderate-high** that merged-`/usr` is the default in bookworm; **moderate** on the
> ongoing effort to also merge `/usr/sbin` into `/usr/bin` for later releases. Check `ls -ld /bin` on
> your own machine — that's authoritative for *your* system, which is what matters.

**Second, there is a security rule hiding in that list: the current directory is not on it.**

There is no `.` in `$PATH`, and that is deliberate. If `.` were on your `$PATH`, then anyone who
could write a file into a directory you might `cd` into could plant an executable called `ls`, or
`make`, or `sudo`. You'd `cd /tmp`, type `ls`, and run their program with your privileges. This is a
classic Unix trojan and it is why every mainstream distribution, Debian included, leaves `.` out.

Watch out for the sneaky version — an **empty** `PATH` element means the current directory:

```bash
# These are all DANGEROUS, and all mean "search . too":
#   PATH=/usr/bin:
#   PATH=:/usr/bin
#   PATH=/usr/bin::/bin
```

### The hash table (why your new program doesn't run)

Bash caches the full path of every external command it has resolved, so it doesn't re-search `$PATH`
every time.

```bash
hash          # show the cache
ls > /dev/null
hash
```

```
hits	command
   1	/usr/bin/ls
```

**This causes a real, common confusion.** Install a newer version of a tool into `/usr/local/bin`,
and your current shell keeps running the old `/usr/bin` copy — because the old path is cached. The
fix:

```bash
hash -r       # clear the whole cache
```

If a command "doesn't update" after an install, this is nearly always why.

## 2.6 Step 7: `fork()` — and why it's two calls, not one

Bash now knows it wants to run `/usr/bin/ls`. It does **not** simply run it. It first makes a **copy
of itself**.

```
       BEFORE fork()                     AFTER fork()

   ┌─────────────────┐            ┌─────────────┐   ┌─────────────┐
   │  bash  PID 4021 │    fork()  │ bash PID    │   │ bash PID    │
   │  memory         │  ────────► │ 4021 PARENT │   │ 4022 CHILD  │
   │  open fds 0,1,2 │            │  (returns   │   │  (returns   │
   │  environment    │            │   4022)     │   │   0)        │
   │  cwd            │            └─────────────┘   └─────────────┘
   └─────────────────┘             identical memory, fds, env, cwd
```

The child is a near-perfect duplicate: same memory contents (copy-on-write, so no actual copying
happens until one of them writes), same open file descriptors, same environment, same working
directory. The **only** difference is the return value of `fork()` — 0 in the child, the child's PID
in the parent. That single value is how each half knows who it is.

> **Why not one call?** Most systems before and since have a single "spawn this program with these
> settings" call, taking a big structure of options: redirect this descriptor, set that environment,
> run as this user.
>
> Unix's answer was better: **give the child a moment to be an ordinary program before it becomes a
> different one.** Between `fork()` and `exec()`, the child is still bash — it can run any code it
> likes, using ordinary system calls, to set up exactly the environment the new program should get.

That is why redirection is trivially simple to implement. When you type:

```bash
ls > out.txt
```

the child, after forking and before exec'ing, does three completely ordinary things:

```c
fd = open("out.txt", O_WRONLY|O_CREAT|O_TRUNC, 0666);
dup2(fd, 1);        /* make descriptor 1 (stdout) point where fd points */
close(fd);
execve("/usr/bin/ls", ...);
```

**`ls` has no idea any of this happened.** It writes to descriptor 1 exactly as always. There is no
"output file" option in `ls` and there never needs to be. Every program on the system gets
redirection for free, for the same reason every program got pipes for free in §1.4.

A pipeline is the same trick with `pipe()` instead of `open()`: create the pipe, fork twice, point
one child's fd 1 at the write end and the other's fd 0 at the read end, exec both.

> **A fair counterpoint.** `fork()` is elegant but is now genuinely criticised — it interacts badly
> with threads, it's expensive for large processes, and its semantics are hard to reason about. The
> best-known statement of the case is "A fork() in the road" (Baumann, Appavoo, Krieger and Roscoe,
> HotOS 2019). Modern code often prefers `posix_spawn()` or `clone3()`. The design is fifty years
> old and it shows. **Confidence: high** on the paper's existence and thrust.

## 2.7 Step 8: `execve()` — becoming a different program

Now the child calls `execve("/usr/bin/ls", argv, envp)`. The kernel:

1. Checks you have execute permission on the file.
2. Reads the first bytes. If they're `#!`, it's a script — the kernel runs the named interpreter
   instead, with the script path appended. If they're `\x7fELF`, it's a binary.
3. **Discards the child's entire memory image** — the bash code, the bash variables, all of it.
4. Maps the new program into the now-empty address space.
5. If the binary is dynamically linked, loads the **interpreter** named inside it, and lets *that*
   load the shared libraries.
6. Jumps to the entry point.

**What survives `exec` is the interesting part**, because it's what makes the whole model work:

| Survives | Does not survive |
|---|---|
| the **PID** (same process!) | the program code |
| open file descriptors (unless close-on-exec) | shell variables that weren't exported |
| the environment (`envp`) | shell functions, aliases |
| current working directory | signal *handlers* (reset to default) |
| user and group IDs | memory mappings |

See the dynamic-linking step for yourself:

```bash
file /usr/bin/ls
```

```
/usr/bin/ls: ELF 64-bit LSB pie executable, x86-64, ..., dynamically linked,
interpreter /lib64/ld-linux-x86-64.so.2, ...
```

That `interpreter` line is the program the kernel actually starts. It then loads:

```bash
ldd /usr/bin/ls
```

```
	linux-vdso.so.1 (0x00007ffd...)
	libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1 (0x00007f...)
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f...)
	/lib64/ld-linux-x86-64.so.2 (0x00007f...)
```

And you can watch it happen live — this is one of the more startling things in this volume:

```bash
LD_DEBUG=libs ls /tmp 2>&1 | head -30
```

You'll see the dynamic linker searching directories, finding each library, and calling
initialisers — all *before* a single line of `ls`'s own code runs.

## 2.8 Steps 9–10: output, exit, and `$?`

`ls` writes its output to file descriptor 1. That descriptor points at the pty slave. The kernel's
tty layer passes the bytes to the pty master. Your terminal emulator, which has been blocked reading
the master, wakes up, parses any ANSI escape sequences (that's what makes the directories blue), and
draws glyphs.

Meanwhile the **parent bash has been blocked in `wait4()`**, doing nothing at all.

When `ls` finishes, it calls `exit(0)`. The process becomes a **zombie** — it's gone, but the kernel
keeps its exit status until the parent collects it. Bash's `wait4()` returns, bash reaps the zombie,
and stores the status in `$?`.

```bash
true;  echo "true  → $?"
false; echo "false → $?"
ls /nonexistent 2>/dev/null; echo "ls on missing file → $?"
(exit 42); echo "explicit 42 → $?"
```

```
true  → 0
false → 1
ls on missing file → 2
explicit 42 → 42
```

**The status is 8 bits — 0 to 255.** Bash has conventions for the high values:

| `$?` | Meaning |
|---|---|
| 0 | success (and note: **zero is success**, unlike most programming) |
| 1 | general failure |
| 2 | misuse of a shell builtin (bash convention) |
| 126 | found, but **not executable** |
| 127 | **command not found** |
| 128+N | **killed by signal N** |
| 130 | killed by Ctrl+C (SIGINT is 2, so 128+2) |
| 137 | killed by SIGKILL (128+9) |
| 143 | killed by SIGTERM (128+15) |

Verify the interesting ones:

```bash
nosuchcommand-xyz; echo "not found → $?"

echo '#!/bin/sh' > /tmp/notexec.sh    # created without +x
/tmp/notexec.sh; echo "not executable → $?"
rm /tmp/notexec.sh

sleep 60 &
kill %1
wait %1; echo "SIGTERM'd → $?"
```

```
bash: nosuchcommand-xyz: command not found
not found → 127
bash: /tmp/notexec.sh: Permission denied
not executable → 126
SIGTERM'd → 143
```

**143 = 128 + 15.** You just read a signal number out of an exit status.

### One trap worth knowing now

In a pipeline, `$?` is the exit status of the **last** command only:

```bash
false | true; echo "$?"          # 0 — the failure is INVISIBLE
```

```
0
```

Two ways to see the truth:

```bash
false | true; echo "${PIPESTATUS[@]}"     # 1 0

set -o pipefail
false | true; echo "$?"                    # 1
set +o pipefail
```

This is a real source of silent failure in scripts, and Volume 7 will make `set -euo pipefail` a
habit.

---

