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

