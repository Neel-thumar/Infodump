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

