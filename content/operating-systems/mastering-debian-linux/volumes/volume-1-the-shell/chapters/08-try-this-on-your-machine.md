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

