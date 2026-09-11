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

