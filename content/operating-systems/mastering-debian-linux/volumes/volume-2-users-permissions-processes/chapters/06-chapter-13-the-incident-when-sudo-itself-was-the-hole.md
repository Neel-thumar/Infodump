# Chapter 13 — The Incident: When `sudo` Itself Was the Hole

## 13.1 The hook

> **`sudo` is one of the most heavily audited programs in existence.** It is setuid root, it is
> installed on essentially every Linux system, it is deliberately small, and it has been reviewed for
> forty years.
>
> **In January 2021 it was discovered that a bug had been sitting in it since July 2011 — ten years
> — that let any local user become root. You didn't need to be in `sudoers`. You didn't need any
> `sudo` privileges at all.**

## 13.2 CVE-2021-3156, "Baron Samedit"

> **Confidence: high** on the CVE number, the January 2021 disclosure by the Qualys Research Team,
> the ten-year window, and the impact. **Moderate** on my rendering of the exact C code below, which
> I am reconstructing rather than quoting, and on the Debian advisory number.

The name is Qualys's pun on Baron Samedi, the loa of the dead, and **`sudoedit`** — because that's
the command that reaches the bug.

| | |
|---|---|
| **Discovered by** | Qualys Research Team |
| **Disclosed** | 26 January 2021 |
| **Introduced** | July 2011, in a commit usually cited as `8255ed69` |
| **Affects** | sudo 1.8.2 – 1.8.31p2, and 1.9.0 – 1.9.5p1 |
| **Requires** | **a local shell account. Nothing else.** |
| **Gives** | **root** |
| **Debian fix** | a security advisory issued the same day (DSA-4839-1 is the commonly cited number) |

## 13.3 THE MECHANISM: an escaping loop that runs off the end of a string

This bug is worth understanding in detail, because it lives exactly in the machinery Volume 1 taught
you.

**The setup.** When you run `sudo -s` or `sudo -i`, sudo is going to hand your command to a shell.
Shell metacharacters therefore need **escaping** — a space in an argument must become `\ ` so the
shell doesn't split on it (Volume 1 §2.4's word splitting, defended against).

So sudo does two things:

1. In `parse_args()` — **escape** metacharacters in the arguments, when shell mode is set.
2. Later, in `set_cmnd()` — **un-escape** them again when building the command string for the
   sudoers policy check.

The un-escaping loop looked substantially like this:

```c
for (to = user_args, av = NewArgv + 1; (from = *av); av++) {
    while (*from) {
        if (from[0] == '\\' && !isspace((unsigned char)from[1]))
            from++;                    /* skip the backslash */
        *to++ = *from++;               /* copy the escaped character */
    }
    *to++ = ' ';
}
```

Now feed it an argument that **ends with a lone backslash**:

```
   argument in memory:      ...  'x'  '\\'  '\0'
                                        ↑
                              from points here
```

Step through it:

| Check | Result |
|---|---|
| `*from` is `'\\'` → loop body runs | ✔ |
| `from[0] == '\\'` | **true** |
| `isspace(from[1])` where `from[1]` is `'\0'` | **false** — NUL is not whitespace |
| so: `from++` | **`from` now points AT the terminating NUL** |
| then: `*to++ = *from++` | **copies the NUL and advances PAST the end of the string** |
| loop condition `while (*from)` | now reads **whatever memory follows** |

**The loop has escaped the string.** It keeps copying — past the end of the argument, through
whatever else is on the heap — writing all of it into a buffer that was sized for the original
arguments. A classic **heap buffer overflow**, with the attacker controlling both how far it runs and
what gets written.

**Why it wasn't triggered for a decade:** the escaping in step 1 normally guarantees no argument ends
in an unescaped backslash. But `sudoedit` (i.e. `sudo -e`) sets a different mode, and the combination
**`sudoedit -s`** set the shell flag while skipping the escaping — leaving the un-escaper to process
input that was never escaped.

Qualys built working exploits for Ubuntu 20.04, Debian 10, and Fedora 33.

## 13.4 Check your own machine

The check Qualys published is non-destructive — `sudoedit` just errors out either way:

```bash
sudoedit -s /
```

| Output begins with | Means |
|---|---|
| **`usage:`** | **patched** |
| **`sudoedit:`** | vulnerable |

> **Confidence: moderate-high** on this being the published check. On any currently-supported Debian
> you will see `usage:`. If you want a second opinion:

```bash
sudo --version | head -1
dpkg -l sudo | tail -1
```

## 13.5 Why this one is worth dwelling on

Three things, and they're all uncomfortable:

**1. The program whose entire purpose is guarding a boundary was the way through it.** §11.8 argued
that a setuid binary is code running with full privilege under an unprivileged user's complete
control — arguments, environment, descriptors, everything. Baron Samedit is that argument's proof:
the attack came in through **`argv`**, the most ordinary input there is, prepared by the shell exactly
as Volume 1 §2.6 described.

**2. Ten years, in the most-audited setuid binary on Linux.** Not obscure code. Not a rarely-used
feature. Reachable by a mode combination nobody had thought to test together. If that can hide for a
decade in `sudo`, the base rate for less-scrutinised setuid programs is not encouraging — which is
the real argument for shrinking the setuid list (§11.8's capabilities note) rather than auditing it
harder.

**3. Memory safety.** The bug is a C pointer walking off the end of a NUL-terminated string. It is not
a logic error, a policy mistake, or a misconfiguration — nothing in `/etc/sudoers` could have
prevented it. This is a substantial part of why there is now serious work on memory-safe
reimplementations of core system tools, including a Rust `sudo`.

> **The pattern, and it should look familiar.** Volume 1 §7.5 concluded that Shellshock's real fix
> was to make the data/code boundary **structural** rather than a matter of parsing carefully. Baron
> Samedit is the same shape one layer down: **a string was assumed to have a form (properly escaped)
> that it did not have, and the code did exactly what it was told with the bytes it actually got.**
>
> Volume 1 §7's Steam incident, Shellshock, and Baron Samedit are three instances of one bug.

## 13.6 A design-level companion: why setuid doesn't work on scripts

Not every sharp edge is a coding bug. Here is one the Unix designers had to close by **removing a
feature**, and you can observe the rule on your own machine.

Try to make a setuid shell script *(fully verified)*:

```bash
cd /tmp
printf '#!/bin/bash\necho "real=$(id -ru)  effective=$(id -u)"\n' > suid-test.sh
sudo chown root:root suid-test.sh
sudo chmod 4755 suid-test.sh          # chmod AFTER chown — §11.7
ls -l suid-test.sh
./suid-test.sh
sudo rm -f suid-test.sh
```

```
-rwsr-xr-x 1 root root 55 Sep 10 06:05 suid-test.sh
real=1000  effective=1000
```

**The `s` bit is right there in `ls`, and the kernel ignored it completely.** Compare with §11.3's
setuid copy of `id`, which gave `0` — the difference is that one is a binary and one is a script.

**Why:** Volume 1 §2.7 described the `#!` mechanism. It is a **two-step** operation:

```
   1. kernel opens the script, reads "#!/bin/bash"
   2. kernel execs /bin/bash, passing THE SCRIPT'S PATH as an argument
   3. bash then OPENS THAT PATH ITSELF
```

Between step 1 and step 3 there is a window in which **the path can be made to point at a different
file** — classically by replacing a symlink. The kernel resolved the path and granted privilege based
on file A; bash then opens the path and executes file B, **with the privilege granted for A.**

That is a time-of-check-to-time-of-use race, it is inherent to the two-step design, and it cannot be
fixed without changing how `#!` works. So **Linux simply ignores the setuid and setgid bits on
interpreted scripts.** It's documented in `execve(2)`:

```bash
man 2 execve | grep -A6 -i 'set-user-ID'
```

If you genuinely need a script to run with privilege, the answer is a `sudoers` rule for that
specific script — which puts the decision in a policy file that `visudo` will check, rather than in a
permission bit that lies to you.

---

