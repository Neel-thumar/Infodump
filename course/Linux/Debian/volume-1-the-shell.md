# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 1 — The Shell, and What a Computer Actually Does When You Type

---

### How this guide works

Every major idea in this book gets three things, in this order:

1. **THE PROBLEM** — what was actually broken or missing, framed as a question you might have asked
   yourself.
2. **THE MECHANISM** — how it really works, in technical depth, with commands you can run to see it
   for yourself.
3. **THE INCIDENT** — a real bug, outage, security flaw, or design argument that proves why the
   mechanism matters. Not a hypothetical.

**On historical accuracy.** Computing history before about 1990 is patchily documented, often
recounted from memory decades later, and heavily embellished by repetition. Where I am confident, I
say so plainly. Where I am not, you will see a flag like this:

> **Confidence: moderate.** Widely repeated in secondary sources; I have not verified the primary
> source, and dates in this era are frequently off by a year.

I would rather leave you calibrated than leave you with a good story. If something here matters to
you, the flags tell you where to go check.

**On Debian specifically.** This is not a generic Linux book. Where something is a Debian project
decision rather than a Linux fact, it will be marked as such — because those decisions are the ones
that will confuse you when you read documentation written for Fedora or Arch.

### Before you start

Everything in Volume 1 works on a stock Debian install with no extra packages, **except** the
`strace` demonstrations in §8.1, which need one install. If you want everything to work:

```bash
sudo apt update
sudo apt install strace
```

Check what you're running, so that when something in this book doesn't match your machine you know
whether it's a version difference:

```bash
cat /etc/os-release
uname -a
echo "$BASH_VERSION"
```

On Debian 12 (bookworm) you should see something like `VERSION="12 (bookworm)"` and a bash version of
`5.2.x`. Nothing here is version-fragile, but it's good practice to know.

---

# Chapter 1 — Why There Is a Shell At All

## 1.1 The hook

Here is a question that sounds trivial and isn't:

> **When you type `ls` and press Enter, what part of the operating system is reading your
> keystrokes and deciding what `ls` means?**

The instinctive answer is "the operating system." It's wrong, and how wrong it is turns out to be the
single most consequential design decision in Unix's history.

**The kernel has no idea what you typed.** It does not know what a command is. It has never heard of
`ls`. It does not know that `*` means "match filenames," that `|` means "connect these two programs,"
or that `$HOME` means anything at all. All of that is done by an ordinary program — one that runs
with no special privileges, that you can replace, and that you could write yourself.

That program is the **shell**. And the fact that it is a *program* rather than a *feature* is why
Linux looks the way it does fifty-five years later.

## 1.2 THE PROBLEM: what were they actually trying to fix?

### Multics, and what going wrong looked like

In the mid-1960s, MIT, General Electric and Bell Labs jointly built **Multics** — Multiplexed
Information and Computing Service. It was extraordinarily ambitious for its time: a genuine
multi-user timesharing system with a hierarchical filesystem, dynamic linking, and security rings,
intended to sell computing as a utility the way you buy electricity.

It was also enormous, late, and slow.

**Bell Labs withdrew from the project in 1969.**

> **Confidence: high on the year, moderate on the month.** 1969 is well established; sources
> commonly say spring, often specifically April, and I would not stake anything on the month.

What matters for us is what the Bell Labs people had *lost*. Dennis Ritchie later described it as
losing not just a computer but a particular kind of working environment — a system several people
could use at once, where you could build tools that operated on each other's output. They had tasted
interactive, communal computing, and gone back to batch processing on a machine where you submitted
a job and came back later.

### The PDP-7

Ken Thompson found a **DEC PDP-7** sitting largely unused at Bell Labs and, over roughly a month in
1969, wrote a small operating system for it: a filesystem, a process model, an editor, an assembler,
and a command interpreter.

> **Confidence: moderate.** The "a week each for the OS, editor, assembler and shell" framing comes
> from Ritchie's own retrospective account, "The Evolution of the Unix Time-sharing System." The
> associated story — that Thompson was partly motivated by wanting somewhere to run *Space Travel*,
> a game he'd written, because running it on the GECOS system cost something like $75 per hour of
> machine time — is very widely repeated, and the dollar figure specifically I would treat as
> approximate folklore.

Brian Kernighan is generally credited with the name, as a pun on Multics — the joke being that where
Multics did everything, this thing did one of everything. Early spellings include **UNICS**.

> **Confidence: moderate-high** that Kernighan named it; **moderate** on the UNICS spelling story,
> which is widely told but I have not seen a contemporaneous document.

### The constraint that shaped everything

Here is the part that actually matters. The PDP-7 was **small**. Later, the PDP-11/20 they moved to in
1970 was also small. There was no room for a large kernel, and no institutional appetite for another
Multics.

So the question the Unix designers faced was not "what would the ideal operating system contain?" It
was:

> **What is the smallest thing we can put in the kernel such that everything else can be built on top
> of it, in userspace, by ordinary programs?**

Every famous Unix design decision falls out of that question. Files as unstructured byte streams,
rather than the record-structured files most systems of the era had. `fork()` and `exec()` as two
separate operations rather than one "run this program" call. Devices addressed through the
filesystem. And — the subject of this chapter — **the command interpreter as a userspace program.**

## 1.3 THE MECHANISM: what "the shell is just a program" actually means

Let's establish it factually before reasoning about it. Run this:

```bash
type -a bash
ls -l "$(command -v bash)"
```

You'll see something like:

```
bash is /usr/bin/bash
-rwxr-xr-x 1 root root 1265648 Mar 29  2024 /usr/bin/bash
```

That's it. A 1.2 MB file in `/usr/bin`, owned by root, world-executable, with **no special permission
bits and no special kernel relationship whatsoever**. It is exactly as privileged as `ls`. On Debian
you can even see which package put it there:

```bash
dpkg -S "$(command -v bash)"
```

```
bash: /usr/bin/bash
```

Now prove it's replaceable. Debian ships several shells:

```bash
cat /etc/shells
```

```
# /etc/shells: valid login shells
/bin/sh
/bin/bash
/usr/bin/bash
/bin/rbash
/usr/bin/rbash
/bin/dash
/usr/bin/dash
```

You can run one right now, inside the one you're already in:

```bash
dash
echo "I am now in: $0"
exit
```

Nothing broke. You started a completely different command interpreter as a child process of your
current one, used it, and exited back. **The kernel did not notice or care.**

### The consequence you can see: who expands the wildcard?

This is the sharpest demonstration of the layering, and it's the one that surprises people who came
from Windows.

```bash
cd /tmp
mkdir -p globdemo && cd globdemo
touch alpha.txt beta.txt gamma.txt
echo *.txt
```

```
alpha.txt beta.txt gamma.txt
```

`echo` did not do that. **`echo` never saw a `*`.** The shell expanded `*.txt` into three separate
arguments *before* `echo` was executed, and `echo` received exactly this:

```
argv[0] = "echo"
argv[1] = "alpha.txt"
argv[2] = "beta.txt"
argv[3] = "gamma.txt"
```

Prove it by making the expansion fail:

```bash
echo *.nonexistent
```

```
*.nonexistent
```

The shell found no matches, so — by default in bash — it passed the pattern through **literally**.
Now watch a real program receive that literal pattern:

```bash
ls *.nonexistent
```

```
ls: cannot access '*.nonexistent': No such file or directory
```

`ls` is complaining about a file whose name is literally `*.nonexistent`, because that is exactly
what it was handed. `ls` has no wildcard code in it at all.

> **Why this matters, and the contrast that makes it obvious.** On MS-DOS and Windows, the command
> interpreter passes the command line to the program largely unexpanded, and **each program is
> responsible for expanding wildcards itself**. That means every program has its own glob
> implementation, they behave slightly differently, and some programs simply don't support wildcards
> at all.
>
> On Unix, the shell expands once, centrally, before anything runs — so **every program on the system
> gets wildcards for free and they all behave identically**, including programs written decades
> apart by people who never coordinated. That uniformity is not a coincidence; it is what you get when
> the argument-preparation step is factored out into one replaceable program.

Clean up:

```bash
cd /tmp && rm -rf /tmp/globdemo
```

### What else is *not* in the kernel

Once you internalise "the shell prepares arguments and then asks the kernel to run a program," a lot
of things relocate in your mental model:

| Thing | Who does it | Kernel involvement |
|---|---|---|
| Wildcard expansion (`*.txt`) | **the shell** | none |
| Variable expansion (`$HOME`) | **the shell** | none |
| Redirection syntax (`> file`) | **the shell** parses it; then uses ordinary syscalls | `open`, `dup2` |
| Pipe syntax (`\|`) | **the shell** parses it | the `pipe()` syscall creates the actual pipe |
| Command history, tab completion | **the shell** (via readline) | none |
| Aliases, functions, `if`/`for`/`while` | **the shell** | none |
| Deciding what `ls` means | **the shell** (`$PATH` search) | none |
| Actually running a program | the shell **asks** | `fork`, `execve` |
| Line editing in a program that *isn't* the shell | **the kernel** (see §2.3) | the tty line discipline |

That last row is a genuine surprise for most people and Chapter 2 gets to it.

## 1.4 THE INCIDENT: pipes, and a design argument that took nine years to win

The best evidence that this architecture worked is that a major feature could be added to Unix
**without touching the fundamental design at all**.

Doug McIlroy, who ran the research group Thompson and Ritchie worked in, had been arguing since
around 1964 that programs should be connectable like garden hoses — screw one output into another
input. He kept pushing. Thompson eventually implemented it, reportedly in a single evening, in 1973.

> **Confidence: high** that McIlroy advocated pipes for years and that Thompson implemented them
> quickly in 1973 (Version 3 Unix). **Moderate** on the detail — repeated in Kernighan's *Unix: A
> History and a Memoir* — that the original syntax was `cmd1 > cmd2` and was changed to `|` shortly
> afterwards. **Low** on the "one night" specifically, which is the kind of claim that improves with
> retelling.

What makes this an *architecture* story rather than a *feature* story is what it required:

- **In the kernel:** one new system call, `pipe()`, which creates a pair of connected file
  descriptors. That's it.
- **In the shell:** parsing for the `|` character, and the logic to wire the descriptors up.
- **In every existing program on the system:** *nothing at all.*

Every tool that already read from standard input and wrote to standard output became instantly
composable with every other tool, retroactively, without recompilation. `grep`, written before pipes
existed, worked in a pipeline the day pipes shipped.

That is the payoff for the factoring. The kernel provides a small, general mechanism; the shell
provides syntax for it; the programs don't need to know.

You are relying on this right now:

```bash
ls /usr/bin | wc -l
```

```
1247
```

`ls` doesn't know `wc` exists. `wc` doesn't know it's being fed by `ls`. Neither has any pipe-specific
code. The shell called `pipe()`, forked twice, and pointed one program's output at the other's input
using the same `dup2()` call it uses for `> file`.

## 1.5 The Debian-specific bit: which shell is `/bin/sh`?

Here is the first place Debian's own decisions diverge from "Linux."

```bash
ls -l /bin/sh
```

```
lrwxrwxrwx 1 root root 4 Mar 29  2024 /bin/sh -> dash
```

**On Debian, `/bin/sh` is not bash.** It is **dash** — the Debian Almquist Shell, a small, fast,
strictly POSIX shell descended from the Almquist shell in NetBSD.

```bash
dpkg -S "$(readlink -f /bin/sh)"
apt show dash 2>/dev/null | head -20
```

**The reasoning was boot speed.** At system boot, hundreds of shell scripts run. `bash` is large,
feature-rich, and comparatively slow to start; `dash` starts much faster and uses far less memory.
For scripts that only need POSIX features — which is almost all system scripts — dash is strictly
better.

> **Confidence: moderate-high.** The change was discussed for years and landed as the default in
> Debian 6.0 "squeeze" (2011), having been optional in 5.0 "lenny." I'd check the release notes before
> quoting the exact release.

**The consequence, and it will bite you:** a script whose first line is `#!/bin/sh` gets **dash**, not
bash. If it uses bash-only syntax — arrays, `[[ ]]`, `==` inside `[`, `source` instead of `.`,
`$'...'`, `local` in some forms — it will fail on Debian while working fine on a distro where
`/bin/sh` is bash.

You can see the difference immediately:

```bash
bash -c 'if [[ "a" == "a" ]]; then echo "bash: fine"; fi'
sh   -c 'if [[ "a" == "a" ]]; then echo "sh: fine"; fi'
```

```
bash: fine
sh: 1: [[: not found
```

Debian took this seriously enough to build tooling for it. The `devscripts` package ships
`checkbashisms`, which scans a script for bash-only constructs:

```bash
sudo apt install devscripts     # a large package; optional
printf '#!/bin/sh\nif [[ 1 == 1 ]]; then echo hi; fi\n' > /tmp/bad.sh
checkbashisms /tmp/bad.sh
rm /tmp/bad.sh
```

**The rule to internalise:** if your script needs bash, say `#!/bin/bash`. If you write `#!/bin/sh`,
you are promising POSIX, and on Debian that promise is enforced.

---

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

# Chapter 3 — Moving Around and Moving Things

Rather than a command dump, each of these is introduced by the problem it exists to solve. Several
of them turn out to be direct consequences of Chapter 2's fork/exec model.

## 3.1 `pwd` — the problem: "where am I" is a property of a *process*

> **THE PROBLEM.** Every filename you type is either absolute (`/etc/passwd`) or relative
> (`passwd`). Relative to *what*, and where is that stored?

The kernel maintains, for **each process independently**, a current working directory. It is not a
property of your terminal, or your login, or the shell — it belongs to the process. You can see it
directly:

```bash
pwd
ls -l /proc/$$/cwd
```

```
/home/you
lrwxrwxrwx 1 you you 0 Sep 10 14:31 /proc/self/cwd -> /home/you
```

`/proc/$$/cwd` is a magic symlink the kernel maintains, pointing at whatever directory that process
is currently in. `$$` is bash's own PID. **You are reading a live kernel data structure through the
filesystem** — which is Volume 3's whole subject, arriving early.

Try it on a *different* process:

```bash
sleep 300 &
ls -l /proc/$!/cwd        # $! is the PID of the last background job
cd /etc
ls -l /proc/$!/cwd        # the sleep is STILL in your old directory
ls -l /proc/$$/cwd        # but the shell moved
kill %1
cd ~
```

The `sleep` inherited the working directory it was forked with and kept it. Yours changed. They are
genuinely separate.

## 3.2 `cd` — the problem: this one *cannot* be a program

> **THE PROBLEM.** Everything in Chapter 2 said commands run as separate child processes. So how can
> `cd` possibly work?

Work it through. If `cd` were an external program at `/usr/bin/cd`, then typing `cd /etc` would:

1. bash calls `fork()` — now there are two processes
2. the **child** calls `execve("/usr/bin/cd", ...)`
3. the child calls `chdir("/etc")` — **the child's** working directory changes
4. the child exits
5. bash, the parent, is exactly where it was

**A child process cannot change its parent's working directory.** There is no system call for it, and
there shouldn't be — a program you run being able to reach into your shell and move it would be a
security hole, not a feature.

So `cd` **must** be built into the shell. Confirm:

```bash
type cd
```

```
cd is a shell builtin
```

And now prove the reasoning with a two-minute experiment:

```bash
mkdir -p /tmp/fakebin
printf '#!/bin/sh\ncd "$1"\npwd\n' > /tmp/fakebin/mycd
chmod +x /tmp/fakebin/mycd

pwd                      # note where you are
/tmp/fakebin/mycd /etc   # the script prints /etc — it DID change directory
pwd                      # ...and you are still where you started
```

```
/home/you
/etc
/home/you
```

The child genuinely changed *its own* directory, printed proof, and died. Yours never moved. Clean
up:

```bash
rm -rf /tmp/fakebin
```

**The same reasoning explains the rest of the builtin list.** Anything that must modify the shell's
own state has to be a builtin:

```bash
type cd export exit source ulimit umask read
```

`export` sets a variable in the shell. `exit` ends the shell. `source` runs a script *in* the current
shell rather than a child. All of them are impossible as external programs, for exactly the reason
`cd` is.

> **A curiosity.** POSIX specifies `cd` as a *utility*, so some Unix systems ship a `/usr/bin/cd`
> that does nothing useful — it exists solely so `cd` can be found by `find`-style tooling. Check
> whether Debian does: `ls -l /usr/bin/cd 2>/dev/null || echo "not present"`.

## 3.3 `ls` — the problem: a directory is a file you can't just read

> **THE PROBLEM.** A directory is, at bottom, a file containing a list of name → inode-number pairs.
> Why can't you just `cat` it?

Try:

```bash
cat /etc
```

```
cat: /etc: Is a directory
```

Linux **refuses to let you read a directory as a byte stream**, because its on-disk format is
filesystem-specific and letting programs parse it directly would freeze that format forever.
Instead, the kernel offers a `getdents64()` syscall, and `ls` is the program that calls it and
formats the results.

The formatting is the whole value. Compare:

```bash
ls /etc | head -5           # names only, one per line when piped
ls -l /etc | head -5        # long format
ls -la /etc | head -5       # including dotfiles
ls -lh /var/log             # human-readable sizes
ls -lt /var/log | head -5   # newest first
ls -lS /usr/bin | head -5   # largest first
```

**Notice something:** `ls /etc | head -5` printed one name per line, but `ls /etc` in your terminal
printed columns. `ls` checks whether its output is a terminal and behaves differently. That's a
program *adapting to* the file descriptor it was handed — the redirection model from §2.6, observed
from the other side.

### The Debian-specific bit: where your `ls` colours come from

```bash
type ls
grep -n 'color\|alias l' ~/.bashrc
```

You'll find something like:

```bash
if [ -x /usr/bin/dircolors ]; then
    test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
    alias ls='ls --color=auto'
    alias grep='grep --color=auto'
    ...
fi

# some more ls aliases
#alias ll='ls -l'
#alias la='ls -A'
#alias l='ls -CF'
```

Two Debian details worth noticing:

- **The colours are an alias, not a feature of `ls`.** `--color=auto` means "colour only if stdout is
  a terminal," which is why `ls | cat` isn't full of escape codes.
- **`ll`, `la` and `l` are commented out** in Debian's default `~/.bashrc`. If you've used Ubuntu,
  where they're enabled, this is the "why doesn't `ll` work?" moment. Uncomment them, then
  `source ~/.bashrc`.

> **Confidence: moderate-high** on the aliases being commented out by default in Debian's
> `/etc/skel/.bashrc`. Your own `grep` output above is the authoritative answer for your machine.

You can see the colour scheme itself:

```bash
dircolors -p | head -30
```

## 3.4 `cp`, `mv`, `rm` — the problem: three very different operations that look similar

These feel like a set. Mechanically they are nothing alike.

### `mv` usually moves no data at all

> **THE PROBLEM.** Renaming a 40 GB file should not take as long as copying one.

Within a single filesystem, `mv` is **one system call**: `rename()`. It edits directory entries. The
file's data blocks are not read, not written, not touched.

Watch it, if you installed `strace`:

```bash
cd /tmp
echo hello > a.txt
strace -e trace=rename,renameat,renameat2 mv a.txt b.txt 2>&1 | grep -i rename
rm -f b.txt
```

```
renameat2(AT_FDCWD, "a.txt", AT_FDCWD, "b.txt", 0) = 0
```

**One call.** Now the other case — moving *across* filesystems, where `rename()` is not allowed:

```bash
df /tmp /home | awk '{print $1, $6}'
```

If `/tmp` and `/home` are on different filesystems, `mv` between them must **copy then delete**,
which is why moving a large file to a USB stick takes real time while moving it across your home
directory is instant. Same command, completely different amount of work, decided by the kernel
telling `mv` that `rename()` returned `EXDEV`.

### `rm` does not erase anything

`rm` calls `unlink()`, which removes a **name**, decrements the file's link count, and returns. If
the count reaches zero *and* no process still has the file open, the space becomes reusable. The
bytes are not overwritten.

Two consequences you can demonstrate right now. First, a file with two names:

```bash
cd /tmp
echo "important" > original.txt
ln original.txt second-name.txt      # a HARD link — a second name, same file
ls -li original.txt second-name.txt  # -i shows the inode number
rm original.txt
cat second-name.txt                  # still there!
rm second-name.txt
```

```
1442903 -rw-r--r-- 2 you you 10 Sep 10 14:40 original.txt
1442903 -rw-r--r-- 2 you you 10 Sep 10 14:40 second-name.txt
important
```

Note the **same inode number** (1442903) and the **link count of 2**. `rm` removed one name; the file
survived because another name pointed at it. Volume 3 takes this apart properly.

Second, deleting a file that's still open:

```bash
cd /tmp
echo "still here" > openfile.txt
exec 3< openfile.txt      # open it on descriptor 3 in this shell
rm openfile.txt
ls openfile.txt           # gone from the directory
cat /proc/$$/fd/3         # ...but still readable through the descriptor
exec 3<&-                 # close it; NOW the space is freed
```

This is why deleting a huge log file doesn't free disk space if a daemon still has it open — a
genuinely common sysadmin surprise.

### `cp` — and the flag that matters

`cp` reads and writes. The flag worth knowing is `-a` (archive), which preserves permissions,
timestamps, symlinks and ownership where possible:

```bash
cd /tmp && mkdir -p cpdemo/sub && echo x > cpdemo/sub/f.txt
cp -a cpdemo cpdemo-copy
ls -la cpdemo/sub cpdemo-copy/sub
rm -rf cpdemo cpdemo-copy
```

Without `-a`, timestamps are reset to now and permissions are filtered through your `umask`.

## 3.5 `mkdir -p` and the trailing-slash question

```bash
mkdir /tmp/a/b/c
```

```
mkdir: cannot create directory '/tmp/a/b/c': No such file or directory
```

`mkdir` maps to one `mkdir()` syscall, which creates **one** directory and requires the parent to
exist. `-p` makes `mkdir` loop:

```bash
mkdir -p /tmp/a/b/c && tree /tmp/a 2>/dev/null || find /tmp/a
rm -rf /tmp/a
```

`-p` also makes `mkdir` succeed silently if the directory already exists, which is why it's the right
choice in scripts.

## 3.6 Wildcards, properly

You saw in §1.3 that the shell expands globs. Some details that cause real bugs:

**Dotfiles are excluded by default.**

```bash
cd /tmp && mkdir -p globtest && cd globtest
touch visible.txt .hidden.txt
echo *              # visible.txt only
echo .*             # . .. .hidden.txt  ← note . and ..!
ls -a
```

That `.*` result is the classic disaster: a naive `rm -rf .*` would try to recurse into `..`.
Modern GNU `rm` refuses to remove `.` and `..` specifically because of this, but the underlying glob
behaviour is unchanged. Use `find` for that job.

**Turn off the "no match passes through literally" behaviour** if you'd rather it be an error:

```bash
shopt -s nullglob ; echo "nullglob:" *.nope ; shopt -u nullglob
shopt -s failglob ; echo "failglob:" *.nope ; shopt -u failglob
```

```
nullglob:
bash: no match: *.nope
```

**Character classes and ranges:**

```bash
touch file1.txt file2.txt fileA.txt
echo file[0-9].txt        # file1.txt file2.txt
echo file[!0-9].txt       # fileA.txt   (! negates)
echo file?.txt            # all three   (? = exactly one character)
```

**Brace expansion is not globbing** — it generates strings whether or not they exist:

```bash
echo backup-{2023,2024,2025}.tar.gz     # all three, none of which exist
echo {1..5}                              # 1 2 3 4 5
echo {a..e}                              # a b c d e
mkdir -p project/{src,docs,tests}        # genuinely useful
ls project
```

Clean up:

```bash
cd /tmp && rm -rf /tmp/globtest
```

**And the filename that ruins your day:** a file whose name begins with `-`.

```bash
cd /tmp
touch ./-rf
ls
rm -rf              # ← does nothing useful; rm thinks it's flags
rm ./-rf            # correct: force it to be a path
# or:  rm -- -rf    ( -- means "no more options" )
```

This is a real hazard when filenames come from untrusted input, and it is the small version of
Chapter 7's incident.

---

# Chapter 4 — Reading Files, and Why `less` Is Called That

## 4.1 `cat` — the name is the clue

> **THE PROBLEM.** You have three files and want them joined into one.

`cat` is short for **concatenate**, and that is its actual job:

```bash
cd /tmp
echo "part one"   > p1.txt
echo "part two"   > p2.txt
echo "part three" > p3.txt
cat p1.txt p2.txt p3.txt > whole.txt
cat whole.txt
rm p1.txt p2.txt p3.txt whole.txt
```

Using it to display a single file is a **side effect** of that job: given one file and no
redirection, it copies that file to stdout, which happens to be your screen.

> **The Useless Use of Cat Award.** In the early 1990s on `comp.unix.shell`, Randal L. Schwartz began
> handing out a mock award for constructs like `cat file | grep pattern` — where `grep file` does the
> same thing with one fewer process. It's a joke with a real point: `cat file | cmd` forks an extra
> process and adds a pipe for no benefit, when almost every Unix tool takes a filename directly.
>
> **Confidence: moderate-high** on Schwartz and the newsgroup; the term "UUOC" is well established.

```bash
cat /etc/passwd | grep root      # UUOC
grep root /etc/passwd            # better
grep root < /etc/passwd          # also fine — the SHELL opens the file, not grep
```

That third form is worth pausing on: the shell opens the file and hands `grep` a descriptor. `grep`
never learns the filename. It's the §2.6 mechanism again.

## 4.2 `head` and `tail` — bounded reading

> **THE PROBLEM.** Your log file is 4 GB. You want the last twenty lines.

```bash
head -5 /etc/services         # first 5 lines
tail -5 /etc/services         # last 5
head -c 100 /bin/ls | xxd | head   # first 100 BYTES, hexdumped
```

`tail`'s real power is `-f`, which **doesn't exit** — it keeps the file open and prints new data as it
arrives:

```bash
# In one terminal:
tail -f /var/log/syslog
# (Ctrl+C to stop. If that file doesn't exist on your system, see §5.4 —
#  Debian 12 may be using the systemd journal instead: journalctl -f)
```

`tail -F` (capital) additionally handles the file being rotated and recreated, which matters for logs.

## 4.3 `less` — the name, the history, and the actual reason

> **THE PROBLEM.** `cat` on a 10,000-line file scrolls it all past you at terminal speed. You need to
> stop, read, and go back.

The first answer was **`more`**, written by Daniel Halbert at UC Berkeley around 1978, shipped in
3BSD. It paused every screenful and waited for you to press space.

> **Confidence: moderate.** The attribution to Halbert and the ~1978 date are widely and consistently
> cited, but this is exactly the era where secondary sources copy each other.

**`more` had a hard limitation: it could only go forward.** It was built around the idea of streaming
— read a screenful, show it, read the next. If you scrolled past the thing you wanted, your only
option was to quit and start over.

**`less`** was written by **Mark Nudelman** in the mid-1980s to fix that. It buffers what it has read,
so it can scroll **backwards**, search in both directions, and jump to arbitrary positions — while
*still* being able to start displaying a file before reading all of it.

> **Confidence: moderate on the dates** (first versions are generally placed around 1983–1985);
> **high** that Nudelman is the author and still maintains it.

**The name is a joke.** "Less is more" — the architectural aphorism — inverted, because `less` does
*more* than `more`. The usual phrasing of the joke is "less is more, more or less."

You have both. Compare them:

```bash
more /etc/services      # space to page, q to quit — try scrolling UP. You can't.
less /etc/services      # arrows, PgUp/PgDn, /search, ?search-backwards, g, G, q
```

Useful `less` keys:

| Key | Does |
|---|---|
| `Space` / `b` | forward / **backward** one screen |
| `g` / `G` | jump to start / end of file |
| `/pattern` then `n` / `N` | search forward, next / previous match |
| `?pattern` | search **backward** |
| `&pattern` | show **only** matching lines |
| `F` | follow, like `tail -f` — and Ctrl+C returns to normal browsing |
| `-N` then Enter | toggle line numbers |
| `q` | quit |

### The Debian-specific bit: `lesspipe`, and why `less` reads compressed files

Try this, which should not work and does:

```bash
less /usr/share/doc/bash/changelog.Debian.gz
```

That's a **gzip-compressed** file and you're reading it as text. `less` did not learn to decompress
things. Look in your `~/.bashrc`:

```bash
grep -n lesspipe ~/.bashrc
```

```
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"
```

This sets `LESSOPEN`, an input preprocessor. When `less` opens a file, it runs that filter first.
See it:

```bash
echo "$LESSOPEN"
dpkg -S /usr/bin/lesspipe
```

It handles far more than gzip:

```bash
less /var/cache/apt/archives/*.deb 2>/dev/null | head -20   # if any .deb is cached
# also works on .tar.gz, .zip, .pdf (if tools installed), images, and more
```

> **Confidence: high** that Debian ships `lesspipe` and wires it into the default `~/.bashrc`;
> **moderate** on which package provides it, which your own `dpkg -S` output settles.

Debian also has a general mechanism for "run the user's preferred tool" — the **`sensible-utils`**
package:

```bash
dpkg -L sensible-utils | grep bin
sensible-pager /etc/services      # respects $PAGER, falls back sensibly
```

`sensible-pager`, `sensible-editor` and `sensible-browser` are Debian's own, and packages use them so
that scripts don't hardcode `vi`. It's a small thing that tells you a lot about Debian's culture:
a policy problem (packages disagreeing about your editor) solved with a shared tool rather than a
convention nobody follows.

---

# Chapter 5 — Getting Help, the Debian Way

## 5.1 The hook

> **Why does `man passwd` show you a command, but there is also a documented file format called
> `passwd`? How does one command serve both?**

## 5.2 Manual sections — the numbering is not decoration

The manual is divided into numbered sections, and the same name can appear in several:

| Section | Contains | Example |
|---|---|---|
| **1** | User commands | `man 1 passwd` — the program |
| **2** | System calls (the kernel interface) | `man 2 fork`, `man 2 execve` |
| **3** | Library functions (mostly C) | `man 3 printf` |
| **4** | Special files, devices | `man 4 tty`, `man 4 random` |
| **5** | **File formats** | `man 5 passwd` — `/etc/passwd`'s layout |
| **6** | Games | `man 6 sl`, if you install it |
| **7** | Conventions, overviews, misc | `man 7 glob`, `man 7 signal`, `man 7 hier` |
| **8** | System administration | `man 8 mount`, `man 8 apt` |

Try the example that motivates the whole scheme:

```bash
man 1 passwd     # "change user password"
man 5 passwd     # "the password file" — the format of /etc/passwd
```

Two completely different documents. Without sections there would be no way to ask for the second.

Find everything by a name:

```bash
man -f passwd        # or: whatis passwd
man -k firewall      # or: apropos firewall  — search all descriptions
```

If `apropos` says "nothing appropriate," the index needs building:

```bash
sudo mandb
```

Some sections are worth browsing purely for education:

```bash
man 7 hier           # the Filesystem Hierarchy — a preview of Volume 3
man 7 signal         # every signal and its number — preview of Volume 2
man 2 execve         # the syscall from §2.7, documented properly
man 7 glob           # the wildcard rules from §3.6
```

## 5.3 `--help`, and why it isn't the same thing

```bash
ls --help | head -20
```

`--help` is a **convention**, not a standard. It's implemented by each program individually — which
is why some programs use `-h`, some use `-?`, and a few (older ones especially) have none at all. Man
pages, by contrast, are a required part of a Debian package.

For GNU tools, there's a third layer: **info**, GNU's hypertext documentation format, which is often
much more complete than the man page.

```bash
sudo apt install info      # if not present
info coreutils 'ls invocation'
```

Bash is the standout example: `man bash` is enormous but terse; `info bash` is a full manual.

## 5.4 What Debian requires that other distributions don't

This is where Debian's own policy shows up as something you can touch.

**Debian Policy requires every package to install documentation at `/usr/share/doc/<package>/`,
including a `copyright` file.** Not "encourages" — requires, as a condition of being in the archive.

```bash
ls /usr/share/doc/bash/
```

```
changelog.Debian.gz  changelog.gz  copyright  examples  README.abs-guide  ...
```

| File | What it is |
|---|---|
| **`copyright`** | The licence and full copyright attribution. **Mandatory** under Debian Policy. |
| **`changelog.Debian.gz`** | The *Debian maintainer's* changelog — what Debian changed and why |
| **`changelog.gz`** | The **upstream** author's changelog, if different |
| **`README.Debian`** | Debian-specific notes: quirks, deviations from upstream, local config |
| **`NEWS.Debian.gz`** | Things you must read before upgrading |
| `examples/` | Sample configs, sample scripts |

Read a real one — this is genuinely useful and almost nobody does it:

```bash
zless /usr/share/doc/bash/changelog.Debian.gz
less /usr/share/doc/bash/copyright
ls /usr/share/doc/ | wc -l         # how many packages, roughly
```

> **Confidence: high.** The `copyright` file requirement is Debian Policy §12.5 and the changelog
> requirement §12.7. This is a real, enforced difference — it's part of why Debian can make strong
> claims about the licensing status of everything it ships, which Volume 4 develops.

**`README.Debian` is the file to check when something behaves unexpectedly**, because it's where the
maintainer records "we patched this" or "the config file lives somewhere different here":

```bash
find /usr/share/doc -name 'README.Debian*' 2>/dev/null | head -20
```

**And the policy itself is a package:**

```bash
apt show debian-policy 2>/dev/null | head
# sudo apt install debian-policy
# then: /usr/share/doc/debian-policy/
```

Debian is the only major distribution whose technical rules are written down as a formal, versioned,
citable document that maintainers are *bound by*. Volume 4 covers the governance around it.

Finally, which package does a file come from, and what files does a package own:

```bash
dpkg -S /usr/bin/less        # which package owns this file?
dpkg -L less | head -20      # what files does this package own?
```

---

# Chapter 6 — Environment, `.bashrc`, and What `$PATH` Really Does

## 6.1 The hook

> **Why does the thing you added to `~/.bashrc` work in your terminal, but not when you run the same
> command over SSH, or from a cron job, or from a desktop launcher?**

This confuses everyone once, and the answer is that bash reads **different files depending on how it
was started**, and there are three cases.

## 6.2 Three kinds of shell

| Kind | When | Reads |
|---|---|---|
| **Login shell** | console login, `ssh host`, `su -`, `bash -l` | `/etc/profile`, then the **first** of `~/.bash_profile`, `~/.bash_login`, `~/.profile` |
| **Interactive non-login** | opening a terminal window in a desktop session, or typing `bash` | `/etc/bash.bashrc`, then `~/.bashrc` |
| **Non-interactive** | running a script, a cron job, `ssh host command` | **neither** (unless `$BASH_ENV` is set) |

Find out which you're in right now:

```bash
shopt -q login_shell && echo "login shell" || echo "NOT a login shell"
[[ $- == *i* ]] && echo "interactive" || echo "non-interactive"
```

In a desktop terminal you'll typically see "NOT a login shell" and "interactive" — so **only
`~/.bashrc` was read.** Over SSH you'd get "login shell", so `~/.profile` was read.

### Debian's two relevant choices here

**First**, Debian's default `~/.profile` explicitly sources `~/.bashrc`:

```bash
cat ~/.profile
```

```sh
# if running bash
if [ -n "$BASH_VERSION" ]; then
    # include .bashrc if it exists
    if [ -f "$HOME/.bashrc" ]; then
	. "$HOME/.bashrc"
    fi
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/bin" ] ; then
    PATH="$HOME/bin:$PATH"
fi
```

This is why things in `.bashrc` mostly "just work" for login shells too — Debian wired it up on
purpose. It also means **`~/bin` is automatically on your `$PATH` if you create it**, which is the
correct place for your own scripts.

**Second**, Debian patches bash to read a **system-wide** `/etc/bash.bashrc` for interactive
non-login shells. Upstream bash has no such file.

```bash
ls -l /etc/bash.bashrc
head -20 /etc/bash.bashrc
```

> **Confidence: high** that `/etc/bash.bashrc` is a Debian addition (inherited by Ubuntu and other
> derivatives) rather than upstream bash behaviour.

### The rule that follows

> **Environment variables and `$PATH` go in `~/.profile`.** They're inherited by children, so setting
> them once at login is enough — and it means graphical applications launched from your desktop see
> them too.
>
> **Aliases, functions, prompt settings, and shell options go in `~/.bashrc`.** They are *not*
> inherited (§6.4), so they have to be re-established in every interactive shell.

The classic symptom of getting this backwards: you put `export PATH=...` in `.bashrc`, and it works in
your terminal but your desktop launcher, cron job, and `ssh host command` all disagree.

## 6.3 What an environment variable *is*

Not a shell concept. A **kernel** one.

When bash calls `execve()`, the third argument is `envp` — an array of `KEY=VALUE` strings. The
kernel copies that array into the new process's memory. That's the whole mechanism.

You can read it out of a live process:

```bash
tr '\0' '\n' < /proc/$$/environ | head -20
```

That is bash's actual environment block, NUL-separated, as the kernel stored it. Compare with what
bash *reports*:

```bash
diff <(tr '\0' '\n' < /proc/$$/environ | sort) <(env | sort) | head
```

They should be nearly identical — because `env` is just a program printing its own inherited `envp`.

Now look at a different process:

```bash
sleep 300 &
tr '\0' '\n' < /proc/$!/environ | head -5
kill %1
```

## 6.4 `export`, demonstrated

> **THE PROBLEM.** You set a variable. Your script doesn't see it. Why?

Because a shell variable and an environment variable are different things, and `export` is what
promotes one to the other:

```bash
FOO=hello
echo "in this shell: [$FOO]"
bash -c 'echo "in a child:    [$FOO]"'

export FOO
bash -c 'echo "after export:  [$FOO]"'
```

```
in this shell: [hello]
in a child:    []
after export:  [hello]
```

Now watch it cross the `execve()` boundary, in the kernel's own copy. **You have to look at a
child's environment, not your own** — and the reason why is worth a moment:

```bash
# Does an un-exported variable reach a child's kernel-visible environment?
FOO=hello
bash -c 'tr "\0" "\n" < /proc/$$/environ | grep "^FOO=" || echo "FOO: ABSENT from child environ"'

export FOO
bash -c 'tr "\0" "\n" < /proc/$$/environ | grep "^FOO="'
unset FOO
```

```
FOO: ABSENT from child environ
FOO=hello
```

The un-exported variable **never made it into the array the kernel copied into the child.** It lived
only in bash's own memory and died with bash.

> **A subtlety I got wrong the first time, so it's worth flagging.** You might expect to check this
> by grepping *your own* `/proc/$$/environ` before and after `export`. That doesn't work:
>
> ```bash
> BAR=x; export BAR
> tr '\0' '\n' < /proc/$$/environ | grep '^BAR=' || echo "not there!"
> unset BAR
> ```
>
> `/proc/PID/environ` shows the region the kernel recorded **at `execve()` time** — a snapshot of
> what this process was *born* with. Later `export` calls update bash's own internal copy, which is
> what gets handed to the *next* child, but they don't rewrite that original region. So the only way
> to observe an export is to look at a child. **Verified on a live system rather than assumed.**

Note also: **inheritance is one-way.** A child can never modify its parent's environment — the same
reasoning that made `cd` a builtin in §3.2.

```bash
export COUNTER=1
bash -c 'export COUNTER=999'
echo "$COUNTER"      # still 1
unset COUNTER
```

## 6.5 `$PATH`, and what "command not found" really means

You saw the search in §2.5. Here is what it looks like when it fails, and what Debian does about it.

```bash
nosuchthing
```

```
bash: nosuchthing: command not found
```

Bash walked every directory in `$PATH`, looked for `nosuchthing`, found nothing executable, and gave
up with status 127.

### Debian's `command_not_found_handle`

Before giving up, bash calls a **shell function named `command_not_found_handle`** if one is defined.
Debian ships a package that defines it:

```bash
type command_not_found_handle 2>/dev/null || echo "no handler installed"
```

If it's installed, a missing command gets you a suggestion instead of a bare error:

```
Command 'htop' not found, but can be installed with:
apt install htop
```

To try it:

```bash
sudo apt install command-not-found
sudo update-command-not-found      # builds the package-contents database
# open a new shell, then:
htop
```

> **Confidence: moderate-high.** The `command-not-found` package exists in Debian and hooks bash this
> way. The exact helper command to refresh its database has changed over releases — check
> `/usr/share/doc/command-not-found/` if it doesn't behave as described.

This is a nice illustration of the whole book's theme: **bash provides a hook, Debian provides a
package that uses it, and neither one had to know about the other.**

### Why `ifconfig` "doesn't exist" for you but does for root

```bash
cat /etc/profile
```

```sh
if [ "$(id -u)" -eq 0 ]; then
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
else
  PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games"
fi
export PATH
```

**Regular users don't get `/sbin` or `/usr/sbin` on their `$PATH`.** Those directories hold
administrative tools that generally require root anyway, so leaving them off keeps them out of tab
completion and out of typo range.

Which produces this confusing pair:

```bash
shutdown            # bash: shutdown: command not found
/usr/sbin/shutdown --help | head -3   # exists perfectly well
```

The program was always there. It just wasn't on your search path.

> **Confidence: moderate-high** on this being current Debian `/etc/profile` behaviour, but Debian is
> in the middle of merging `/usr/sbin` into `/usr/bin` across releases, so **your own `cat
> /etc/profile` is the authority**, not this book.

### Inspect and repair your `$PATH`

```bash
echo "$PATH" | tr ':' '\n' | nl        # numbered, one per line
echo "$PATH" | tr ':' '\n' | grep -n '^$'   # find EMPTY elements — these mean "."!

# which directories on your PATH don't actually exist?
echo "$PATH" | tr ':' '\n' | while read -r d; do
    [ -d "$d" ] || echo "MISSING: $d"
done
```

An empty element (from a stray `:` at the start, end, or doubled in the middle) silently means
"search the current directory," which reintroduces the trojan risk from §2.5. Worth checking once.

---

# Chapter 7 — The Incident: Shellshock

## 7.1 The hook

> Everything in Chapter 2 was about bash taking a string and **parsing** it into commands. Here is
> the uncomfortable question that follows:
>
> **What if some of that string didn't come from you?**

## 7.2 THE PROBLEM: a feature nobody thought about for twenty-five years

Bash can export **functions**, not just variables, to child processes. You use it like this:

```bash
greet() { echo "hello from an exported function"; }
export -f greet
bash -c 'greet'
```

```
hello from an exported function
```

Useful, occasionally. The question is: **how?** `execve()` (§2.7) only carries an array of
`KEY=VALUE` strings. There is no "function" slot. So bash smuggled functions through the environment
by encoding them as ordinary variables whose **value began with `() {`**.

On startup, bash scanned its inherited environment, and for every variable whose value started with
that marker, **it parsed the value as a function definition.**

**The bug:** bash used its ordinary parser, and having read the function definition, it **kept
going** — executing anything that followed the closing brace, immediately, at startup, before the
shell did anything else.

That's it. That's Shellshock.

```
env  x='() { :;}; echo VULNERABLE'  bash -c 'echo test'
          └───┬───┘└──────┬───────┘
        looks like a     ...and bash executed THIS TOO,
        function          at startup, no questions asked
        definition
```

The vulnerable code is generally reported to date from around **1989** — roughly the very first
releases of bash, written by Brian Fox for the GNU Project. It sat there for about twenty-five
years.

> **Confidence: moderate-high** on the ~1989 origin and the ~25-year figure, which were widely
> reported at disclosure and repeated by bash's maintainer.

## 7.3 THE MECHANISM: why this was catastrophic and not just embarrassing

A bug that requires you to already be able to set environment variables in a shell you're about to
run sounds unexciting. It was rated maximum severity, and the reason is a chain of entirely
reasonable design decisions from earlier in this book.

**Recall §2.7: the environment survives `execve()`.** That is a *feature*. It's how `$PATH`,
`$HOME`, `$LANG` and everything else propagate. Nobody has to do anything to make it work.

**Now recall how CGI works.** When a web server runs a CGI script, the CGI specification says it
should pass the HTTP request's headers to the script **as environment variables**, upper-cased and
prefixed with `HTTP_`. So an incoming header:

```
User-Agent: Mozilla/5.0
```

becomes, in the CGI process's environment:

```
HTTP_USER_AGENT=Mozilla/5.0
```

**And an enormous number of CGI scripts were shell scripts, or invoked shell scripts, or invoked
`system()`, which runs `/bin/sh`.**

Put the three facts together:

```
   ATTACKER                    WEB SERVER                      BASH
      │                            │                             │
      │  GET /cgi-bin/status       │                             │
      │  User-Agent: () { :;};     │                             │
      │      /bin/cat /etc/passwd  │                             │
      ├───────────────────────────►│                             │
      │                            │ sets                        │
      │                            │ HTTP_USER_AGENT="() { :;};  │
      │                            │      /bin/cat /etc/passwd"  │
      │                            │ then forks + execs the      │
      │                            │ CGI script                  │
      │                            ├────────────────────────────►│
      │                            │                             │ bash starts,
      │                            │                             │ scans environ,
      │                            │                             │ sees "() {",
      │                            │                             │ parses...
      │                            │                             │ and RUNS the
      │                            │                             │ trailing command
      │                            │                             │
      │   ◄────────────────────────┴─────────────────────────────┤
      │   the contents of /etc/passwd
```

**Unauthenticated remote code execution, in one HTTP header, with no exploit code — just a string.**
No memory corruption, no shellcode, no ROP chain. You typed a header and the server ran your command.

Other affected paths, all for the same reason — something puts untrusted data into the environment
and then a shell runs:

| Vector | How the data gets into the environment |
|---|---|
| **CGI** (Apache `mod_cgi`, `mod_cgid`) | HTTP headers → `HTTP_*` variables. **The big one.** |
| **DHCP clients** | a hostile DHCP server's option strings passed to `dhclient` hook scripts |
| **OpenSSH `ForceCommand`** | `command=` in `authorized_keys` — the original command lands in `SSH_ORIGINAL_COMMAND`, limiting an already-authenticated user's restriction |
| **CUPS**, **qmail**, various setuid wrappers | anything invoking a shell with attacker-influenced environment |

The DHCP one deserves a moment: connect a laptop to a hostile wireless network, and the DHCP server
could run commands as root on your machine, before you'd opened a browser.

## 7.4 The timeline, and the part that's most instructive

| Date | Event |
|---|---|
| ~12 Sep 2014 | **Stéphane Chazelas**, a Unix/Linux specialist in the UK, discovers the flaw and reports it privately to the bash maintainer |
| 12–24 Sep 2014 | Coordinated embargo; distributions prepare patches |
| **24 Sep 2014** | Public disclosure as **CVE-2014-6271**. Debian issues a security advisory the same day |
| **within ~24 hours** | **Tavis Ormandy** (Google) demonstrates the patch is **incomplete** → **CVE-2014-7169** |
| following days | Fuzzing by Michał Zalewski and others finds more parser bugs: **CVE-2014-7186**, **CVE-2014-7187**, **CVE-2014-6277**, **CVE-2014-6278** |
| within days | Mass exploitation observed in the wild; botnets scanning for `/cgi-bin/` |

> **Confidence: high** on Chazelas as the discoverer, the 24 September 2014 disclosure date, the CVE
> numbers, and Ormandy finding the incomplete fix within about a day. **Moderate** on the exact
> Debian advisory numbers (DSA-3032-1 and a follow-up are the usually-cited ones) — check
> `security-tracker.debian.org` if you need to cite them.

**The most instructive part is not the original bug. It's that the first fix was wrong.**

The initial patch tried to make the parser stop at the end of the function definition. Ormandy showed
within a day that you could still get out. That is the signature of trying to **patch a parser**
rather than remove the ambiguity.

## 7.5 The actual fix — and you can see it on your machine right now

The eventual fix was not a better parser. It was to **change the encoding so that attacker-controlled
variable names can no longer produce a function-carrying variable at all.**

Before Shellshock, exporting a function called `greet` created an environment variable literally
named `greet`. After the fix, it creates one named `BASH_FUNC_greet%%`.

Look at it:

```bash
greet() { echo hi; }
export -f greet
bash -c 'tr "\0" "\n" < /proc/$$/environ | grep -i BASH_FUNC'
unset -f greet
```

```
BASH_FUNC_greet%%=() {  echo hi
```

**That is the Shellshock fix, visible in your own process's memory.** *(Verified on a live system
while writing this.)*

Why it works: a CGI server turns the header `User-Agent` into `HTTP_USER_AGENT`. It cannot produce a
variable named `BASH_FUNC_anything%%`, because `%` is not a legal character in an HTTP header name
and the `HTTP_` prefix is forced. The **namespace was separated**, so data can no longer be mistaken
for code.

> **The generalisable lesson, and it's the one worth carrying out of this volume:** the original bug
> was that **the boundary between "data" and "code" was a string prefix**. Anything starting with
> `() {` became code. The fix was not to parse more carefully — it was to make the boundary
> structural, so that untrusted input **cannot express** the thing you don't want it to express.
>
> Every time you write `eval`, or build a shell command by string concatenation, or pass user data
> into a `system()` call, you are re-creating exactly this bug shape.

### Check your own machine

```bash
env x='() { :;}; echo VULNERABLE' bash -c 'echo "test complete"'
```

| Output | Means |
|---|---|
| `test complete` (possibly with a warning) | **patched** — the function-shaped variable was ignored |
| `VULNERABLE` then `test complete` | vulnerable — you are running something ten years out of date |

On any supported Debian this will show `test complete`. Confirm your bash's provenance:

```bash
dpkg -l bash | tail -1
apt changelog bash 2>/dev/null | head -20    # needs network; shows Debian's own changelog
```

## 7.6 The everyday version: Steam, January 2015

Shellshock is the dramatic one. Here is the one that will actually happen to you, and it is a direct
consequence of §2.4's expansion order.

Valve's Steam client for Linux shipped a shell script containing, in effect:

```sh
rm -rf "$STEAMROOT/"*
```

That looks careful. The variable is quoted. What could go wrong?

**`STEAMROOT` could be empty.** It was set by something like `STEAMROOT="$(cd "${0%/*}" && echo "$PWD")"`
— and if that `cd` failed, the assignment produced an empty string. Then:

```sh
rm -rf "$STEAMROOT/"*      →      rm -rf "/"*      →      rm -rf /bin /boot /etc /home ...
```

Users reported losing their entire home directory, and — because the glob matched everything at the
root — **anything else they had write access to, including mounted external and network drives.**

> **Confidence: high** that this happened and was publicly reported in January 2015 against
> `steam-for-linux`; **moderate** on the exact line of script, which was described slightly
> differently in different reports and subsequently patched.

Walk through why quoting didn't save it, using §2.4's ordering:

| Step | What happens |
|---|---|
| 3. Variable expansion | `"$STEAMROOT/"` → `"/"` — **the quotes worked perfectly.** They protected an empty string. |
| 4. Word splitting | suppressed by the quotes, correctly |
| 5. **Pathname expansion** | `*` is **outside** the quotes, so it globs — against `/` |

**Quoting protects you from word splitting. It does not protect you from the variable being empty.**
Those are different failure modes and the second one is the one that deletes your disk.

### The three habits that prevent it

```bash
set -u                              # error on any unset variable
: "${STEAMROOT:?STEAMROOT not set}"  # explicit assertion with a message
cd "$STEAMROOT" || exit 1            # ALWAYS check that cd succeeded
```

Demonstrate `set -u` safely — no `rm` involved:

```bash
bash -c 'set -u; echo "value is [${NOPE}]"; echo "we should never get here"'
```

```
bash: line 1: NOPE: unbound variable
```

The script **stopped**. That single line would have prevented the Steam bug entirely.

And the parameter-expansion assertion form, which is even more explicit:

```bash
bash -c 'ROOT=""; : "${ROOT:?refusing to run with an empty ROOT}"; echo unreachable'
```

```
bash: line 1: ROOT: refusing to run with an empty ROOT
```

> **The pattern to internalise.** Shellshock and the Steam bug look unrelated — one is a remote code
> execution in a parser, one is a deleted home directory. They are the same shape: **a string that
> was assumed to have a certain form turned out not to, and the shell did exactly what it was told
> with the string it actually got.** The shell has no concept of what you meant.

---

# TRY THIS ON YOUR MACHINE

Six things that make Volume 1's machinery visible. Everything here is safe on a single-user laptop,
uses only `/tmp` and your own home directory, and is reversible. Nothing needs a reboot, a second
machine, or root except where explicitly noted.

---

## 1. Watch bash fork and exec, in real time

**Needs:** `sudo apt install strace`

```bash
strace -f -e trace=clone,clone3,execve,wait4 -o /tmp/fork.log \
    bash -c 'ls /etc/hostname'
grep -E 'clone|execve|wait4' /tmp/fork.log
```

**What you should see:** an `execve("/usr/bin/bash", ...)` at the top (bash itself starting), then a
`clone`/`clone3` returning a new PID, then — *in the child* — `execve("/usr/bin/ls", ["ls", ...])`,
then the parent sitting in `wait4()` until the child exits.

**Why it's interesting:** this is literally §2.6 and §2.7 happening. You can see the exact moment the
process splits in two, and the exact moment one half stops being bash and starts being `ls`. Note
that the child keeps the **same PID** across `execve` — the process didn't get replaced, its *program*
did.

Try it with a pipeline to see two children:

```bash
strace -f -e trace=clone,clone3,execve,pipe2 -o /tmp/pipe.log \
    bash -c 'ls /etc | wc -l'
grep -E 'pipe2|clone|execve' /tmp/pipe.log
rm -f /tmp/fork.log /tmp/pipe.log
```

You'll see **one `pipe2()` call**, then two clones — the shell building the plumbing from §1.4 by
hand.

---

## 2. Prove `cd` cannot possibly be a program

**Needs:** nothing.

```bash
mkdir -p /tmp/fakebin
printf '#!/bin/sh\ncd "$1"\necho "the CHILD is now in: $(pwd)"\n' > /tmp/fakebin/mycd
chmod +x /tmp/fakebin/mycd

echo "parent before: $(pwd)"
/tmp/fakebin/mycd /etc
echo "parent after:  $(pwd)"

rm -rf /tmp/fakebin
```

**What you should see:** the child reports `/etc`. The parent reports the same directory both times.

**Why it's interesting:** you've just demonstrated, in five lines, why a whole category of commands
(`cd`, `export`, `exit`, `source`, `ulimit`) *must* be shell builtins. It isn't a convenience
decision — a child process has no mechanism to reach into its parent, and that's a security property,
not a limitation. Compare `type cd` with `type ls` and the difference stops being arbitrary.

---

## 3. Turn off the kernel's line discipline and watch `cat` get raw keystrokes

**Needs:** nothing. **Reversible with `stty sane`** — and if you somehow get stuck, closing the
terminal window always works.

```bash
stty -a | tr ';' '\n' | grep -E 'icanon|echo|intr'   # note the current state
stty -icanon min 1 time 0
cat
```

Now type some characters — **each appears the instant you press it, without Enter.** Press Backspace:
you'll see a control character or nothing useful, rather than a deletion. Press Ctrl+C to stop `cat`,
then:

```bash
stty sane
```

**What you should see:** in canonical mode, `cat` receives nothing until you press Enter, and
Backspace silently edits the line before `cat` ever sees it. In non-canonical mode, `cat` gets every
keystroke immediately and Backspace is just a byte.

**Why it's interesting:** `cat` has no editing code, and never did. **The kernel was doing your line
editing.** Every program on the system gets Backspace, Ctrl+U and Ctrl+C for free, from a layer none
of them know about. And it explains a thing you've probably noticed without asking about: when a
program crashes and leaves your terminal in a weird state, `stty sane` fixes it because it's putting
that kernel layer back.

---

## 4. Shadow a system command on your own `$PATH`

**Needs:** nothing. Fully reversible.

```bash
mkdir -p ~/bin
cat > ~/bin/date <<'EOF'
#!/bin/sh
echo "This is definitely not the real date command."
EOF
chmod +x ~/bin/date

PATH="$HOME/bin:$PATH"      # prepend — this shell only
date                        # ← yours
command -v date             # where bash found it
/usr/bin/date               # the real one, by full path
type -a date                # BOTH, in resolution order

hash -r                     # clear bash's command cache
rm ~/bin/date               # remove yours
exec bash                   # fresh shell, original PATH
date                        # normal again
```

**What you should see:** `date` runs your script; `type -a date` lists both, yours first.

**Why it's interesting:** two things at once. First, `$PATH` order is a real, exploitable priority
system — which is exactly why `.` isn't on it (§2.5), and why a writable directory early in root's
`$PATH` is a privilege escalation. Second, `type -a` shows you bash's whole resolution chain, which
is the single most useful debugging command when something runs and you don't know what.

> Note that Debian's `~/.profile` adds `~/bin` to your `$PATH` automatically **if the directory
> exists** (§6.2). So after this exercise, `~/bin` may stay on your path in new login shells — which
> is fine and is the intended place for your own scripts. Check with `grep -A2 'private bin'
> ~/.profile`.

---

## 5. Read a running process's environment out of kernel memory

**Needs:** nothing.

```bash
# your own shell's environment, as the kernel recorded it at exec time
tr '\0' '\n' < /proc/$$/environ | sort | head -20

# now a DIFFERENT process
sleep 300 &
echo "watching PID $!"
tr '\0' '\n' < /proc/$!/environ | wc -l
ls -l /proc/$!/cwd /proc/$!/exe
kill %1
```

Then the export boundary, which needs a child (see the note in §6.4):

```bash
SECRET=hunter2
bash -c 'tr "\0" "\n" < /proc/$$/environ | grep "^SECRET=" || echo "not inherited"'
export SECRET
bash -c 'tr "\0" "\n" < /proc/$$/environ | grep "^SECRET="'
unset SECRET
```

**What you should see:** `not inherited`, then `SECRET=hunter2`.

**Why it's interesting:** `/proc/PID/environ` is not a file — it's a window the kernel opens onto
another process's memory. You are watching `execve()`'s third argument, as stored. And it makes a
security point concrete: **environment variables are not secret.** Any process you can signal, you
can generally read the environment of. This is why passing credentials via environment variables is
discouraged, and why `ps` deliberately doesn't show them by default.

---

## 6. Debian's easter eggs (yes, these are real)

**Needs:** `aptitude` for the second one. Harmless.

```bash
apt moo
```

```
                 (__)
                 (oo)
           /------\/
          / |    ||
         *  /\---/\
            ~~   ~~
..."Have you mooed today?"...
```

This is a genuine, long-standing easter egg in APT. Then the escalating version:

```bash
sudo apt install aptitude
aptitude moo
aptitude -v moo
aptitude -vv moo
aptitude -vvv moo
aptitude -vvvv moo
aptitude -vvvvv moo
aptitude -vvvvvv moo
```

**What you should see:** `aptitude moo` insists "There are no Easter Eggs in this program." Each
additional `-v` escalates the denial, until it gives up and draws a cow.

**Why it's interesting:** partly it's just good, but it's also a genuine cultural artifact. Debian's
developers have maintained these across decades and hundreds of releases, through a project that is
otherwise famously rigorous about policy. Both things are true at once, and that tells you something
real about the community you've just joined.

While you're here, a few genuinely amusing real packages:

```bash
apt show sl 2>/dev/null | head -5        # a steam locomotive for when you typo "ls"
apt show cowsay fortune-mod 2>/dev/null | grep -E '^Package|^Description' 
# sudo apt install sl cowsay fortune-mod
# then:  sl        (type it instead of ls)
#        fortune | cowsay
```

> **Confidence: high** that `apt moo` and the `aptitude moo` escalation are real and present in
> current Debian; both are long-documented. The exact wording of `aptitude`'s messages varies by
> version.

---

# Volume 1 Retrospective

**1. The shell is a program, not a feature, and that is the load-bearing decision.** The kernel does
not know what `ls` means, what `*` does, or what a pipe is as syntax. It provides `fork`, `execve`,
`pipe`, `open` and `dup2`; the shell provides everything you think of as "the command line." Which is
why you can replace it, why Debian ships six of them, and why adding pipes in 1973 required changing
zero existing programs.

**2. Wildcards are expanded by the shell before your program runs.** `ls *.txt` hands `ls` a list of
filenames; `ls` contains no wildcard code. This is why every Unix program gets globbing for free and
behaves identically, and it's the cleanest single demonstration of the layering.

**3. The path from keystroke to output has about eight layers, and the surprising one is the
kernel's line discipline.** Backspace, Ctrl+C and Ctrl+D are handled *below* every program, which is
why they work in programs that never implemented them — and why bash has to turn that layer off to
do its own line editing, then turn it back on before running anything.

**4. `fork()` then `exec()`, rather than one call, is why redirection is simple.** The child gets a
moment to be an ordinary program running ordinary syscalls before it becomes something else. Three
lines — `open`, `dup2`, `close` — give every program on the system output redirection, forever, with
no cooperation from the program.

**5. Expansion order explains most shell bugs.** Variables expand, *then* word splitting happens,
*then* globbing. Which is why `"$var"` is not optional, and why the Steam bug's careful quoting
protected against the wrong failure mode.

**6. Debian's own decisions are already visible in Volume 1.** `/bin/sh` is dash, not bash, for boot
speed — and that will break `#!/bin/sh` scripts containing bashisms. `/bin` is a symlink to
`/usr/bin`. Regular users don't get `/sbin` on `$PATH`. Every package ships a mandatory `copyright`
file and a `changelog.Debian.gz` under `/usr/share/doc/`. `lesspipe` is wired into the default
`.bashrc`. None of these are "Linux" facts.

**7. Shellshock and the Steam `rm -rf` are the same bug shape.** A string was assumed to have a form
it didn't have, and the shell did precisely what it was told with the string it actually received. In
one case the boundary between data and code was a string prefix; in the other it was an assumption
that a variable was non-empty. **The shell has no idea what you meant.**

---

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
