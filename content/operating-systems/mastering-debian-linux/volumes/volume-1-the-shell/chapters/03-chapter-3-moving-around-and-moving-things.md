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

