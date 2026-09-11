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

