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

